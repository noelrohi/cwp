import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  fetchReadwiseDocuments,
  htmlToMarkdown,
  verifyReadwiseToken,
} from "@/lib/readwise";
import { article, integration } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const integrationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.integration.findMany({
      where: eq(integration.userId, ctx.user.id),
    });
  }),

  connectReadwise: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1, "Token is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const verification = await verifyReadwiseToken(input.token);

      if (!verification.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: verification.error || "Invalid Readwise token",
        });
      }

      const existing = await ctx.db.query.integration.findFirst({
        where: and(
          eq(integration.userId, ctx.user.id),
          eq(integration.provider, "readwise"),
        ),
      });

      if (existing) {
        await ctx.db
          .update(integration)
          .set({
            accessToken: input.token,
            updatedAt: new Date(),
          })
          .where(eq(integration.id, existing.id));

        return { success: true, integrationId: existing.id };
      }

      const [newIntegration] = await ctx.db
        .insert(integration)
        .values({
          id: randomUUID(),
          userId: ctx.user.id,
          provider: "readwise",
          accessToken: input.token,
          metadata: {
            totalItemsSynced: 0,
          },
        })
        .returning();

      return { success: true, integrationId: newIntegration.id };
    }),

  disconnect: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["readwise"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(integration)
        .where(
          and(
            eq(integration.userId, ctx.user.id),
            eq(integration.provider, input.provider),
          ),
        );

      return { success: true };
    }),

  syncReadwise: protectedProcedure
    .input(
      z
        .object({
          resetSync: z.boolean().optional(),
          location: z.enum(["new", "later", "archive", "feed"]).optional(),
          category: z
            .enum([
              "article",
              "email",
              "rss",
              "highlight",
              "note",
              "pdf",
              "epub",
              "tweet",
              "video",
            ])
            .optional(),
          tags: z.array(z.string()).max(5).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitResult = await checkRateLimit(
        `readwise-sync:${ctx.user.id}`,
        RATE_LIMITS.READWISE_SYNC,
      );

      if (!rateLimitResult.success) {
        const resetMinutes = Math.ceil(
          (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Please wait ${resetMinutes} minute${resetMinutes !== 1 ? "s" : ""} before syncing again`,
        });
      }

      const readwiseIntegration = await ctx.db.query.integration.findFirst({
        where: and(
          eq(integration.userId, ctx.user.id),
          eq(integration.provider, "readwise"),
        ),
      });

      if (!readwiseIntegration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Readwise integration not connected",
        });
      }

      const startTime = Date.now();

      const lastSyncAt =
        input?.resetSync || !readwiseIntegration.metadata?.lastSyncAt
          ? undefined
          : new Date(readwiseIntegration.metadata.lastSyncAt);

      console.log("Fetching documents with params:", {
        hasLastSyncAt: !!lastSyncAt,
        lastSyncAt: lastSyncAt?.toISOString(),
        resetSync: input?.resetSync,
      });

      const documents = await fetchReadwiseDocuments(
        readwiseIntegration.accessToken,
        {
          updatedAfter: lastSyncAt,
          location: input?.location,
          category: input?.category,
          tags: input?.tags,
          limit: 100,
        },
      );

      console.log("Received documents from API:", {
        count: documents.length,
        sample: documents.slice(0, 2).map((d) => ({
          id: d.id,
          title: d.title,
          author: d.author,
        })),
      });

      const newArticles: string[] = [];
      let skippedDuplicates = 0;

      for (const doc of documents) {
        const existingArticle = await ctx.db.query.article.findFirst({
          where: and(
            eq(article.userId, ctx.user.id),
            eq(article.readwiseId, doc.id),
          ),
          columns: { id: true },
        });

        if (existingArticle) {
          skippedDuplicates++;
          continue;
        }

        try {
          const articleId = randomUUID();

          let rawContent = "";
          if (doc.html_content) {
            rawContent = htmlToMarkdown(doc.html_content);
          } else {
            rawContent = doc.summary;
          }

          if (doc.notes?.trim()) {
            rawContent += `\n\n---\n\n**Notes:** ${doc.notes}`;
          }

          await ctx.db.insert(article).values({
            id: articleId,
            userId: ctx.user.id,
            title: doc.title,
            author: doc.author || "Unknown Author",
            url: doc.source_url || null,
            source: "readwise",
            readwiseId: doc.id,
            status: "pending",
            publishedAt: doc.published_date
              ? new Date(doc.published_date)
              : new Date(doc.saved_at),
            rawContent,
            excerpt: doc.summary.slice(0, 200),
          });

          newArticles.push(articleId);
        } catch (error) {
          console.error("Failed to process document:", doc.id, error);
        }
      }

      await ctx.db
        .update(integration)
        .set({
          metadata: {
            ...readwiseIntegration.metadata,
            lastSyncAt: new Date().toISOString(),
            totalItemsSynced:
              (readwiseIntegration.metadata?.totalItemsSynced || 0) +
              documents.length,
          },
          updatedAt: new Date(),
        })
        .where(eq(integration.id, readwiseIntegration.id));

      console.log("Readwise sync completed:", {
        userId: ctx.user.id,
        documentsFetched: documents.length,
        articlesCreated: newArticles.length,
        skippedDuplicates,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        highlightsFetched: documents.length,
        articlesCreated: newArticles.length,
        skippedDuplicates,
      };
    }),
});
