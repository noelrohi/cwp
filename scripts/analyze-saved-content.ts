#!/usr/bin/env tsx

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";

const userId = process.argv[2];

if (!userId) {
  console.error("Usage: tsx scripts/analyze-saved-content.ts <userId>");
  process.exit(1);
}

async function analyzeSavedContent() {
  console.log(`\n📚 Analyzing saved content for user: ${userId}\n`);

  // Get saved chunks
  const savedChunks = await db
    .select({
      content: transcriptChunk.content,
      relevanceScore: dailySignal.relevanceScore,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .leftJoin(dailySignal, eq(transcriptChunk.id, dailySignal.chunkId))
    .where(eq(savedChunk.userId, userId));

  console.log(`✓ Found ${savedChunks.length} saved chunks\n`);

  console.log("📝 Your Saved Content (what trained the model):\n");
  console.log("=".repeat(80));
  for (let i = 0; i < savedChunks.length; i++) {
    const chunk = savedChunks[i];
    const score = chunk.relevanceScore
      ? `${(chunk.relevanceScore * 100).toFixed(1)}%`
      : "N/A";
    console.log(`\n${i + 1}. Score when saved: ${score}`);
    console.log(`   ${chunk.content.substring(0, 200).replace(/\n/g, " ")}...`);
  }
  console.log("\n" + "=".repeat(80));

  // Extract keywords
  const allText = savedChunks.map((c) => c.content).join(" ");
  const keywords = [
    "cursor",
    "claude",
    "ai tool",
    "coding",
    "editor",
    "transcript",
    "prompt",
    "building",
    "product",
    "startup",
    "marketing",
    "bubble",
    "hype",
    "consumer",
    "mobile app",
  ];

  console.log("\n🔑 Keyword Analysis in Your Saved Content:\n");
  for (const keyword of keywords) {
    const regex = new RegExp(keyword, "gi");
    const matches = allText.match(regex);
    const count = matches ? matches.length : 0;
    if (count > 0) {
      console.log(`   ${keyword.padEnd(15)}: ${count} mentions`);
    }
  }

  console.log();
}

analyzeSavedContent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });