import { desc } from "drizzle-orm";
import { z } from "zod";
import { episode } from "@/db/schema";
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
          // podcast relation is optional; keep minimal join to avoid unnecessary fetches
          // starter questions for onboarding chips
          starterQuestions: true,
        },
      });
      console.log({ rows });

      return rows;
    }),
});
