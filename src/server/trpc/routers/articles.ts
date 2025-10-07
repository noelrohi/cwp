import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { article } from "@/server/db/schema";
import { processArticle } from "@/server/lib/article-processing";
import { createTRPCRouter, protectedProcedure } from "../init";

export const articlesRouter = createTRPCRouter({
  process: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await processArticle({
        db: ctx.db,
        userId: ctx.user.id,
        url: input.url,
      });

      return {
        success: true,
        articleId: result.articleId,
        chunkCount: result.chunkCount,
        signalCount: result.signalCount,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const articles = await ctx.db.query.article.findMany({
      where: eq(article.userId, ctx.user.id),
      orderBy: [desc(article.createdAt)],
      limit: 50,
    });

    return articles;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: eq(article.id, input.id),
        with: {
          transcriptChunks: {
            orderBy: (chunks, { asc }) => [asc(chunks.createdAt)],
            limit: 50,
          },
        },
      });

      if (!articleRecord || articleRecord.userId !== ctx.user.id) {
        throw new Error("Article not found");
      }

      return articleRecord;
    }),
});
