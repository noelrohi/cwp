import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import {
  dailySignal,
  episode,
  podcast,
  transcriptChunk,
} from "../src/server/db/schema";

async function main() {
  const userId = "J2tMunffPYoZWSzGXbjwihHDoU6Ol5Gc";
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  console.log(
    `\n🔍 Checking chunks created after ${twoDaysAgo.toISOString()}\n`,
  );

  // Check all recent chunks for this user
  const recentChunks = await db
    .select({
      chunkId: transcriptChunk.id,
      episodeTitle: episode.title,
      createdAt: transcriptChunk.createdAt,
      hasEmbedding: sql<boolean>`${transcriptChunk.embedding} IS NOT NULL`,
      wordCount: transcriptChunk.wordCount,
      content: transcriptChunk.content,
    })
    .from(transcriptChunk)
    .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .innerJoin(podcast, eq(episode.podcastId, podcast.id))
    .where(
      and(
        eq(podcast.userId, userId),
        gte(transcriptChunk.createdAt, twoDaysAgo),
      ),
    )
    .orderBy(desc(transcriptChunk.createdAt))
    .limit(10);

  console.log(`Found ${recentChunks.length} recent chunks:\n`);

  for (const chunk of recentChunks) {
    const preview = `${chunk.content.substring(0, 50)}...`;
    const embedding = chunk.hasEmbedding ? "✓" : "✗";
    console.log(`   ${chunk.createdAt.toISOString()}`);
    console.log(`   Episode: ${chunk.episodeTitle}`);
    console.log(`   Words: ${chunk.wordCount}, Embedding: ${embedding}`);
    console.log(`   ${preview}\n`);
  }

  // Check if any already have signals
  if (recentChunks.length > 0) {
    const chunkIds = recentChunks.map((c) => c.chunkId);
    const existingSignals = await db
      .select({
        chunkId: dailySignal.chunkId,
      })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, userId),
          sql`${dailySignal.chunkId} = ANY(${chunkIds})`,
        ),
      );

    console.log(
      `${existingSignals.length} of these chunks already have signals generated\n`,
    );
  }

  // Check word count constraints
  const CHUNK_SETTINGS = { minWords: 30, maxWords: 300 };
  const validWordCount = recentChunks.filter(
    (c) =>
      (c.wordCount ?? 0) >= CHUNK_SETTINGS.minWords &&
      (c.wordCount ?? 0) <= CHUNK_SETTINGS.maxWords,
  ).length;

  console.log(
    `Chunks with valid word count (30-300): ${validWordCount}/${recentChunks.length}`,
  );
  console.log(
    `Chunks with embeddings: ${recentChunks.filter((c) => c.hasEmbedding).length}/${recentChunks.length}\n`,
  );
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
