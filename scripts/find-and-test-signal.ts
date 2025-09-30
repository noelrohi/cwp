#!/usr/bin/env tsx

import { cosineSimilarity } from "ai";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  transcriptChunk,
} from "@/server/db/schema/podcast";

const userId = "J2tMunffPYoZWSzGXbjwihHDoU6Ol5Gc";
const searchTerm = process.argv[2] || "bubble";

async function findAndTest() {
  console.log(`\n🔍 Searching for signals containing: "${searchTerm}"\n`);

  const signals = await db
    .select({
      id: dailySignal.id,
      content: transcriptChunk.content,
      embedding: transcriptChunk.embedding,
      relevanceScore: dailySignal.relevanceScore,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, userId),
        isNull(dailySignal.userAction),
        like(transcriptChunk.content, `%${searchTerm}%`),
      ),
    );

  if (signals.length === 0) {
    console.log(`❌ No pending signals found containing "${searchTerm}"`);
    process.exit(0);
  }

  console.log(`✓ Found ${signals.length} signals\n`);

  // Pick the highest scoring one
  const targetSignal = signals.sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  )[0];

  console.log(`📊 Testing highest-scoring signal:\n`);
  console.log(`Score: ${(targetSignal.relevanceScore * 100).toFixed(1)}%\n`);
  console.log(`Content:\n${targetSignal.content.substring(0, 300)}...\n`);
  console.log("=".repeat(80));

  if (!targetSignal.embedding) {
    console.log("❌ Signal has no embedding");
    process.exit(1);
  }

  // Get user's saved chunks
  const savedChunks = await db
    .select({
      content: transcriptChunk.content,
      embedding: transcriptChunk.embedding,
    })
    .from(transcriptChunk)
    .innerJoin(dailySignal, eq(transcriptChunk.id, dailySignal.chunkId))
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "saved"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  console.log(`\n🔍 Comparing to ${savedChunks.length} saved chunks:\n`);

  const similarities = savedChunks.map((chunk) => {
    const sim = cosineSimilarity(
      targetSignal.embedding as number[],
      chunk.embedding as number[],
    );
    return {
      similarity: sim,
      content: chunk.content.substring(0, 100).replace(/\n/g, " "),
    };
  });

  similarities.sort((a, b) => b.similarity - a.similarity);

  console.log("✅ Top 5 Most Similar Saved Chunks:\n");
  for (let i = 0; i < Math.min(5, similarities.length); i++) {
    const sim = similarities[i];
    console.log(`   ${(sim.similarity * 100).toFixed(1)}% - ${sim.content}...`);
  }

  console.log("\n❌ Bottom 5 Least Similar Saved Chunks:\n");
  const start = Math.max(0, similarities.length - 5);
  for (let i = start; i < similarities.length; i++) {
    const sim = similarities[i];
    console.log(`   ${(sim.similarity * 100).toFixed(1)}% - ${sim.content}...`);
  }

  const avgSim =
    similarities.reduce((sum, s) => sum + s.similarity, 0) /
    similarities.length;

  console.log(`\n📊 Statistics:`);
  console.log(`   Average similarity: ${(avgSim * 100).toFixed(1)}%`);
  console.log(`   Model's score: ${(targetSignal.relevanceScore * 100).toFixed(1)}%`);
  console.log(
    `   Difference: ${((targetSignal.relevanceScore - avgSim) * 100).toFixed(1)}%`,
  );

  if (Math.abs(targetSignal.relevanceScore - avgSim) < 0.05) {
    console.log(`   ✓ Model score matches similarity (within 5%)`);
  } else {
    console.log(`   ⚠ Model score differs from actual similarity`);
  }

  console.log();
}

findAndTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });