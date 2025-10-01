import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { savedChunk, transcriptChunk } from "../src/server/db/schema";

async function main() {
  const userId = "J2tMunffPYoZWSzGXbjwihHDoU6Ol5Gc";

  const saved = await db
    .select({
      content: transcriptChunk.content,
      createdAt: savedChunk.savedAt,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(eq(savedChunk.userId, userId))
    .orderBy(savedChunk.savedAt)
    .limit(20);

  console.log(`\n📚 ${saved.length} saved chunks for analysis:\n`);

  for (const chunk of saved) {
    const preview = `${chunk.content.substring(0, 70)}...`;
    console.log(`${preview}`);
  }

  console.log("\n💡 Based on these saves, high scores (70%+) should be about:");
  console.log("   - Cursor, Claude, AI coding tools");
  console.log("   - Automation, workflows");
  console.log("   - Building products/SaaS\n");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
