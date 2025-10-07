import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { generateEmbedding } from "@/lib/embedding";
import {
  article,
  dailySignal,
  episode,
  podcast,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

/**
 * RAG Router: Semantic search over user's processed podcast content
 *
 * Enables "chat with episodes" using existing Postgres pgvector embeddings
 * No external vector DB needed - everything lives in your database
 */
export const ragRouter = createTRPCRouter({
  /**
   * Search user's saved content semantically
   * Use this for: "Show me what I saved about [topic]"
   */
  searchSaved: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1, "Query cannot be empty"),
        limit: z.number().int().min(1).max(50).default(10),
        minRelevanceScore: z.number().min(0).max(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      console.log(`\n🔍 [RAG Router: searchSaved] Query: "${input.query}"`);
      console.log(`   User: ${ctx.user.id}`);
      console.log(`   Limit: ${input.limit}`);

      // Generate embedding for search query
      const startEmbed = Date.now();
      const queryEmbedding = await generateEmbedding(input.query);
      const embeddingString = JSON.stringify(queryEmbedding);
      console.log(`   Embedding generated in ${Date.now() - startEmbed}ms`);

      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        eq(dailySignal.userAction, "saved"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ];

      // Optional: filter by original AI relevance score
      if (input.minRelevanceScore !== undefined) {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= ${input.minRelevanceScore}`,
        );
      }

      const startQuery = Date.now();
      const results = await ctx.db
        .select({
          chunkId: transcriptChunk.id,
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          startTimeSec: transcriptChunk.startTimeSec,
          endTimeSec: transcriptChunk.endTimeSec,
          // Episode context (nullable for articles)
          episodeId: episode.id,
          episodeTitle: episode.title,
          episodePublishedAt: episode.publishedAt,
          episodeAudioUrl: episode.audioUrl,
          // Podcast context (nullable for articles)
          podcastId: podcast.id,
          podcastTitle: podcast.title,
          podcastImageUrl: podcast.imageUrl,
          // Article context (nullable for podcasts)
          articleId: article.id,
          articleTitle: article.title,
          articleUrl: article.url,
          articleAuthor: article.author,
          articleSiteName: article.siteName,
          // Signals
          relevanceScore: dailySignal.relevanceScore,
          savedAt: dailySignal.actionedAt,
          // Vector similarity
          similarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${embeddingString}::vector)`,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .leftJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .leftJoin(podcast, eq(episode.podcastId, podcast.id))
        .leftJoin(article, eq(transcriptChunk.articleId, article.id))
        .where(and(...whereConditions))
        .orderBy(
          sql`${transcriptChunk.embedding} <=> ${embeddingString}::vector`,
        )
        .limit(input.limit);

      console.log(`   Query executed in ${Date.now() - startQuery}ms`);
      console.log(
        `✅ [RAG Router: searchSaved] Found ${results.length} results\n`,
      );

      return results.map((r) => {
        // Determine source type and create appropriate citation
        const isArticle = !!r.articleId;
        const citation = isArticle
          ? `${r.articleSiteName || "Article"} - ${r.articleTitle} (${r.articleAuthor || "Unknown author"})`
          : `${r.podcastTitle} - ${r.episodeTitle} (${formatTimestamp(r.startTimeSec)})`;

        return {
          ...r,
          citation,
        };
      });
    }),

  /**
   * Search ALL episodes (not just saved) - global semantic search
   * Use this for: "Find any discussion about [topic] in my podcasts"
   */
  searchAll: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1, "Query cannot be empty"),
        limit: z.number().int().min(1).max(50).default(20),
        podcastIds: z.array(z.string()).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const queryEmbedding = await generateEmbedding(input.query);
      const embeddingString = JSON.stringify(queryEmbedding);

      // Search both podcasts and articles
      const whereConditions = [
        sql`${transcriptChunk.embedding} IS NOT NULL`,
        or(
          eq(podcast.userId, ctx.user.id), // For podcasts
          eq(article.userId, ctx.user.id), // For articles
        ),
      ];

      // Optional: filter by specific podcasts
      if (input.podcastIds && input.podcastIds.length > 0) {
        whereConditions.push(
          sql`${podcast.id} IN (${sql.join(
            input.podcastIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      }

      const results = await ctx.db
        .select({
          chunkId: transcriptChunk.id,
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          startTimeSec: transcriptChunk.startTimeSec,
          endTimeSec: transcriptChunk.endTimeSec,
          // Episode/podcast (nullable for articles)
          episodeId: episode.id,
          episodeTitle: episode.title,
          episodePublishedAt: episode.publishedAt,
          episodeAudioUrl: episode.audioUrl,
          podcastId: podcast.id,
          podcastTitle: podcast.title,
          podcastImageUrl: podcast.imageUrl,
          // Article (nullable for podcasts)
          articleId: article.id,
          articleTitle: article.title,
          articleUrl: article.url,
          articleAuthor: article.author,
          articleSiteName: article.siteName,
          similarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${embeddingString}::vector)`,
        })
        .from(transcriptChunk)
        .leftJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .leftJoin(podcast, eq(episode.podcastId, podcast.id))
        .leftJoin(article, eq(transcriptChunk.articleId, article.id))
        .where(and(...whereConditions))
        .orderBy(
          sql`${transcriptChunk.embedding} <=> ${embeddingString}::vector`,
        )
        .limit(input.limit);

      return results.map((r) => {
        const isArticle = !!r.articleId;
        const citation = isArticle
          ? `${r.articleSiteName || "Article"} - ${r.articleTitle} (${r.articleAuthor || "Unknown author"})`
          : `${r.podcastTitle} - ${r.episodeTitle} (${formatTimestamp(r.startTimeSec)})`;

        return {
          ...r,
          citation,
        };
      });
    }),

  /**
   * Hybrid search: semantic + user preference signals
   * Use this for: personalized search that considers both similarity and user behavior
   */
  searchHybrid: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1, "Query cannot be empty"),
        limit: z.number().int().min(1).max(50).default(15),
        includeSkipped: z.boolean().default(false),
        minRelevanceScore: z.number().min(0).max(1).default(0.5),
      }),
    )
    .query(async ({ ctx, input }) => {
      const queryEmbedding = await generateEmbedding(input.query);
      const embeddingString = JSON.stringify(queryEmbedding);

      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
        sql`${dailySignal.relevanceScore} >= ${input.minRelevanceScore}`,
      ];

      // Filter by user action
      if (!input.includeSkipped) {
        whereConditions.push(eq(dailySignal.userAction, "saved"));
      }

      const results = await ctx.db
        .select({
          chunkId: transcriptChunk.id,
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          startTimeSec: transcriptChunk.startTimeSec,
          endTimeSec: transcriptChunk.endTimeSec,
          episodeId: episode.id,
          episodeTitle: episode.title,
          podcastId: podcast.id,
          podcastTitle: podcast.title,
          podcastImageUrl: podcast.imageUrl,
          // Multiple signals for scoring
          semanticSimilarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${embeddingString}::vector)`,
          aiRelevanceScore: dailySignal.relevanceScore,
          userAction: dailySignal.userAction,
          actionedAt: dailySignal.actionedAt,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .innerJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(and(...whereConditions))
        .orderBy(
          sql`${transcriptChunk.embedding} <=> ${embeddingString}::vector`,
        )
        .limit(input.limit);

      // Re-rank with hybrid scoring
      // You can tune these weights based on user feedback
      return results
        .map((r) => ({
          ...r,
          // Hybrid score: 60% semantic, 30% AI relevance, 10% user action
          hybridScore:
            0.6 * (r.semanticSimilarity ?? 0) +
            0.3 * (r.aiRelevanceScore ?? 0) +
            0.1 * (r.userAction === "saved" ? 1 : 0),
          citation: `${r.podcastTitle} - ${r.episodeTitle} (${formatTimestamp(r.startTimeSec)})`,
        }))
        .sort((a, b) => b.hybridScore - a.hybridScore);
    }),

  /**
   * Get context for LLM - formats search results for RAG
   * Use this to prepare context before sending to OpenAI
   */
  getContext: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        scope: z.enum(["saved", "all", "hybrid"]).default("saved"),
        limit: z.number().int().min(1).max(20).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Generate query embedding
      const queryEmbedding = await generateEmbedding(input.query);
      const embeddingString = JSON.stringify(queryEmbedding);

      // Fetch search results
      const results = await ctx.db
        .select({
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          episodeTitle: episode.title,
          podcastTitle: podcast.title,
          startTimeSec: transcriptChunk.startTimeSec,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .innerJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(
          and(
            eq(dailySignal.userId, ctx.user.id),
            eq(dailySignal.userAction, "saved"),
            sql`${transcriptChunk.embedding} IS NOT NULL`,
          ),
        )
        .orderBy(
          sql`${transcriptChunk.embedding} <=> ${embeddingString}::vector`,
        )
        .limit(input.limit);

      // Format for LLM
      const context = results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.podcastTitle} - ${r.episodeTitle} (${r.speaker || "Unknown"}, ${formatTimestamp(r.startTimeSec)})\n${r.content}`,
        )
        .join("\n\n");

      return {
        context,
        sources: results.map((r) => ({
          podcast: r.podcastTitle,
          episode: r.episodeTitle,
          speaker: r.speaker,
          timestamp: formatTimestamp(r.startTimeSec),
        })),
      };
    }),
});

// Helper function to format timestamps for citations
function formatTimestamp(seconds: number | null): string {
  if (seconds === null) return "unknown time";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
