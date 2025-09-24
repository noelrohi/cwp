import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { episode } from "@/server/db/schema";
import { createTRPCRouter, publicProcedure } from "../init";

export const episodesRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(50).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 8;
      const rows = await ctx.db.query.episode.findMany({
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
        },
      });

      return rows;
    }),

  get: publicProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const episodeData = await ctx.db.query.episode.findFirst({
        where: eq(episode.id, input.episodeId),
        with: {
          podcast: true,
        },
      });

      if (!episodeData) {
        throw new Error("Episode not found");
      }

      return episodeData;
    }),

  todaysEpisodes: publicProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(50).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;

      // Get today's date range (start and end of today)
      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const rows = await ctx.db.query.episode.findMany({
        where: (episodes, { and, gte, lt }) =>
          and(
            gte(episodes.publishedAt, startOfDay),
            lt(episodes.publishedAt, endOfDay),
          ),
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
        },
      });

      return rows;
    }),

  getUnprocessed: publicProcedure
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
        where: (episodes, { eq }) => eq(episodes.status, status),
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
        },
      });

      return rows;
    }),
});
