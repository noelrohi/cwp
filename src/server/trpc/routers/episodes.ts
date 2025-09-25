import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { episode } from "@/server/db/schema/podcast";
import { ensureEpisodeTranscript } from "@/server/lib/transcript-processing";
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

  generateTranscript: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const episodeData = await ctx.db.query.episode.findFirst({
        where: and(
          eq(episode.id, input.episodeId),
          eq(episode.userId, ctx.user.id),
        ),
        with: {
          podcast: true,
        },
      });

      if (!episodeData) {
        throw new Error("Episode not found");
      }

      if (!episodeData.audioUrl) {
        throw new Error("Episode has no audio URL");
      }

      if (episodeData.transcriptUrl) {
        throw new Error("Episode already has a transcript");
      }

      try {
        const result = await ensureEpisodeTranscript({
          db: ctx.db,
          episode: episodeData,
        });

        return {
          success: true,
          transcriptUrl: result.transcriptUrl,
          duration: result.duration,
        };
      } catch (error) {
        console.error(
          `Failed to generate transcript for episode ${input.episodeId}:`,
          error,
        );
        throw error;
      }
    }),
});
