import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { dailySignal } from "../src/server/db/schema";

async function main() {
  const userId = "J2tMunffPYoZWSzGXbjwihHDoU6Ol5Gc";

  // Get all signals
  const allSignals = await db
    .select({
      score: dailySignal.relevanceScore,
      userAction: dailySignal.userAction,
    })
    .from(dailySignal)
    .where(eq(dailySignal.userId, userId));

  const buckets = {
    "0-30%": 0,
    "30-40%": 0,
    "40-50%": 0,
    "50-60%": 0,
    "60-70%": 0,
    "70-80%": 0,
    "80-100%": 0,
  };

  const pendingBuckets = { ...buckets };

  for (const signal of allSignals) {
    if (signal.score === null) continue;

    let bucket: keyof typeof buckets;
    if (signal.score < 0.3) bucket = "0-30%";
    else if (signal.score < 0.4) bucket = "30-40%";
    else if (signal.score < 0.5) bucket = "40-50%";
    else if (signal.score < 0.6) bucket = "50-60%";
    else if (signal.score < 0.7) bucket = "60-70%";
    else if (signal.score < 0.8) bucket = "70-80%";
    else bucket = "80-100%";

    buckets[bucket]++;
    if (signal.userAction === null) {
      pendingBuckets[bucket]++;
    }
  }

  const total = allSignals.filter((s) => s.score !== null).length;
  const pendingTotal = allSignals.filter(
    (s) => s.score !== null && s.userAction === null,
  ).length;

  console.log("\n📊 FULL Distribution (All signals ever generated):\n");
  for (const [range, count] of Object.entries(buckets)) {
    const bar = "█".repeat(Math.floor((count / total) * 50));
    console.log(`   ${range}: ${count.toString().padStart(3)} ${bar}`);
  }

  console.log(`\n   Total: ${total}\n`);

  console.log("\n📊 PENDING Only (signals shown in UI):\n");
  for (const [range, count] of Object.entries(pendingBuckets)) {
    const bar = "█".repeat(Math.floor((count / pendingTotal) * 50));
    console.log(`   ${range}: ${count.toString().padStart(3)} ${bar}`);
  }

  console.log(`\n   Total: ${pendingTotal}\n`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
