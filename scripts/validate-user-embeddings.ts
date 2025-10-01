#!/usr/bin/env tsx
/**
 * Script to validate embedding quality for a user
 * Usage: pnpm tsx scripts/validate-user-embeddings.ts <userId>
 */

import { cosineSimilarity } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { savedChunk, transcriptChunk } from "@/server/db/schema/podcast";

function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error("Cannot calculate centroid of empty embedding set");
  }

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

async function validateUserEmbeddings(userId: string) {
  console.log(`\n🔍 Validating embeddings for user: ${userId}\n`);

  // Get saved chunks with embeddings
  const savedChunks = await db
    .select({
      chunkId: transcriptChunk.id,
      embedding: transcriptChunk.embedding,
      content: transcriptChunk.content,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    )
    .limit(50);

  if (savedChunks.length === 0) {
    console.log("❌ No saved chunks with embeddings found for this user");
    console.log("   User needs to save at least 10 signals first\n");
    return;
  }

  console.log(`✓ Found ${savedChunks.length} saved chunks with embeddings\n`);

  const embeddings = savedChunks.map((c) => c.embedding as number[]);

  // Calculate centroid
  const centroid = calculateCentroid(embeddings);
  const centroidNorm = Math.sqrt(
    centroid.reduce((sum, val) => sum + val * val, 0),
  );

  console.log(`📊 Centroid Stats:`);
  console.log(`   Norm: ${centroidNorm.toFixed(4)}`);
  console.log(`   Dimensions: ${centroid.length}\n`);

  // Compute pairwise similarity among saved chunks
  console.log(`🔗 Computing pairwise similarities...`);
  const pairwiseSimilarities: number[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      pairwiseSimilarities.push(sim);
    }
  }

  const avgPairwiseSim =
    pairwiseSimilarities.length > 0
      ? pairwiseSimilarities.reduce((a, b) => a + b, 0) /
        pairwiseSimilarities.length
      : 0;

  console.log(`   Average: ${(avgPairwiseSim * 100).toFixed(1)}%`);
  console.log(
    `   Min: ${(Math.min(...pairwiseSimilarities) * 100).toFixed(1)}%`,
  );
  console.log(
    `   Max: ${(Math.max(...pairwiseSimilarities) * 100).toFixed(1)}%`,
  );

  if (avgPairwiseSim > 0.5) {
    console.log(`   ✓ Saved chunks cluster together`);
  } else {
    console.log(`   ⚠ Saved chunks are diverse`);
  }
  console.log();

  // Compute each saved chunk's similarity to centroid
  console.log(`📍 Saved chunks → Centroid:`);
  const savedToCentroid = embeddings.map((emb) =>
    cosineSimilarity(emb, centroid),
  );
  const avgSavedToCentroid =
    savedToCentroid.reduce((a, b) => a + b, 0) / savedToCentroid.length;

  console.log(`   Average: ${(avgSavedToCentroid * 100).toFixed(1)}%`);
  console.log(`   Min: ${(Math.min(...savedToCentroid) * 100).toFixed(1)}%`);
  console.log(`   Max: ${(Math.max(...savedToCentroid) * 100).toFixed(1)}%`);

  if (avgSavedToCentroid > 0.7) {
    console.log(`   ✓ Centroid represents saved content well`);
  } else {
    console.log(`   ⚠ Centroid may be poorly defined`);
  }
  console.log();

  // Get 50 random chunks with embeddings
  console.log(`🎲 Getting 50 random chunks for baseline...`);
  const randomChunks = await db
    .select({
      chunkId: transcriptChunk.id,
      embedding: transcriptChunk.embedding,
    })
    .from(transcriptChunk)
    .where(sql`${transcriptChunk.embedding} IS NOT NULL`)
    .orderBy(sql`RANDOM()`)
    .limit(50);

  // Compute random chunks' similarity to centroid
  const randomToCentroid = randomChunks
    .filter((c) => c.embedding)
    .map((c) => cosineSimilarity(c.embedding as number[], centroid));

  const avgRandomToCentroid =
    randomToCentroid.length > 0
      ? randomToCentroid.reduce((a, b) => a + b, 0) / randomToCentroid.length
      : 0;

  console.log(`📍 Random chunks → Centroid:`);
  console.log(`   Average: ${(avgRandomToCentroid * 100).toFixed(1)}%`);
  console.log(`   Min: ${(Math.min(...randomToCentroid) * 100).toFixed(1)}%`);
  console.log(`   Max: ${(Math.max(...randomToCentroid) * 100).toFixed(1)}%`);
  console.log(`   Sample size: ${randomToCentroid.length}`);
  console.log();

  // Calculate separation
  const separation =
    ((avgSavedToCentroid - avgRandomToCentroid) / avgRandomToCentroid) * 100;

  console.log(`🎯 KEY TEST: Separation Score`);
  console.log(`   Saved avg: ${(avgSavedToCentroid * 100).toFixed(1)}%`);
  console.log(`   Random avg: ${(avgRandomToCentroid * 100).toFixed(1)}%`);
  console.log(`   Separation: ${separation.toFixed(1)}% higher\n`);

  if (avgSavedToCentroid > avgRandomToCentroid * 1.2) {
    console.log(`   ✅ GOOD: Strong separation - ranking should work!`);
  } else if (avgSavedToCentroid > avgRandomToCentroid * 1.05) {
    console.log(`   ⚠️  WEAK: Some separation but need more training data`);
  } else {
    console.log(`   ❌ BAD: No separation - embeddings may be broken!`);
  }

  console.log();
  console.log(`📝 Interpretation:`);

  if (
    avgSavedToCentroid > 0.7 &&
    avgSavedToCentroid > 0.8 &&
    avgRandomToCentroid < 0.6
  ) {
    console.log(`   ✓ System is working correctly`);
    console.log(`   ✓ Centroid represents user preferences`);
    console.log(`   ✓ Can distinguish saved from random content`);
  } else if (avgSavedToCentroid > 0.7 && avgRandomToCentroid > 0.7) {
    console.log(`   ✗ Centroid update logic may be broken`);
    console.log(`   ✗ All content looks the same to the model`);
    console.log(`   → Check continuous-learning.ts centroid updates`);
  } else if (avgSavedToCentroid < 0.6 && avgRandomToCentroid < 0.6) {
    console.log(`   ⚠ Embedding space geometry is uniform`);
    console.log(`   → User may have diverse interests`);
    console.log(`   → Or needs more training data (save more signals)`);
  } else {
    console.log(`   ⚠ Results are mixed - investigate further`);
  }

  console.log();
}

// Main execution
const userId = process.argv[2];

if (!userId) {
  console.error("Usage: pnpm tsx scripts/validate-user-embeddings.ts <userId>");
  process.exit(1);
}

validateUserEmbeddings(userId)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
