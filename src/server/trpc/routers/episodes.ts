import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  dailySignal,
  episode,
  episodeSummary,
  podcast,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

export const episodesRouter = createTRPCRouter({
  get: publicProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const episodeData = await ctx.db.query.episode.findFirst({
        where: and(eq(episode.id, input.episodeId)),
        with: {
          podcast: true,
          summary: true, // Include summary to check if it exists on all tabs
          // Only load speakerMapping - transcriptChunks are not used on the episode page
          // (transcript is fetched separately via transcriptUrl)
          speakerMapping: {
            columns: {
              speakerMappings: true,
              confidence: true,
            },
          },
        },
      });

      if (!episodeData) {
        throw new Error("Episode not found");
      }

      return episodeData;
    }),

  getUnprocessed: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          status: z.enum(["pending", "processing", "failed"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const status = input?.status ?? "pending";

      const rows = await ctx.db.query.episode.findMany({
        where: and(eq(episode.status, status), eq(episode.userId, ctx.user.id)),
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
        },
      });

      return rows;
    }),

  getEpisodes: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;

      const rows = await ctx.db.query.episode.findMany({
        where: and(eq(episode.userId, ctx.user.id), isNull(episode.hiddenAt)),
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
          summary: true,
        },
      });

      // Fetch signal counts for all episodes in a single query
      const episodeIds = rows.map((ep) => ep.id);

      if (episodeIds.length === 0) {
        return rows.map((ep) => ({
          ...ep,
          signalCounts: { total: 0, pending: 0 },
        }));
      }

      const signalCounts = await ctx.db
        .select({
          episodeId: transcriptChunk.episodeId,
          total: count(dailySignal.id),
          pending: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} IS NULL THEN 1 ELSE 0 END)`,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(
          and(
            eq(dailySignal.userId, ctx.user.id),
            inArray(transcriptChunk.episodeId, episodeIds),
          ),
        )
        .groupBy(transcriptChunk.episodeId);

      const signalCountMap = new Map(
        signalCounts.map((sc) => [
          sc.episodeId,
          { total: Number(sc.total), pending: Number(sc.pending) },
        ]),
      );

      return rows.map((ep) => ({
        ...ep,
        signalCounts: signalCountMap.get(ep.id) ?? { total: 0, pending: 0 },
      }));
    }),

  searchGlobal: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;

      if (!query.trim()) {
        return [];
      }

      const searchPattern = `%${query.trim()}%`;

      // Search across episodes with podcast information
      const results = await ctx.db
        .select({
          id: episode.id,
          episodeId: episode.episodeId,
          title: episode.title,
          itunesTitle: episode.itunesTitle,
          description: episode.description,
          publishedAt: episode.publishedAt,
          createdAt: episode.createdAt,
          durationSec: episode.durationSec,
          author: episode.author,
          creator: episode.creator,
          thumbnailUrl: episode.thumbnailUrl,
          podcastId: episode.podcastId,
          podcastTitle: podcast.title,
          podcastImageUrl: podcast.imageUrl,
        })
        .from(episode)
        .innerJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(
          and(
            eq(episode.userId, ctx.user.id),
            isNull(episode.hiddenAt),
            or(
              sql`${episode.title} ilike ${searchPattern}`,
              sql`${episode.itunesTitle} ilike ${searchPattern}`,
              sql`${episode.description} ilike ${searchPattern}`,
              sql`${episode.author} ilike ${searchPattern}`,
              sql`${episode.creator} ilike ${searchPattern}`,
            ),
          ),
        )
        .orderBy(
          desc(sql`coalesce(${episode.publishedAt}, ${episode.createdAt})`),
        )
        .limit(limit);

      return results;
    }),

  processEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV === "production") {
        const rateLimitResult = await checkRateLimit(
          `episode-process:${ctx.user.id}`,
          RATE_LIMITS.EPISODE_PROCESSING,
        );

        if (!rateLimitResult.success) {
          const resetIn = Math.ceil(
            (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
          );
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Rate limit exceeded. Try again in ${resetIn} minutes.`,
          });
        }
      }

      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
          processingStartedAt: true,
        },
      });

      if (!episodeRecord) {
        throw new Error("Episode not found");
      }

      if (episodeRecord.status === "processing") {
        const processingStarted = episodeRecord.processingStartedAt;
        if (processingStarted) {
          const hoursSinceStart =
            (Date.now() - processingStarted.getTime()) / (1000 * 60 * 60);
          if (hoursSinceStart < 1) {
            return { status: "processing" as const };
          }
        }
      }

      const now = new Date();
      const updateData: {
        status: "processing";
        processingStartedAt: Date;
        errorMessage?: null;
        retryCount?: number;
      } = {
        status: "processing" as const,
        processingStartedAt: now,
      };

      if (
        episodeRecord.status === "failed" ||
        episodeRecord.status === "retrying"
      ) {
        updateData.errorMessage = null;
      }

      await ctx.db
        .update(episode)
        .set(updateData)
        .where(eq(episode.id, input.episodeId));

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/daily-intelligence.episode.process",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          episodeId: input.episodeId,
        },
      });

      return {
        status: episodeRecord.status === "processed" ? "dispatched" : "queued",
        pipelineRunId,
      } as const;
    }),

  processEpisodeWithSignals: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV === "production") {
        const rateLimitResult = await checkRateLimit(
          `episode-process:${ctx.user.id}`,
          RATE_LIMITS.EPISODE_PROCESSING,
        );

        if (!rateLimitResult.success) {
          const resetIn = Math.ceil(
            (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
          );
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Rate limit exceeded. Try again in ${resetIn} minutes.`,
          });
        }
      }

      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
          processingStartedAt: true,
          signalsGeneratedAt: true,
        },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      if (
        episodeRecord.status === "processed" &&
        episodeRecord.signalsGeneratedAt !== null
      ) {
        return {
          status: "already-processed" as const,
          message: "Episode already fully processed with signals",
        };
      }

      if (episodeRecord.status === "processing") {
        const processingStarted = episodeRecord.processingStartedAt;
        if (processingStarted) {
          const hoursSinceStart =
            (Date.now() - processingStarted.getTime()) / (1000 * 60 * 60);
          if (hoursSinceStart < 1) {
            return { status: "processing" as const };
          }
        }
      }

      const now = new Date();
      await ctx.db
        .update(episode)
        .set({
          status: "processing" as const,
          processingStartedAt: now,
          errorMessage: null,
        })
        .where(eq(episode.id, input.episodeId));

      const pipelineRunId = randomUUID();

      // If failed or already processed, trigger reprocess to clean up first
      const needsCleanup =
        episodeRecord.status === "failed" ||
        episodeRecord.status === "processed";

      if (needsCleanup) {
        await inngest.send({
          name: "app/daily-intelligence.episode.reprocess",
          data: {
            pipelineRunId,
            userId: ctx.user.id,
            episodeId: input.episodeId,
          },
        });
      } else {
        await inngest.send({
          name: "app/daily-intelligence.episode.process-with-signals",
          data: {
            pipelineRunId,
            userId: ctx.user.id,
            episodeId: input.episodeId,
          },
        });
      }

      return {
        status: "queued" as const,
        pipelineRunId,
      };
    }),

  generateSignals: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
        maxSignals: z.number().min(5).max(30).optional().default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitResult = await checkRateLimit(
        `signal-generate:${ctx.user.id}`,
        RATE_LIMITS.SIGNAL_REGENERATION,
      );

      if (!rateLimitResult.success) {
        const resetIn = Math.ceil(
          (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${resetIn} minutes.`,
        });
      }

      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
          signalsGeneratedAt: true,
        },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      const chunksWithEmbeddings = await ctx.db
        .select({ count: count() })
        .from(transcriptChunk)
        .where(
          and(
            eq(transcriptChunk.episodeId, input.episodeId),
            sql`${transcriptChunk.embedding} IS NOT NULL`,
          ),
        );

      if (!chunksWithEmbeddings[0] || chunksWithEmbeddings[0].count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Episode must be processed with embeddings before generating signals",
        });
      }

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/daily-intelligence.user.generate-signals",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          episodeId: input.episodeId,
          maxSignals: input.maxSignals,
          regenerate: false,
        },
      });

      return {
        status: "dispatched" as const,
        pipelineRunId,
      };
    }),

  regenerateSignals: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitResult = await checkRateLimit(
        `signal-regenerate:${ctx.user.id}`,
        RATE_LIMITS.SIGNAL_REGENERATION,
      );

      if (!rateLimitResult.success) {
        const resetIn = Math.ceil(
          (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${resetIn} minutes.`,
        });
      }

      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
        },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      const chunksWithEmbeddings = await ctx.db
        .select({ count: count() })
        .from(transcriptChunk)
        .where(
          and(
            eq(transcriptChunk.episodeId, input.episodeId),
            sql`${transcriptChunk.embedding} IS NOT NULL`,
          ),
        );

      if (!chunksWithEmbeddings[0] || chunksWithEmbeddings[0].count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Episode must be processed with embeddings before regenerating signals",
        });
      }

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/daily-intelligence.user.generate-signals",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          episodeId: input.episodeId,
          maxSignals: 30,
          regenerate: true,
        },
      });

      return {
        status: "dispatched" as const,
        pipelineRunId,
      };
    }),

  reprocessEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV === "production") {
        const rateLimitResult = await checkRateLimit(
          `episode-reprocess:${ctx.user.id}`,
          RATE_LIMITS.EPISODE_PROCESSING,
        );

        if (!rateLimitResult.success) {
          const resetIn = Math.ceil(
            (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
          );
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Rate limit exceeded. Try again in ${resetIn} minutes.`,
          });
        }
      }

      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
        },
      });

      if (!episodeRecord) {
        throw new Error("Episode not found");
      }

      const now = new Date();
      await ctx.db
        .update(episode)
        .set({
          status: "processing" as const,
          processingStartedAt: now,
          errorMessage: null,
        })
        .where(eq(episode.id, input.episodeId));

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/daily-intelligence.episode.reprocess",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          episodeId: input.episodeId,
        },
      });

      return {
        status: "dispatched" as const,
        pipelineRunId,
      };
    }),

  getSummary: protectedProcedure
    .input(z.object({ episodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const summaryRecord = await ctx.db.query.episodeSummary.findFirst({
        where: eq(episodeSummary.episodeId, input.episodeId),
      });

      return summaryRecord;
    }),

  getContent: protectedProcedure
    .input(z.object({ episodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        with: {
          transcriptChunks: {
            orderBy: (chunks, { asc }) => [asc(chunks.startTimeSec)],
          },
        },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      if (
        !episodeRecord.transcriptChunks ||
        episodeRecord.transcriptChunks.length === 0
      ) {
        return { content: "", title: episodeRecord.title };
      }

      const content = episodeRecord.transcriptChunks
        .map((chunk) => chunk.content)
        .join("\n\n");

      return { content, title: episodeRecord.title };
    }),

  generateSummary: protectedProcedure
    .input(z.object({ episodeId: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rateLimitResult = await checkRateLimit(
        `episode-summary:${ctx.user.id}`,
        { limit: 10, windowMs: 60 * 60 * 1000 },
      );

      if (!rateLimitResult.success) {
        const resetIn = Math.ceil(
          (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${resetIn} minutes.`,
        });
      }

      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        with: { summary: true },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      if (!episodeRecord.transcriptUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Episode has no transcript",
        });
      }

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/summary.episode.generate",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          episodeId: input.episodeId,
          force: input.force ?? true,
        },
      });

      return {
        status: "dispatched" as const,
        pipelineRunId,
      };
    }),

  hideEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const episodeRecord = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
        },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      await ctx.db
        .update(episode)
        .set({ hiddenAt: new Date() })
        .where(eq(episode.id, input.episodeId));

      return { success: true };
    }),
});
