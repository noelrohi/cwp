#!/usr/bin/env tsx

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { dailySignal, transcriptChunk } from "@/server/db/schema/podcast";

const userId = process.argv[2];

if (!userId) {
  console.error("Usage: tsx scripts/check-pending-signals.ts <userId>");
  process.exit(1);
}

async function checkPendingSignals() {
  console.log(`\n📊 Checking pending signals for user: ${userId}\n`);

  const pendingSignals = await db
    .select({
      id: dailySignal.id,
      relevanceScore: dailySignal.relevanceScore,
      content: transcriptChunk.content,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(and(eq(dailySignal.userId, userId), isNull(dailySignal.userAction)))
    .orderBy(dailySignal.relevanceScore)
    .limit(50);

  console.log(`Found ${pendingSignals.length} pending signals\n`);

  if (pendingSignals.length === 0) {
    console.log("❌ No pending signals found.");
    console.log("   Run the daily pipeline or add new podcast episodes\n");
    return;
  }

  // Distribution
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const signal of pendingSignals) {
    const score = signal.relevanceScore || 0;
    const bucketIndex = Math.min(9, Math.floor(score * 10));
    buckets[bucketIndex]++;
  }

  console.log("📊 Score Distribution:");
  const labels = [
    "0-10%",
    "10-20%",
    "20-30%",
    "30-40%",
    "40-50%",
    "50-60%",
    "60-70%",
    "70-80%",
    "80-90%",
    "90-100%",
  ];
  for (let i = 0; i < 10; i++) {
    const pct = ((buckets[i] / pendingSignals.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.floor(buckets[i] / 2));
    console.log(
      `   ${labels[i]}: ${buckets[i].toString().padStart(3)} (${pct.padStart(5)}%) ${bar}`,
    );
  }

  console.log(`\n🎯 Top 5 Highest Scoring Signals:\n`);
  const top5 = [...pendingSignals].reverse().slice(0, 5);
  for (const signal of top5) {
    const score = ((signal.relevanceScore || 0) * 100).toFixed(1);
    const preview = signal.content.substring(0, 80).replace(/\n/g, " ");
    console.log(`   ${score}% - ${preview}...`);
  }

  console.log(`\n🎯 Bottom 5 Lowest Scoring Signals:\n`);
  const bottom5 = pendingSignals.slice(0, 5);
  for (const signal of bottom5) {
    const score = ((signal.relevanceScore || 0) * 100).toFixed(1);
    const preview = signal.content.substring(0, 80).replace(/\n/g, " ");
    console.log(`   ${score}% - ${preview}...`);
  }

  console.log();
}

checkPendingSignals()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
