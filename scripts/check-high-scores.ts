import { sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { dailySignal } from "../src/server/db/schema";

async function main() {
  const userId = "J2tMunffPYoZWSzGXbjwihHDoU6Ol5Gc";

  // Find all 70%+ signals
  const highScoring = await db
    .select({
      score: dailySignal.relevanceScore,
      userAction: dailySignal.userAction,
      excerpt: dailySignal.excerpt,
    })
    .from(dailySignal)
    .where(
      sql`${dailySignal.userId} = ${userId} AND ${dailySignal.relevanceScore} >= 0.7`,
    );

  console.log(`\n📊 All signals scoring ≥70%: ${highScoring.length} total\n`);

  const saved = highScoring.filter((s) => s.userAction === "saved").length;
  const skipped = highScoring.filter((s) => s.userAction === "skipped").length;
  const pending = highScoring.filter((s) => s.userAction === null).length;

  console.log(`   Saved:   ${saved}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Pending: ${pending}\n`);

  if (pending > 0) {
    console.log("Pending high-scoring signals:");
    for (const signal of highScoring
      .filter((s) => s.userAction === null)
      .slice(0, 5)) {
      const preview = `${(signal.excerpt ?? "").substring(0, 60)}...`;
      console.log(`   ${((signal.score ?? 0) * 100).toFixed(1)}% - ${preview}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
