import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  not,
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  article,
  articleFeed,
  episodeSummary,
  transcriptChunk,
} from "@/server/db/schema";
import { dailySignal } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const articlesRouter = createTRPCRouter({
  process: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if article already exists
      const existing = await ctx.db.query.article.findFirst({
        where: and(eq(article.userId, ctx.user.id), eq(article.url, input.url)),
      });

      let articleId: string;

      if (existing) {
        articleId = existing.id;
      } else {
        // Create new article record
        articleId = nanoid();
        await ctx.db.insert(article).values({
          id: articleId,
          userId: ctx.user.id,
          url: input.url,
          title: "Processing...",
          status: "pending",
        });
      }

      // Trigger Inngest processing
      await inngest.send({
        name: "article/process.requested",
        data: {
          articleId,
          userId: ctx.user.id,
          url: input.url,
        },
      });

      return {
        success: true,
        articleId,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const articles = await ctx.db.query.article.findMany({
      where: eq(article.userId, ctx.user.id),
      orderBy: [desc(article.createdAt)],
      limit: 50,
      with: {
        feed: true,
      },
    });

    // Fetch signal counts for all articles in a single query
    const articleIds = articles.map((art) => art.id);

    if (articleIds.length === 0) {
      return articles.map((art) => ({
        ...art,
        signalCounts: { total: 0, pending: 0 },
      }));
    }

    const signalCounts = await ctx.db
      .select({
        articleId: transcriptChunk.articleId,
        total: count(dailySignal.id),
        pending: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(dailySignal)
      .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          inArray(transcriptChunk.articleId, articleIds),
        ),
      )
      .groupBy(transcriptChunk.articleId);

    const signalCountMap = new Map(
      signalCounts.map((sc) => [
        sc.articleId,
        { total: Number(sc.total), pending: Number(sc.pending) },
      ]),
    );

    return articles.map((art) => ({
      ...art,
      signalCounts: signalCountMap.get(art.id) ?? { total: 0, pending: 0 },
    }));
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

  getStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(eq(article.id, input.id), eq(article.userId, ctx.user.id)),
        columns: {
          id: true,
          status: true,
          errorMessage: true,
          updatedAt: true,
        },
      });

      if (!articleRecord) {
        throw new Error("Article not found");
      }

      return articleRecord;
    }),

  addFeed: protectedProcedure
    .input(
      z.object({
        feedUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parser = new Parser();
      const feed = await parser.parseURL(input.feedUrl);

      const feedId = nanoid();
      await ctx.db.insert(articleFeed).values({
        id: feedId,
        userId: ctx.user.id,
        feedUrl: input.feedUrl,
        title: feed.title || "Untitled Feed",
        description: feed.description || null,
        imageUrl: feed.image?.url || null,
        metadata: JSON.stringify({
          language: feed.language,
          generator: feed.generator,
          link: feed.link,
          copyright: feed.copyright,
        }),
      });

      return {
        success: true,
        feed: {
          id: feedId,
          title: feed.title || "Untitled Feed",
        },
      };
    }),

  listFeeds: protectedProcedure
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
        eq(articleFeed.userId, ctx.user.id),
        input.query
          ? or(
              ilike(articleFeed.title, `%${input.query}%`),
              ilike(articleFeed.description, `%${input.query}%`),
            )
          : undefined,
      );

      const orderBy =
        input.sortBy === "title"
          ? [articleFeed.title]
          : [desc(articleFeed.createdAt)];

      const [feeds, [totalCount]] = await Promise.all([
        ctx.db.query.articleFeed.findMany({
          where,
          orderBy,
          limit: input.limit,
          offset,
        }),
        ctx.db.select({ value: count() }).from(articleFeed).where(where),
      ]);

      const total = Number(totalCount?.value ?? 0);
      const totalPages = Math.ceil(total / input.limit);

      return {
        data: feeds,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages,
          hasMore: input.page < totalPages,
        },
      };
    }),

  removeFeed: protectedProcedure
    .input(
      z.object({
        feedId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(articleFeed)
        .where(
          and(
            eq(articleFeed.id, input.feedId),
            eq(articleFeed.userId, ctx.user.id),
          ),
        );

      return { success: true };
    }),

  getFeed: protectedProcedure
    .input(
      z.object({
        feedId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const feed = await ctx.db.query.articleFeed.findFirst({
        where: and(
          eq(articleFeed.id, input.feedId),
          eq(articleFeed.userId, ctx.user.id),
        ),
      });

      if (!feed) {
        throw new Error("Feed not found");
      }

      const articleCount = await ctx.db
        .select({ value: count() })
        .from(article)
        .where(eq(article.feedId, feed.id));

      return {
        ...feed,
        articleCount: Number(articleCount[0]?.value ?? 0),
      };
    }),

  parseFeed: protectedProcedure
    .input(
      z.object({
        feedId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feed = await ctx.db.query.articleFeed.findFirst({
        where: and(
          eq(articleFeed.id, input.feedId),
          eq(articleFeed.userId, ctx.user.id),
        ),
      });

      if (!feed) {
        throw new Error("Feed not found");
      }

      const parser = new Parser();
      const feedData = await parser.parseURL(feed.feedUrl);

      // Extract all URLs from feed items upfront
      const feedUrls = (feedData.items || [])
        .filter((item) => item.link)
        .map((item) => item.link as string);

      if (feedUrls.length === 0) {
        return {
          message: "No articles found in feed",
          newArticles: 0,
        };
      }

      // Batch query: fetch all existing articles for these URLs in ONE query
      const existingArticles = await ctx.db.query.article.findMany({
        where: and(
          eq(article.userId, ctx.user.id),
          inArray(article.url, feedUrls),
        ),
        columns: {
          url: true,
        },
      });

      // Create a Set for O(1) lookup instead of O(n) array iteration
      const existingUrls = new Set(existingArticles.map((a) => a.url));

      // Filter to only new articles
      const newArticleData = (feedData.items || [])
        .filter((item) => item.link && !existingUrls.has(item.link))
        .map((item) => ({
          id: nanoid(),
          userId: ctx.user.id,
          feedId: feed.id,
          url: item.link as string,
          title: item.title || "Untitled Article",
          author: item.creator || item.author || null,
          excerpt: item.contentSnippet || item.content || null,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        }));

      // Batch insert: insert all new articles in ONE query
      // Use onConflictDoNothing to handle race conditions gracefully
      let newArticles = 0;
      if (newArticleData.length > 0) {
        await ctx.db
          .insert(article)
          .values(newArticleData)
          .onConflictDoNothing();
        newArticles = newArticleData.length;
      }

      return {
        message: `Found ${newArticles} new article${newArticles !== 1 ? "s" : ""}`,
        newArticles,
      };
    }),

  articlesInfinite: protectedProcedure
    .input(
      z.object({
        feedId: z.string(),
        filterBySignals: z
          .enum(["all", "with-signals", "without-signals"])
          .optional()
          .default("all"),
        limit: z.number().min(1).max(100).default(20),
        cursor: z
          .object({
            id: z.string(),
            publishedAt: z.string().datetime().nullable(),
            createdAt: z.string().datetime(),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;

      const orderTimestampExpr = sql`coalesce(${article.publishedAt}, ${article.createdAt})`;
      const signalExists = exists(
        ctx.db
          .select({ value: sql`1` })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(
            and(
              eq(dailySignal.userId, ctx.user.id),
              eq(transcriptChunk.articleId, article.id),
            ),
          ),
      );

      const filterCondition = (() => {
        if (input.filterBySignals === "with-signals") {
          return signalExists;
        }
        if (input.filterBySignals === "without-signals") {
          return not(signalExists);
        }
        return undefined;
      })();

      const cursorCondition = input.cursor
        ? (() => {
            const cursorTimestamp = new Date(
              input.cursor.publishedAt ?? input.cursor.createdAt,
            );
            return sql`
              (${orderTimestampExpr} < ${cursorTimestamp})
              or (
                ${orderTimestampExpr} = ${cursorTimestamp}
                and ${article.id} < ${input.cursor.id}
              )
            `;
          })()
        : undefined;

      const items = await ctx.db.query.article.findMany({
        where: and(
          eq(article.userId, ctx.user.id),
          eq(article.feedId, input.feedId),
          filterCondition,
          cursorCondition,
        ),
        orderBy: [desc(orderTimestampExpr), desc(article.id)],
        limit: limit + 1,
      });

      const hasMore = items.length > limit;
      const rows = hasMore ? items.slice(0, limit) : items;

      const nextCursor = hasMore
        ? {
            id: items[limit].id,
            publishedAt: items[limit].publishedAt,
            createdAt: items[limit].createdAt.toISOString(),
          }
        : null;

      return {
        items: rows,
        nextCursor,
      };
    }),

  processArticle: protectedProcedure
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
        ),
        with: {
          transcriptChunks: {
            limit: 1,
          },
        },
      });

      if (!articleRecord) {
        throw new Error("Article not found");
      }

      if (
        articleRecord.status === "processed" &&
        articleRecord.transcriptChunks.length > 0
      ) {
        throw new Error(
          "Article already processed. Use Regenerate Signals to update existing signals.",
        );
      }

      if (articleRecord.status === "processing") {
        throw new Error("Article is currently being processed");
      }

      // Trigger Inngest function for background processing
      await inngest.send({
        name: "article/process.requested",
        data: {
          articleId: input.articleId,
          userId: ctx.user.id,
          url: articleRecord.url,
        },
      });

      return { success: true, status: "processing" };
    }),

  reprocessArticle: protectedProcedure
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
        ),
      });

      if (!articleRecord) {
        throw new Error("Article not found");
      }

      // Trigger Inngest function for reprocessing (handles cleanup + processing)
      await inngest.send({
        name: "article/reprocess.requested",
        data: {
          articleId: input.articleId,
          userId: ctx.user.id,
          url: articleRecord.url,
        },
      });

      return { success: true, status: "processing" };
    }),

  generateSignals: protectedProcedure
    .input(
      z.object({
        articleId: z.string(),
        maxSignals: z.number().min(5).max(30).optional().default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(
          eq(article.id, input.articleId),
          eq(article.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          status: true,
          signalsGeneratedAt: true,
        },
      });

      if (!articleRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      if (articleRecord.status !== "processed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Article must be processed before generating signals",
        });
      }

      // Trigger Inngest function for signal generation
      await inngest.send({
        name: "article/signals.generate",
        data: {
          articleId: input.articleId,
          userId: ctx.user.id,
          maxSignals: input.maxSignals,
        },
      });

      return {
        success: true,
      };
    }),

  regenerateSignals: protectedProcedure
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
        ),
      });

      if (!articleRecord) {
        throw new Error("Article not found");
      }

      // Get existing chunks for this article
      const chunks = await ctx.db.query.transcriptChunk.findMany({
        where: eq(transcriptChunk.articleId, input.articleId),
        limit: 1,
      });

      if (chunks.length === 0) {
        throw new Error(
          "No chunks found for this article. Process the article first.",
        );
      }

      // Trigger Inngest function for signal regeneration
      await inngest.send({
        name: "article/signals.regenerate",
        data: {
          articleId: input.articleId,
          userId: ctx.user.id,
        },
      });

      return {
        success: true,
      };
    }),

  getSummary: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const summaryRecord = await ctx.db.query.episodeSummary.findFirst({
        where: eq(episodeSummary.articleId, input.articleId),
      });

      return summaryRecord;
    }),

  getContent: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(
          eq(article.id, input.articleId),
          eq(article.userId, ctx.user.id),
        ),
        with: {
          transcriptChunks: {
            orderBy: (chunks, { asc }) => [asc(chunks.createdAt)],
          },
        },
      });

      if (!articleRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      if (
        !articleRecord.transcriptChunks ||
        articleRecord.transcriptChunks.length === 0
      ) {
        return { content: "" };
      }

      const content = articleRecord.transcriptChunks
        .map((chunk) => chunk.content)
        .join("\n\n");

      return { content };
    }),

  getRawContent: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(
          eq(article.id, input.articleId),
          eq(article.userId, ctx.user.id),
        ),
      });

      if (!articleRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      if (articleRecord.rawContent) {
        return {
          rawContent: articleRecord.rawContent,
        };
      }

      if (!articleRecord.url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Article has no URL to fetch content from",
        });
      }

      const jinaUrl = `https://r.jina.ai/${articleRecord.url}`;
      const response = await fetch(jinaUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch article content: ${response.statusText}`,
        });
      }

      const data = await response.json();
      const rawContent = data.data.content;

      await ctx.db
        .update(article)
        .set({ rawContent })
        .where(eq(article.id, input.articleId));

      return {
        rawContent,
      };
    }),

  generateSummary: protectedProcedure
    .input(z.object({ articleId: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rateLimitResult = await checkRateLimit(
        `article-summary:${ctx.user.id}`,
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

      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(
          eq(article.id, input.articleId),
          eq(article.userId, ctx.user.id),
        ),
        with: { summary: true, transcriptChunks: true },
      });

      if (!articleRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      if (
        !articleRecord.transcriptChunks ||
        articleRecord.transcriptChunks.length === 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Article has no processed content. Process the article first.",
        });
      }

      const pipelineRunId = randomUUID();

      await inngest.send({
        name: "app/summary.article.generate",
        data: {
          pipelineRunId,
          userId: ctx.user.id,
          articleId: input.articleId,
          force: input.force ?? true,
        },
      });

      return {
        status: "dispatched" as const,
        pipelineRunId,
      };
    }),
});
