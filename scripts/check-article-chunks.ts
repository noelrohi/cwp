import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/server/db";
import { article, transcriptChunk } from "../src/server/db/schema";

async function main() {
  console.log("\n=== ARTICLE CHUNK ANALYSIS ===\n");

  // Get sample article chunks with embeddings
  const chunks = await db
    .select({
      content: transcriptChunk.content,
      wordCount: transcriptChunk.wordCount,
      articleTitle: article.title,
    })
    .from(transcriptChunk)
    .innerJoin(article, eq(transcriptChunk.articleId, article.id))
    .where(
      and(
        isNotNull(transcriptChunk.articleId),
        isNotNull(transcriptChunk.embedding),
      ),
    )
    .orderBy(desc(transcriptChunk.createdAt))
    .limit(5);

  if (chunks.length === 0) {
    console.log("No article chunks found with embeddings.\n");
    return;
  }

  console.log(`Found ${chunks.length} article chunks. Analyzing...\n`);

  for (const [i, chunk] of chunks.entries()) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`CHUNK ${i + 1} - ${chunk.wordCount} words`);
    console.log(`Article: ${chunk.articleTitle}`);
    console.log(`${"=".repeat(70)}\n`);

    // Show first 600 chars to see markdown
    const preview = chunk.content.slice(0, 600);
    console.log(preview);
    if (chunk.content.length > 600) {
      console.log("\n... (truncated)");
    }

    // Analyze markdown content
    const hasImages = /!\[[^\]]*\]\([^)]+\)/.test(chunk.content);
    const hasLinks = /\[([^\]]+)\]\([^)]+\)/.test(chunk.content);
    const hasBold = /\*\*[^*]+\*\*/.test(chunk.content);
    const hasItalic = /\*[^*]+\*/.test(chunk.content);
    const hasCodeBlock = /```/.test(chunk.content);
    const standaloneUrls = (chunk.content.match(/^https?:\/\/[^\s]+$/gm) || [])
      .length;

    console.log("\n📊 Markdown Analysis:");
    console.log(`   Images: ${hasImages ? "Yes ⚠️" : "No"}`);
    console.log(`   Links: ${hasLinks ? "Yes" : "No"}`);
    console.log(`   Bold: ${hasBold ? "Yes" : "No"}`);
    console.log(`   Italic: ${hasItalic ? "Yes" : "No"}`);
    console.log(`   Code blocks: ${hasCodeBlock ? "Yes" : "No"}`);
    console.log(`   Standalone URLs: ${standaloneUrls}`);
  }

  console.log("\n\n✅ Analysis complete.\n");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
