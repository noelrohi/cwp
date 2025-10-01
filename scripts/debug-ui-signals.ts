#!/usr/bin/env tsx

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { dailySignal } from "@/server/db/schema/podcast";

const userId = process.argv[2] || "2MqiqQFvAsQ0NtQjzLEudErvtCbqrp48";

async function debugUISignals() {
  console.log(`\n📊 Debugging signals for user: ${userId}\n`);

  // Query EXACTLY as the tRPC router does
  const signals = await db.query.dailySignal.findMany({
    where: and(eq(dailySignal.userId, userId), isNull(dailySignal.userAction)),
    orderBy: [desc(dailySignal.signalDate), desc(dailySignal.relevanceScore)],
    limit: 100,
    with: {
      chunk: {
        columns: {
          id: true,
          content: true,
        },
        with: {
          episode: {
            columns: {
              title: true,
              publishedAt: true,
            },
          },
        },
      },
    },
  });

  console.log(
    `✅ Found ${signals.length} pending signals (same query as UI)\n`,
  );

  // Group by signal date
  const byDate = new Map<string, typeof signals>();
  for (const s of signals) {
    const date = s.signalDate.toISOString().split("T")[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)?.push(s);
  }

  console.log("📅 Signals grouped by signalDate (DESC):");
  for (const [date, sigs] of [...byDate.entries()].sort().reverse()) {
    console.log(`\n  ${date} (${sigs.length} signals):`);
    const sorted = sigs.sort(
      (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0),
    );
    for (const s of sorted.slice(0, 8)) {
      const score = ((s.relevanceScore || 0) * 100).toFixed(1);
      const content = s.chunk.content.substring(0, 70).replace(/\n/g, " ");
      const episodeTitle =
        s.chunk.episode?.title?.substring(0, 50) || "Unknown";
      console.log(
        `    ${score.padStart(5)}% | ${episodeTitle} | ${content}...`,
      );
    }
    if (sigs.length > 8) console.log(`    ... and ${sigs.length - 8} more`);
  }

  console.log(`\n🎯 Score Distribution (all ${signals.length} signals):`);
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const s of signals) {
    const bucket = Math.floor((s.relevanceScore || 0) * 10);
    buckets[Math.min(bucket, 9)]++;
  }
  buckets.forEach((count, i) => {
    const bar = "█".repeat(Math.ceil(count / 2));
    console.log(
      `  ${i * 10}-${(i + 1) * 10}%: ${count.toString().padStart(2)} ${bar}`,
    );
  });

  // Check episode distribution
  const byEpisode = new Map<string, number>();
  for (const s of signals) {
    const title = s.chunk.episode?.title || "Unknown";
    byEpisode.set(title, (byEpisode.get(title) || 0) + 1);
  }

  console.log(`\n📺 Signals by Episode:`);
  for (const [title, count] of [...byEpisode.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(2)} signals - ${title}`);
  }

  console.log();
}

debugUISignals()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
