import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { db } from "@/server/db";
import { article as articleSchema } from "@/server/db/schema";
import {
  chunkArticleContent,
  extractArticleContent,
  generateArticleSignals,
} from "@/server/lib/article-processing";
import { inngest } from "../client";

/**
 * Process article: extract content, chunk, embed, and generate signals
 */
export const processArticle = inngest.createFunction(
  {
    id: "article-processing",
    name: "Process Article",
    retries: 2,
  },
  { event: "article/process.requested" },
  async ({ event, step }) => {
    const { articleId, userId, url } = event.data;

    // Step 1: Mark as processing
    await step.run("mark-processing", async () => {
      await db
        .update(articleSchema)
        .set({ status: "processing" })
        .where(eq(articleSchema.id, articleId));

      return { articleId, status: "processing" };
    });

    // Step 2: Extract article content
    const extractedContent = await step.run("extract-content", async () => {
      try {
        const extracted = await extractArticleContent(url);

        if (!extracted.content || extracted.content.trim().length < 100) {
          throw new NonRetriableError("Article content too short or empty");
        }

        // Update article with extracted metadata
        await db
          .update(articleSchema)
          .set({
            title: extracted.title,
            author: extracted.author,
            publishedAt: extracted.publishedAt,
            siteName: extracted.siteName,
            excerpt: extracted.excerpt,
          })
          .where(eq(articleSchema.id, articleId));

        return {
          content: extracted.content,
          title: extracted.title,
          wordCount: extracted.content.split(/\s+/).length,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to extract content";

        await db
          .update(articleSchema)
          .set({
            status: "failed",
            errorMessage,
          })
          .where(eq(articleSchema.id, articleId));

        throw error;
      }
    });

    // Step 3: Chunk and embed content
    const chunkResult = await step.run("chunk-and-embed", async () => {
      try {
        const result = await chunkArticleContent({
          db,
          articleId,
          content: extractedContent.content,
        });

        return {
          chunkCount: result.chunkCount,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to chunk content";

        await db
          .update(articleSchema)
          .set({
            status: "failed",
            errorMessage,
          })
          .where(eq(articleSchema.id, articleId));

        throw error;
      }
    });

    // Step 4: Generate signals
    const signalResult = await step.run("generate-signals", async () => {
      try {
        const result = await generateArticleSignals({
          db,
          articleId,
          userId,
        });

        return {
          signalCount: result.signalCount,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to generate signals";

        await db
          .update(articleSchema)
          .set({
            status: "failed",
            errorMessage,
          })
          .where(eq(articleSchema.id, articleId));

        throw error;
      }
    });

    // Step 5: Mark as processed
    await step.run("mark-processed", async () => {
      await db
        .update(articleSchema)
        .set({ status: "processed" })
        .where(eq(articleSchema.id, articleId));

      return {
        articleId,
        status: "processed",
        chunkCount: chunkResult.chunkCount,
        signalCount: signalResult.signalCount,
      };
    });

    return {
      articleId,
      title: extractedContent.title,
      wordCount: extractedContent.wordCount,
      chunkCount: chunkResult.chunkCount,
      signalCount: signalResult.signalCount,
    };
  },
);

/**
 * Reprocess article: delete existing data and process from scratch
 */
export const reprocessArticle = inngest.createFunction(
  {
    id: "article-reprocessing",
    name: "Reprocess Article",
    retries: 2,
  },
  { event: "article/reprocess.requested" },
  async ({ event, step }) => {
    const { articleId, userId, url } = event.data;

    // Step 1: Clean up existing data
    await step.run("cleanup-existing-data", async () => {
      const { inArray, and } = await import("drizzle-orm");
      const { dailySignal, transcriptChunk } = await import(
        "@/server/db/schema"
      );

      // Delete all existing chunks and signals in transaction
      await db.transaction(async (tx) => {
        const chunks = await tx.query.transcriptChunk.findMany({
          where: eq(transcriptChunk.articleId, articleId),
        });

        if (chunks.length > 0) {
          const chunkIds = chunks.map((c) => c.id);

          // Delete signals
          await tx
            .delete(dailySignal)
            .where(
              and(
                eq(dailySignal.userId, userId),
                inArray(dailySignal.chunkId, chunkIds),
              ),
            );

          // Delete chunks
          await tx
            .delete(transcriptChunk)
            .where(eq(transcriptChunk.articleId, articleId));
        }
      });

      return { deletedChunks: true };
    });

    // Step 2: Trigger regular processing (reuse the process function)
    const result = await step.invoke("process-article", {
      function: processArticle,
      data: {
        articleId,
        userId,
        url,
      },
    });

    return result;
  },
);

/**
 * Regenerate signals for an article without reprocessing chunks
 */
export const regenerateArticleSignals = inngest.createFunction(
  {
    id: "article-signal-regeneration",
    name: "Regenerate Article Signals",
    retries: 2,
  },
  { event: "article/signals.regenerate" },
  async ({ event, step }) => {
    const { articleId, userId } = event.data;

    // Step 1: Verify article has chunks
    await step.run("verify-chunks", async () => {
      const { transcriptChunk } = await import("@/server/db/schema");

      const chunks = await db.query.transcriptChunk.findMany({
        where: eq(transcriptChunk.articleId, articleId),
        limit: 1,
      });

      if (chunks.length === 0) {
        throw new NonRetriableError(
          "No chunks found. Process the article first.",
        );
      }

      return { hasChunks: true };
    });

    // Step 2: Delete pending signals and regenerate
    const result = await step.run("regenerate-signals", async () => {
      const { inArray, and, isNull } = await import("drizzle-orm");
      const { dailySignal, transcriptChunk } = await import(
        "@/server/db/schema"
      );

      await db.transaction(async (tx) => {
        // Get all chunk IDs for this article
        const chunks = await tx.query.transcriptChunk.findMany({
          where: eq(transcriptChunk.articleId, articleId),
        });

        const chunkIds = chunks.map((c) => c.id);

        // Delete only PENDING signals (preserve saved/skipped)
        await tx
          .delete(dailySignal)
          .where(
            and(
              eq(dailySignal.userId, userId),
              inArray(dailySignal.chunkId, chunkIds),
              isNull(dailySignal.userAction),
            ),
          );

        // Regenerate signals
        const signalResult = await generateArticleSignals({
          db: tx as unknown as typeof db,
          articleId,
          userId,
        });

        return {
          signalCount: signalResult.signalCount,
        };
      });

      return { signalCount: 0 };
    });

    return result;
  },
);
