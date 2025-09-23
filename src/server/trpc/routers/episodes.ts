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
        orderBy: [desc(episode.createdAt)],
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
});
