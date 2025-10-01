import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { episode } from "@/server/db/schema/podcast";
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
          transcriptChunks: true,
          speakerMapping: true,
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
        where: and(eq(episode.userId, ctx.user.id)),
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
        },
      });

      return rows;
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
        throw new Error("Episode not found");
      }

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/daily-intelligence.user.generate-signals",
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
});
