#!/usr/bin/env tsx
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { episode } from "@/server/db/schema/podcast";

async function main() {
  const TITLE_MATCH =
    "how to digest 36 weekly podcasts without spending 36 hours listening";

  const likeA = `%${TITLE_MATCH.toLowerCase()}%`;
  const likeB = `%${"tomasz tunguz"}%`;

  const rows = await db
    .select({
      id: episode.id,
      episodeId: episode.episodeId,
      title: episode.title,
      audioUrl: episode.audioUrl,
      publishedAt: episode.publishedAt,
    })
    .from(episode)
    .where(
      sql`lower(${episode.title}) like ${likeA} or lower(${episode.title}) like ${likeB}`,
    )
    .limit(10);

  if (rows.length === 0) {
    console.log("No matching episodes found.");
    process.exit(1);
  }

  console.log("Found episodes:\n");
  for (const r of rows) {
    console.log(
      `- title: ${r.title}\n  episode_id: ${r.episodeId}\n  id: ${r.id}\n  audio: ${r.audioUrl ?? ""}\n  publishedAt: ${r.publishedAt ?? ""}\n`,
    );
  }

  // Print the best guess (first row) plainly for scripting
  const best = rows[0];
  console.log("BEST_EPISODE_ID=", best.episodeId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
