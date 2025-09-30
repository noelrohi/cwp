import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { savedChunk, transcriptChunk } from "@/server/db/schema/podcast";

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error(
      "Usage: tsx scripts/check-saved-chunks-embeddings.ts <userId>",
    );
    process.exit(1);
  }

  const savedChunks = await db
    .select({
      savedId: savedChunk.id,
      chunkId: savedChunk.chunkId,
      savedAt: savedChunk.savedAt,
      episodeId: transcriptChunk.episodeId,
      hasEmbedding: sql<boolean>`${transcriptChunk.embedding} IS NOT NULL`,
    })
    .from(savedChunk)
    .leftJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(eq(savedChunk.userId, userId));

  console.log(`\n📊 Saved chunks for user: ${userId}\n`);
  console.log(`Total saved: ${savedChunks.length}\n`);

  let withEmbedding = 0;
  let withoutEmbedding = 0;
  const episodesNeedingRegeneration = new Set<string>();

  for (const chunk of savedChunks) {
    const hasEmbed = chunk.hasEmbedding;
    if (hasEmbed) {
      withEmbedding++;
    } else {
      withoutEmbedding++;
      if (chunk.episodeId) {
        episodesNeedingRegeneration.add(chunk.episodeId);
      }
    }

    console.log(`${hasEmbed ? "✅" : "❌"} Chunk ${chunk.chunkId}`);
    console.log(`   Saved: ${chunk.savedAt?.toISOString()}`);
    console.log(`   Episode: ${chunk.episodeId || "N/A"}`);
    console.log(`   Has embedding: ${hasEmbed}`);
    console.log();
  }

  console.log(`\n📈 Summary:`);
  console.log(`   With embeddings: ${withEmbedding}`);
  console.log(`   Without embeddings: ${withoutEmbedding}`);

  if (episodesNeedingRegeneration.size > 0) {
    console.log(`\n🔄 Episodes that need embedding regeneration:`);
    for (const episodeId of episodesNeedingRegeneration) {
      console.log(`   - ${episodeId}`);
    }
  }
}

main();
