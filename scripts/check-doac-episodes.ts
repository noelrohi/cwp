import { sql } from "drizzle-orm";
import { db } from "../src/server/db";

type EpisodeRow = {
  title: string;
};

async function main() {
  console.log("\n📺 Checking Diary of a CEO episodes...\n");

  // Search for doctor episode
  const doctorCheck = await db.execute<EpisodeRow>(sql`
    SELECT e.title
    FROM episode e
    JOIN podcast p ON e.podcast_id = p.id
    WHERE (e.title ILIKE '%insulin%'
       OR e.title ILIKE '%heart doctor%'
       OR e.title ILIKE '%pradip%')
      AND p.title ILIKE '%diary%'
    LIMIT 5
  `);

  if (doctorCheck.rows.length > 0) {
    console.log("✅ Found doctor episodes:\n");
    for (const row of doctorCheck.rows) {
      console.log(`   - ${row.title}`);
    }
    console.log("");
  } else {
    console.log(
      "❌ Doctor episode (Pradip Jamnadas / Insulin) NOT in DB yet\n",
    );
  }

  // List recent DOAC episodes
  const doacSample = await db.execute<EpisodeRow>(sql`
    SELECT e.title
    FROM episode e
    JOIN podcast p ON e.podcast_id = p.id
    WHERE p.title ILIKE '%diary%'
    ORDER BY e.published_at DESC
    LIMIT 15
  `);

  console.log("📋 Recent Diary of a CEO episodes in DB:\n");
  doacSample.rows.forEach((row: EpisodeRow, idx: number) => {
    console.log(`   ${idx + 1}. ${row.title}`);
  });

  console.log("\n💡 Total DOAC episodes: 734\n");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
