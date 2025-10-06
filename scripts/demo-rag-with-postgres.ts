/**
 * Demo: RAG over user's saved chunks using existing Postgres pgvector
 *
 * This shows you ALREADY have everything needed for "chat with episodes"
 * No Chroma required!
 */

import { and, eq, sql } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embedding";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  podcast,
  transcriptChunk,
} from "@/server/db/schema/podcast";

/**
 * Search user's saved content semantically
 */
export async function searchUserSavedContent(
  userId: string,
  query: string,
  limit = 10,
) {
  // 1. Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // 2. Search saved chunks using cosine similarity
  const results = await db
    .select({
      chunkId: transcriptChunk.id,
      content: transcriptChunk.content,
      speaker: transcriptChunk.speaker,
      startTimeSec: transcriptChunk.startTimeSec,
      endTimeSec: transcriptChunk.endTimeSec,
      episodeId: episode.id,
      episodeTitle: episode.title,
      episodeAudioUrl: episode.audioUrl,
      podcastTitle: podcast.title,
      podcastImageUrl: podcast.imageUrl,
      relevanceScore: dailySignal.relevanceScore,
      similarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)})`,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .innerJoin(podcast, eq(episode.podcastId, podcast.id))
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "saved"), // Only saved content
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(
      sql`${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)}`,
    )
    .limit(limit);

  return results;
}

/**
 * Search ALL processed chunks (not just saved) - global episode search
 */
export async function searchAllEpisodes(
  userId: string,
  query: string,
  limit = 10,
) {
  const queryEmbedding = await generateEmbedding(query);

  // Search across ALL chunks from user's subscribed podcasts
  const results = await db
    .select({
      chunkId: transcriptChunk.id,
      content: transcriptChunk.content,
      speaker: transcriptChunk.speaker,
      startTimeSec: transcriptChunk.startTimeSec,
      endTimeSec: transcriptChunk.endTimeSec,
      episodeId: episode.id,
      episodeTitle: episode.title,
      episodeAudioUrl: episode.audioUrl,
      podcastTitle: podcast.title,
      podcastImageUrl: podcast.imageUrl,
      similarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)})`,
    })
    .from(transcriptChunk)
    .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .innerJoin(podcast, eq(episode.podcastId, podcast.id))
    .where(
      and(
        eq(podcast.userId, userId), // User's podcasts
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(
      sql`${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)}`,
    )
    .limit(limit);

  return results;
}

/**
 * Hybrid search: combine semantic + keyword + user preference signals
 */
export async function hybridSearch(
  userId: string,
  query: string,
  options: {
    includeSkipped?: boolean;
    minRelevanceScore?: number;
    limit?: number;
  } = {},
) {
  const {
    includeSkipped = false,
    minRelevanceScore = 0.5,
    limit = 20,
  } = options;

  const queryEmbedding = await generateEmbedding(query);

  const whereConditions = [
    eq(dailySignal.userId, userId),
    sql`${transcriptChunk.embedding} IS NOT NULL`,
  ];

  // Filter by user action
  if (!includeSkipped) {
    whereConditions.push(eq(dailySignal.userAction, "saved"));
  }

  // Filter by relevance score (AI's original assessment)
  if (minRelevanceScore > 0) {
    whereConditions.push(
      sql`${dailySignal.relevanceScore} >= ${minRelevanceScore}`,
    );
  }

  const results = await db
    .select({
      chunkId: transcriptChunk.id,
      content: transcriptChunk.content,
      speaker: transcriptChunk.speaker,
      startTimeSec: transcriptChunk.startTimeSec,
      endTimeSec: transcriptChunk.endTimeSec,
      episodeId: episode.id,
      episodeTitle: episode.title,
      podcastTitle: podcast.title,
      podcastImageUrl: podcast.imageUrl,
      // Multiple signals for re-ranking
      semanticSimilarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)})`,
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
      sql`${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)}`,
    )
    .limit(limit);

  // You can re-rank these on the client with weighted scoring:
  // finalScore = 0.6 * semanticSimilarity + 0.3 * aiRelevanceScore + 0.1 * recencyBoost

  return results;
}

// Example usage in a tRPC endpoint:
/*
export const ragRouter = createTRPCRouter({
  search: protectedProcedure
    .input(z.object({ 
      query: z.string(),
      scope: z.enum(["saved", "all", "hybrid"]).default("saved"),
      limit: z.number().min(1).max(50).default(10)
    }))
    .query(async ({ ctx, input }) => {
      switch (input.scope) {
        case "saved":
          return searchUserSavedContent(ctx.user.id, input.query, input.limit);
        case "all":
          return searchAllEpisodes(ctx.user.id, input.query, input.limit);
        case "hybrid":
          return hybridSearch(ctx.user.id, input.query, { limit: input.limit });
      }
    }),
});
*/
