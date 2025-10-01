import { sql } from "drizzle-orm";
import { db } from "../src/server/db";

async function main() {
  const userId = "J2tMunffPYoZWSzGXbjwihHDoU6Ol5Gc";

  // Check if the doctor episode has chunks and embeddings
  const episodeCheck = await db.execute(sql`
    SELECT 
      e.id,
      e.title,
      e.status,
      COUNT(tc.id) as chunk_count,
      COUNT(CASE WHEN tc.embedding IS NOT NULL THEN 1 END) as embedding_count
    FROM episode e
    LEFT JOIN transcript_chunk tc ON tc.episode_id = e.id
    WHERE e.title ILIKE '%pradip%jamnadas%'
       OR e.title ILIKE '%insulin%heart%doctor%'
    GROUP BY e.id, e.title, e.status
  `);

  if (episodeCheck.rows.length === 0) {
    console.log("\n❌ Episode not found\n");
    return;
  }

  const ep = episodeCheck.rows[0] as any;
  console.log("\n📺 Episode Status:\n");
  console.log(`   Title: ${ep.title}`);
  console.log(`   Status: ${ep.status}`);
  console.log(`   Chunks: ${ep.chunk_count}`);
  console.log(`   With embeddings: ${ep.embedding_count}\n`);

  if (ep.chunk_count === "0") {
    console.log("⚠️  No chunks created yet - episode needs to be processed\n");
    return;
  }

  if (ep.embedding_count === "0") {
    console.log(
      "⚠️  Chunks exist but no embeddings - waiting for embedding generation\n",
    );
    return;
  }

  // Check if signals were generated for this user
  const signalsCheck = await db.execute(sql`
    SELECT COUNT(*) as signal_count
    FROM daily_signal ds
    JOIN transcript_chunk tc ON ds.chunk_id = tc.id
    JOIN episode e ON tc.episode_id = e.id
    WHERE e.title ILIKE '%pradip%jamnadas%'
      AND ds.user_id = ${userId}
  `);

  const signalCount = (signalsCheck.rows[0] as any)?.signal_count || "0";

  console.log(`📊 Signals generated: ${signalCount}\n`);

  if (signalCount === "0") {
    console.log("⚠️  Episode processed but no signals generated yet\n");
    console.log(`💡 Run: pnpm tsx scripts/regenerate-signals.ts ${userId}\n`);
  } else {
    console.log("✅ Signals exist! Check /signals page in UI\n");
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
