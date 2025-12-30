import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { db } from "@/server/db";
import {
  article as articleSchema,
  episodeSummary,
  transcriptChunk,
} from "@/server/db/schema";
import {
  chunkArticleContent,
  cleanMarkdownContent,
  extractArticleBody,
  extractArticleContent,
} from "@/server/lib/article-processing";
import { generateArticleSummary } from "@/server/lib/episode-summary";
import { inngest } from "../client";

/**
 * Process article: extract content, chunk, and generate summary
 */
export const processArticle = inngest.createFunction(
  {
    id: "article-processing",
    name: "Process Article",
    retries: 2,
  },
  { event: "article/process.requested" },
  async ({ event, step }) => {
    const { articleId, url } = event.data;

    // Step 1: Mark as processing
    await step.run("mark-processing", async () => {
      await db
        .update(articleSchema)
        .set({ status: "processing", errorMessage: null })
        .where(eq(articleSchema.id, articleId));

      return { articleId, status: "processing" };
    });

    // Step 2: Extract article content
    const extractedContent = await step.run("extract-content", async () => {
      try {
        const existingArticle = await db.query.article.findFirst({
          where: eq(articleSchema.id, articleId),
        });

        if (!existingArticle) {
          throw new NonRetriableError("Article not found");
        }

        let content: string;
        let title = existingArticle.title;

        if (existingArticle.rawContent) {
          const rawBodyContent = extractArticleBody(existingArticle.rawContent);
          content = cleanMarkdownContent(rawBodyContent);

          if (!content || content.trim().length < 100) {
            throw new NonRetriableError(
              "Stored article content too short or empty",
            );
          }
        } else if (
          existingArticle.source === "email" ||
          existingArticle.source === "readwise"
        ) {
          throw new NonRetriableError(
            `Article source is '${existingArticle.source}' but rawContent is missing. Email and Readwise articles must have content pre-populated.`,
          );
        } else {
          const extracted = await extractArticleContent(url);

          if (!extracted.content || extracted.content.trim().length < 100) {
            throw new NonRetriableError("Article content too short or empty");
          }

          content = extracted.content;
          title = extracted.title;

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
        }

        return {
          content,
          title,
          wordCount: content.split(/\s+/).length,
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

    // Step 3: Generate article summary
    await step.run("generate-summary", async () => {
      try {
        const markdownContent = await generateArticleSummary(
          extractedContent.content,
          extractedContent.title,
        );

        await db.insert(episodeSummary).values({
          id: randomUUID(),
          articleId,
          markdownContent,
        });

        return { summaryGenerated: true };
      } catch (error) {
        console.error("Failed to generate article summary:", error);
        return { summaryGenerated: false };
      }
    });

    // Step 4: Chunk content (without embeddings)
    const chunkResult = await step.run("chunk-content", async () => {
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
      };
    });

    return {
      articleId,
      title: extractedContent.title,
      wordCount: extractedContent.wordCount,
      chunkCount: chunkResult.chunkCount,
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
    const { articleId, url } = event.data;

    // Step 1: Clean up existing data
    await step.run("cleanup-existing-data", async () => {
      await db.transaction(async (tx) => {
        // Delete chunks
        await tx
          .delete(transcriptChunk)
          .where(eq(transcriptChunk.articleId, articleId));

        // Delete article summary
        await tx
          .delete(episodeSummary)
          .where(eq(episodeSummary.articleId, articleId));
      });

      return { deletedData: true };
    });

    // Step 2: Trigger full processing
    const result = await step.invoke("process-article", {
      function: processArticle,
      data: {
        articleId,
        url,
      },
    });

    return result;
  },
);
