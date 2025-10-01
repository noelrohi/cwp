import { and, eq, gte, isNull, sql } from "drizzle-orm";
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
  const CHUNK_SETTINGS = { minWords: 30, maxWords: 300 };

  console.log(
    `\n🔍 Checking valid chunks (30-300 words, has embedding, no existing signal)\n`,
  );

  // This matches the exact query from daily-intelligence-pipeline.ts
  const validChunks = await db
    .select({
      id: transcriptChunk.id,
      content: transcriptChunk.content,
      wordCount: transcriptChunk.wordCount,
      episodeTitle: episode.title,
    })
    .from(transcriptChunk)
    .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .innerJoin(podcast, eq(episode.podcastId, podcast.id))
    .leftJoin(
      dailySignal,
      and(
        eq(dailySignal.chunkId, transcriptChunk.id),
        eq(dailySignal.userId, userId),
      ),
    )
    .where(
      and(
        eq(podcast.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
        isNull(dailySignal.id),
        gte(transcriptChunk.createdAt, twoDaysAgo),
        sql`${transcriptChunk.wordCount} >= ${CHUNK_SETTINGS.minWords}`,
        sql`${transcriptChunk.wordCount} <= ${CHUNK_SETTINGS.maxWords}`,
      ),
    );

  console.log(`Found ${validChunks.length} valid chunks\n`);

  if (validChunks.length > 0) {
    console.log("Sample of valid chunks:\n");
    for (const chunk of validChunks.slice(0, 5)) {
      const preview = `${chunk.content.substring(0, 60)}...`;
      console.log(`   ${chunk.episodeTitle}`);
      console.log(`   ${chunk.wordCount} words: ${preview}\n`);
    }
  } else {
    console.log("❌ No valid chunks found. Possible reasons:");
    console.log("   1. All chunks already have signals generated");
    console.log("   2. Chunks are too short/long (need 30-300 words)");
    console.log("   3. Embeddings not generated yet");
    console.log("   4. No new episodes in last 2 days\n");
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
