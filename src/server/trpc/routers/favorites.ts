import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { favorite } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const favoritesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const favorites = await ctx.db.query.favorite.findMany({
      where: eq(favorite.userId, ctx.user.id),
      orderBy: [desc(favorite.createdAt)],
      with: {
        episode: {
          with: {
            podcast: true,
          },
        },
        article: {
          with: {
            feed: true,
          },
        },
      },
    });

    return favorites;
  }),

  toggle: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.episodeId && !input.articleId) {
        throw new Error("Either episodeId or articleId must be provided");
      }
      if (input.episodeId && input.articleId) {
        throw new Error("Only one of episodeId or articleId can be provided");
      }

      const whereClause = input.episodeId
        ? and(
            eq(favorite.userId, ctx.user.id),
            eq(favorite.episodeId, input.episodeId),
          )
        : and(
            eq(favorite.userId, ctx.user.id),
            eq(favorite.articleId, input.articleId!),
          );

      const existing = await ctx.db.query.favorite.findFirst({
        where: whereClause,
      });

      if (existing) {
        await ctx.db.delete(favorite).where(eq(favorite.id, existing.id));
        return { favorited: false };
      }

      await ctx.db.insert(favorite).values({
        id: randomUUID(),
        userId: ctx.user.id,
        episodeId: input.episodeId,
        articleId: input.articleId,
      });

      return { favorited: true };
    }),

  isFavorited: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.episodeId && !input.articleId) {
        return false;
      }

      const whereClause = input.episodeId
        ? and(
            eq(favorite.userId, ctx.user.id),
            eq(favorite.episodeId, input.episodeId),
          )
        : and(
            eq(favorite.userId, ctx.user.id),
            eq(favorite.articleId, input.articleId!),
          );

      const existing = await ctx.db.query.favorite.findFirst({
        where: whereClause,
      });

      return !!existing;
    }),
});
