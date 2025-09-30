#!/usr/bin/env tsx

import { and, count, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dailySignal } from "@/server/db/schema/podcast";

const userId = process.argv[2];

if (!userId) {
  console.error("Usage: tsx scripts/check-user-stats.ts <userId>");
  process.exit(1);
}

async function checkUserStats() {
  console.log(`\n📊 User Statistics for: ${userId}\n`);

  const totalSignals = await db
    .select({ count: count() })
    .from(dailySignal)
    .where(eq(dailySignal.userId, userId));

  const saved = await db
    .select({ count: count() })
    .from(dailySignal)
    .where(
      and(eq(dailySignal.userId, userId), eq(dailySignal.userAction, "saved")),
    );

  const skipped = await db
    .select({ count: count() })
    .from(dailySignal)
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "skipped"),
      ),
    );

  const pending = await db
    .select({ count: count() })
    .from(dailySignal)
    .where(
      and(eq(dailySignal.userId, userId), eq(dailySignal.userAction, null)),
    );

  const totalCount = totalSignals[0]?.count || 0;
  const savedCount = saved[0]?.count || 0;
  const skippedCount = skipped[0]?.count || 0;
  const pendingCount = pending[0]?.count || 0;

  console.log(`Total Signals:   ${totalCount}`);
  console.log(`Saved:           ${savedCount} (${((savedCount / totalCount) * 100).toFixed(1)}%)`);
  console.log(`Skipped:         ${skippedCount} (${((skippedCount / totalCount) * 100).toFixed(1)}%)`);
  console.log(`Pending:         ${pendingCount} (${((pendingCount / totalCount) * 100).toFixed(1)}%)`);

  const saveRate = totalCount > 0 ? (savedCount / (savedCount + skippedCount)) * 100 : 0;
  console.log(`\nSave Rate:       ${saveRate.toFixed(1)}% (saved / actioned)`);

  console.log();
}

checkUserStats()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });