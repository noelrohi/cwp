import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { article, articleFeed, episodeSummary } from "@/server/db/schema";
import { cleanMarkdownWithAI } from "@/server/lib/article-processing";
import { createTRPCRouter, protectedProcedure } from "../init";

export const articlesRouter = createTRPCRouter({
  process: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.article.findFirst({
        where: and(eq(article.userId, ctx.user.id), eq(article.url, input.url)),
      });

      let articleId: string;

      if (existing) {
        articleId = existing.id;
      } else {
        articleId = nanoid();
        await ctx.db.insert(article).values({
          id: articleId,
          userId: ctx.user.id,
          url: input.url,
          title: "Processing...",
          status: "pending",
        });
      }

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

  list: protectedProcedure
    .input(
      z
        .object({
          source: z.enum(["rss", "email", "readwise"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const whereConditions = [eq(article.userId, ctx.user.id)];

      if (input?.source) {
        whereConditions.push(eq(article.source, input.source));
      }

      const articles = await ctx.db.query.article.findMany({
        where: and(...whereConditions),
        orderBy: [desc(article.createdAt)],
        limit: 50,
        with: {
          feed: true,
          summary: true,
        },
      });

      return articles;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: eq(article.id, input.id),
        with: {
          summary: true,
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

      const feedUrls = (feedData.items || [])
        .filter((item) => item.link)
        .map((item) => item.link as string);

      if (feedUrls.length === 0) {
        return {
          message: "No articles found in feed",
          newArticles: 0,
        };
      }

      const existingArticles = await ctx.db.query.article.findMany({
        where: and(
          eq(article.userId, ctx.user.id),
          inArray(article.url, feedUrls),
        ),
        columns: {
          url: true,
        },
      });

      const existingUrls = new Set(existingArticles.map((a) => a.url));

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
        throw new Error("Article already processed.");
      }

      if (articleRecord.status === "processing") {
        throw new Error("Article is currently being processed");
      }

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

      if (articleRecord.rawContent) {
        return {
          content: articleRecord.rawContent,
          title: articleRecord.title,
        };
      }

      if (
        !articleRecord.transcriptChunks ||
        articleRecord.transcriptChunks.length === 0
      ) {
        return { content: "", title: articleRecord.title };
      }

      const content = articleRecord.transcriptChunks
        .map((chunk) => chunk.content)
        .join("\n\n");

      return { content, title: articleRecord.title };
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
          Authorization: `Bearer ${process.env.JINA_API_KEY}`,
          "X-Return-Format": "markdown",
        },
      });

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch article content: ${response.statusText}`,
        });
      }

      const rawMarkdown = await response.text();

      const rawContent = await cleanMarkdownWithAI(rawMarkdown);

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
        if (articleRecord.status === "processing") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Article is currently being processed. Please wait.",
          });
        }

        await inngest.send({
          name: "article/process.requested",
          data: {
            articleId: input.articleId,
            userId: ctx.user.id,
            url: articleRecord.url,
          },
        });

        return {
          status: "processing" as const,
        };
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
