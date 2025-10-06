/**
 * Direct test of RAG endpoint
 *
 * This bypasses the LLM and calls the tRPC RAG router directly
 * to debug if the issue is with the search or the tool integration
 */

import { db } from "@/server/db";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/init";

const userId = process.argv[2] || "50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G";
const query = process.argv[3] || "marketing";

async function testRAGDirect() {
  console.log("\n🔍 Direct RAG Test\n");
  console.log(`User ID: ${userId}`);
  console.log(`Query: "${query}"\n`);

  // Create tRPC caller with mock session
  const createCaller = createCallerFactory(appRouter);
  const trpc = createCaller({
    db,
    session: { id: "test-session" } as any,
    user: { id: userId, email: "test@test.com" } as any,
  });

  try {
    console.log("Testing searchSaved...\n");
    const startTime = Date.now();

    const results = await trpc.rag.searchSaved({
      query,
      limit: 5,
    });

    const duration = Date.now() - startTime;

    console.log(`✅ Found ${results.length} results in ${duration}ms\n`);

    if (results.length === 0) {
      console.log("⚠️  No results found. This could mean:");
      console.log("   1. User has no saved chunks with embeddings");
      console.log("   2. Query doesn't match saved content semantically");
      console.log("   3. Embedding generation or search is failing\n");
      return;
    }

    console.log("─".repeat(80));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(
        `\n[${i + 1}] Similarity: ${Number(r.similarity || 0).toFixed(3)}`,
      );
      console.log(`    Podcast: ${r.podcastTitle}`);
      console.log(`    Episode: ${r.episodeTitle}`);
      console.log(`    Speaker: ${r.speaker || "Unknown"}`);
      console.log(`    Timestamp: ${r.startTimeSec}s`);
      console.log(`    Relevance: ${r.relevanceScore}`);
      console.log(`    Content: ${r.content.slice(0, 200)}...`);
      console.log(`    Citation: ${r.citation}`);
    }
    console.log("\n" + "─".repeat(80));
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

testRAGDirect().then(() => {
  console.log("\n✅ Test completed\n");
  process.exit(0);
});
