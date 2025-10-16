import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  article,
  dailySignal,
  integration,
  transcriptChunk,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const readwiseRouter = createTRPCRouter({
  listArticles: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
        query: z.string().optional(),
        sortBy: z.enum(["date", "title"]).optional().default("date"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const where = and(
        eq(article.userId, ctx.user.id),
        eq(article.source, "readwise"),
        input.query
          ? or(
              ilike(article.title, `%${input.query}%`),
              ilike(article.author, `%${input.query}%`),
              ilike(article.siteName, `%${input.query}%`),
            )
          : undefined,
      );

      const orderBy =
        input.sortBy === "title"
          ? [asc(article.title)]
          : [desc(article.publishedAt ?? article.createdAt)];

      const [articles, [totalCount]] = await Promise.all([
        ctx.db.query.article.findMany({
          where,
          orderBy,
          limit: input.limit,
          offset,
          with: {
            summary: true,
          },
        }),
        ctx.db.select({ value: count() }).from(article).where(where),
      ]);

      const articleIds = articles.map((art) => art.id);

      let signalCountMap = new Map<
        string,
        { total: number; pending: number }
      >();

      if (articleIds.length > 0) {
        const signalCounts = await ctx.db
          .select({
            articleId: transcriptChunk.articleId,
            total: count(dailySignal.id),
            pending: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} IS NULL THEN 1 ELSE 0 END)`,
          })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(
            and(
              eq(dailySignal.userId, ctx.user.id),
              inArray(transcriptChunk.articleId, articleIds),
            ),
          )
          .groupBy(transcriptChunk.articleId);

        signalCountMap = new Map(
          signalCounts.map((sc) => [
            sc.articleId as string,
            { total: Number(sc.total), pending: Number(sc.pending) },
          ]),
        );
      }

      const articlesWithCounts = articles.map((art) => ({
        ...art,
        signalCounts: signalCountMap.get(art.id) ?? { total: 0, pending: 0 },
      }));

      const total = Number(totalCount?.value ?? 0);
      const totalPages = Math.ceil(total / input.limit);

      return {
        data: articlesWithCounts,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages,
          hasMore: input.page < totalPages,
        },
      };
    }),

  deleteArticle: protectedProcedure
    .input(
      z.object({
        articleId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(
          eq(article.id, input.articleId),
          eq(article.userId, ctx.user.id),
          eq(article.source, "readwise"),
        ),
      });

      if (!articleRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      if (articleRecord.readwiseId) {
        const readwiseIntegration = await ctx.db.query.integration.findFirst({
          where: and(
            eq(integration.userId, ctx.user.id),
            eq(integration.provider, "readwise"),
          ),
        });

        if (readwiseIntegration?.accessToken) {
          try {
            const response = await fetch(
              `https://readwise.io/api/v3/delete/${articleRecord.readwiseId}/`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Token ${readwiseIntegration.accessToken}`,
                },
              },
            );

            if (!response.ok && response.status !== 404) {
              console.error(
                `Failed to delete document from Readwise: ${response.status} ${response.statusText}`,
              );
            }
          } catch (error) {
            console.error("Error deleting document from Readwise:", error);
          }
        }
      }

      await ctx.db
        .delete(article)
        .where(
          and(
            eq(article.id, input.articleId),
            eq(article.userId, ctx.user.id),
            eq(article.source, "readwise"),
          ),
        );

      return { success: true };
    }),
});
