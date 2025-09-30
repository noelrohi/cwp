#!/usr/bin/env tsx

import { cosineSimilarity } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";

const userId = process.argv[2];

if (!userId) {
  console.error("Usage: tsx scripts/analyze-skip-patterns.ts <userId>");
  process.exit(1);
}

async function analyzeSkips() {
  console.log(`\n🔍 Analyzing skip patterns for user: ${userId}\n`);

  // Get saved chunks for centroid
  const savedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  if (savedChunks.length === 0) {
    console.log("❌ No saved chunks found");
    return;
  }

  // Calculate centroid
  const dimensions = savedChunks[0].embedding!.length;
  const centroid = new Array(dimensions).fill(0);
  for (const chunk of savedChunks) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += (chunk.embedding as number[])[i];
    }
  }
  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= savedChunks.length;
  }

  console.log(`✓ Computed centroid from ${savedChunks.length} saved chunks\n`);

  // Get skipped chunks
  const skippedChunks = await db
    .select({
      content: transcriptChunk.content,
      embedding: transcriptChunk.embedding,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "skipped"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  console.log(`✓ Found ${skippedChunks.length} skipped chunks\n`);

  // Compare skipped chunks to centroid
  const skipSimilarities = skippedChunks.map((chunk) => {
    return cosineSimilarity(chunk.embedding as number[], centroid);
  });

  const avgSkipSim =
    skipSimilarities.reduce((a, b) => a + b, 0) / skipSimilarities.length;

  // Get average saved similarity for comparison
  const avgSavedSim =
    savedChunks
      .map((c) => cosineSimilarity(c.embedding as number[], centroid))
      .reduce((a, b) => a + b, 0) / savedChunks.length;

  console.log("📊 Similarity to Centroid:\n");
  console.log(`   Saved chunks:   ${(avgSavedSim * 100).toFixed(1)}%`);
  console.log(`   Skipped chunks: ${(avgSkipSim * 100).toFixed(1)}%`);

  const difference = avgSavedSim - avgSkipSim;
  console.log(
    `   Difference:     ${(difference * 100).toFixed(1)}% ${difference > 0.15 ? "✅ Clear difference" : "⚠️ Weak difference"}`,
  );

  // Show distribution of skipped similarities
  const buckets = [0, 0.3, 0.5, 0.7, 0.9, 1.0];
  const distribution = new Array(buckets.length - 1).fill(0);

  for (const sim of skipSimilarities) {
    for (let i = 0; i < buckets.length - 1; i++) {
      if (sim >= buckets[i] && sim < buckets[i + 1]) {
        distribution[i]++;
        break;
      }
    }
  }

  console.log("\n📊 Skip Score Distribution:\n");
  for (let i = 0; i < distribution.length; i++) {
    const pct = ((distribution[i] / skipSimilarities.length) * 100).toFixed(1);
    const label = `${(buckets[i] * 100).toFixed(0)}-${(buckets[i + 1] * 100).toFixed(0)}%`;
    console.log(`   ${label.padEnd(10)} ${distribution[i]} (${pct}%)`);
  }

  console.log("\n💡 Interpretation:");
  if (difference < 0.1) {
    console.log(
      "   ⚠️ Skipped content is similar to saved content (difference <10%)",
    );
    console.log(
      "   → Skip is NOISY signal - users skip for reasons other than dislike",
    );
    console.log("   → Do NOT use skips for training yet");
  } else if (difference < 0.2) {
    console.log("   ⚠️ Weak separation between saved and skipped (10-20%)");
    console.log("   → Skip signal is ambiguous");
    console.log("   → Could test negative examples with LOW weight (0.1-0.2)");
  } else {
    console.log("   ✅ Strong separation between saved and skipped (>20%)");
    console.log("   → Skip is genuine negative signal");
    console.log("   → Could benefit from negative example training");
  }

  console.log();
}

analyzeSkips()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });