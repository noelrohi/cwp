#!/usr/bin/env tsx

import { cosineSimilarity } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";

const signalId = process.argv[2];

if (!signalId) {
  console.error("Usage: tsx scripts/test-specific-signal.ts <signalId>");
  process.exit(1);
}

async function testSignal() {
  // Get the signal
  const signal = await db
    .select({
      id: dailySignal.id,
      content: transcriptChunk.content,
      embedding: transcriptChunk.embedding,
      relevanceScore: dailySignal.relevanceScore,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(eq(dailySignal.id, signalId))
    .limit(1);

  if (signal.length === 0) {
    console.error("Signal not found");
    process.exit(1);
  }

  const targetSignal = signal[0];

  console.log(`\n📊 Analyzing Signal: ${signalId}\n`);
  console.log(
    `Current Score: ${(targetSignal.relevanceScore * 100).toFixed(1)}%\n`,
  );
  console.log(`Content:\n${targetSignal.content}\n`);
  console.log("=".repeat(80));

  if (!targetSignal.embedding) {
    console.log("❌ Signal has no embedding");
    process.exit(1);
  }

  // Get user's saved chunks
  const userId = await db
    .select({ userId: dailySignal.userId })
    .from(dailySignal)
    .where(eq(dailySignal.id, signalId))
    .limit(1);

  if (userId.length === 0) {
    console.error("User not found");
    process.exit(1);
  }

  const savedChunks = await db
    .select({
      content: transcriptChunk.content,
      embedding: transcriptChunk.embedding,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId[0].userId),
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
      content: chunk.content.substring(0, 100),
    };
  });

  similarities.sort((a, b) => b.similarity - a.similarity);

  console.log("Top 5 Most Similar Saved Chunks:\n");
  for (let i = 0; i < Math.min(5, similarities.length); i++) {
    const sim = similarities[i];
    console.log(`${(sim.similarity * 100).toFixed(1)}% - ${sim.content}...`);
  }

  console.log("\n\nBottom 5 Least Similar Saved Chunks:\n");
  for (
    let i = Math.max(0, similarities.length - 5);
    i < similarities.length;
    i++
  ) {
    const sim = similarities[i];
    console.log(`${(sim.similarity * 100).toFixed(1)}% - ${sim.content}...`);
  }

  const avgSim =
    similarities.reduce((sum, s) => sum + s.similarity, 0) /
    similarities.length;
  console.log(
    `\n📊 Average similarity to saved content: ${(avgSim * 100).toFixed(1)}%`,
  );
  console.log(
    `📊 Model's predicted score: ${(targetSignal.relevanceScore * 100).toFixed(1)}%`,
  );

  console.log();
}

testSignal()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
