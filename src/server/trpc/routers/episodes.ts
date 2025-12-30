import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { episode, episodeSummary, podcast } from "@/server/db/schema/podcast";
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
          summary: true,
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

      return rows;
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

  fetchTranscript: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV === "production") {
        const rateLimitResult = await checkRateLimit(
          `transcript-fetch:${ctx.user.id}`,
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
          transcriptUrl: true,
          status: true,
        },
      });

      if (!episodeRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Episode not found",
        });
      }

      // If transcript already exists, return it
      if (episodeRecord.transcriptUrl) {
        return {
          status: "exists" as const,
          transcriptUrl: episodeRecord.transcriptUrl,
        };
      }

      // Trigger transcript-only fetch via Inngest
      const pipelineRunId = crypto.randomUUID();

      await inngest.send({
        name: "app/transcript.episode.fetch",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          episodeId: input.episodeId,
        },
      });

      return {
        status: "queued" as const,
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
