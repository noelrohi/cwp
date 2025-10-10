/**
 * Diagnose the centroid similarity issue
 * This will show WHY contrastive learning is failing
 */

import { cosineSimilarity } from "ai";
import { db } from "@/server/db";
import { dailySignal, transcriptChunk, savedChunk } from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";

const USMAN_USER_ID = "50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G";

function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error("Cannot calculate centroid of empty embedding set");
  }

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

async function main() {
  console.log("=".repeat(80));
  console.log("DIAGNOSING CENTROID SIMILARITY ISSUE");
  console.log("=".repeat(80));
  console.log();

  // Get embeddings of saved chunks
  const savedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
      content: transcriptChunk.content,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, USMAN_USER_ID),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    )
    .limit(100);

  // Get embeddings of skipped chunks
  const skippedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
      content: transcriptChunk.content,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, USMAN_USER_ID),
        eq(dailySignal.userAction, "skipped"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    )
    .limit(100);

  console.log(`Found ${savedChunks.length} saved chunks with embeddings`);
  console.log(`Found ${skippedChunks.length} skipped chunks with embeddings`);
  console.log();

  if (savedChunks.length === 0 || skippedChunks.length === 0) {
    console.log("❌ Not enough data to calculate centroids");
    return;
  }

  // Calculate centroids
  const savedEmbeddings = savedChunks.map((c) => c.embedding as number[]);
  const skippedEmbeddings = skippedChunks.map((c) => c.embedding as number[]);

  const savedCentroid = calculateCentroid(savedEmbeddings);
  const skippedCentroid = calculateCentroid(skippedEmbeddings);

  // Calculate similarity between centroids
  const centroidSimilarity = cosineSimilarity(savedCentroid, skippedCentroid);

  console.log("=".repeat(80));
  console.log("🎯 CENTROID SIMILARITY ANALYSIS");
  console.log("=".repeat(80));
  console.log();
  console.log(
    `Saved centroid vs Skipped centroid similarity: ${centroidSimilarity.toFixed(4)}`,
  );
  console.log();

  if (centroidSimilarity > 0.85) {
    console.log("⚠️  CRITICAL ISSUE: Centroids are TOO SIMILAR (>0.85)");
    console.log();
    console.log("This means:");
    console.log(
      "  • Saved and skipped content occupy the SAME region in embedding space",
    );
    console.log(
      "  • Contrastive learning (saved - skipped) will produce near-zero signal",
    );
    console.log("  • All scores will cluster around 0.5 (50%)");
    console.log(
      "  • System cannot distinguish what Usman likes from what he dislikes",
    );
    console.log();
    console.log("WHY this happens:");
    console.log("  • Embeddings encode TOPIC (startups, investing, building)");
    console.log("  • Usman saves DEEP analysis on these topics");
    console.log("  • Usman skips SHALLOW analysis on SAME topics");
    console.log(
      "  • Embeddings can't tell deep from shallow - they just see 'same topic'",
    );
    console.log();
    console.log("SOLUTION:");
    console.log("  • Stop using contrastive learning with embeddings");
    console.log("  • Extract features that measure REASONING DEPTH, not topic");
    console.log("  • Use LLM-as-judge or better heuristics");
  } else if (centroidSimilarity > 0.7) {
    console.log("⚠️  WARNING: Centroids are somewhat similar (0.7-0.85)");
    console.log();
    console.log("Contrastive learning will have LIMITED discrimination power.");
    console.log("You might get some signal, but it's weak.");
  } else {
    console.log("✅ GOOD: Centroids are well-separated (<0.7)");
    console.log();
    console.log("Contrastive learning should work reasonably well.");
    console.log(
      "The problem is likely elsewhere (quality features, threshold, etc.)",
    );
  }

  console.log();
  console.log("=".repeat(80));
  console.log("📊 INDIVIDUAL SIMILARITY DISTRIBUTION");
  console.log("=".repeat(80));
  console.log();

  // Calculate how similar each saved chunk is to both centroids
  console.log("SAVED CHUNKS similarity to centroids:");
  const savedToSavedSims: number[] = [];
  const savedToSkippedSims: number[] = [];

  for (const chunk of savedChunks.slice(0, 20)) {
    const simToSaved = cosineSimilarity(
      chunk.embedding as number[],
      savedCentroid,
    );
    const simToSkipped = cosineSimilarity(
      chunk.embedding as number[],
      skippedCentroid,
    );
    savedToSavedSims.push(simToSaved);
    savedToSkippedSims.push(simToSkipped);
  }

  const avgSavedToSaved =
    savedToSavedSims.reduce((a, b) => a + b, 0) / savedToSavedSims.length;
  const avgSavedToSkipped =
    savedToSkippedSims.reduce((a, b) => a + b, 0) / savedToSkippedSims.length;

  console.log(
    `  Average similarity to SAVED centroid: ${avgSavedToSaved.toFixed(4)}`,
  );
  console.log(
    `  Average similarity to SKIPPED centroid: ${avgSavedToSkipped.toFixed(4)}`,
  );
  console.log(
    `  Difference: ${(avgSavedToSaved - avgSavedToSkipped).toFixed(4)}`,
  );
  console.log();

  console.log("SKIPPED CHUNKS similarity to centroids:");
  const skippedToSavedSims: number[] = [];
  const skippedToSkippedSims: number[] = [];

  for (const chunk of skippedChunks.slice(0, 20)) {
    const simToSaved = cosineSimilarity(
      chunk.embedding as number[],
      savedCentroid,
    );
    const simToSkipped = cosineSimilarity(
      chunk.embedding as number[],
      skippedCentroid,
    );
    skippedToSavedSims.push(simToSaved);
    skippedToSkippedSims.push(simToSkipped);
  }

  const avgSkippedToSaved =
    skippedToSavedSims.reduce((a, b) => a + b, 0) / skippedToSavedSims.length;
  const avgSkippedToSkipped =
    skippedToSkippedSims.reduce((a, b) => a + b, 0) /
    skippedToSkippedSims.length;

  console.log(
    `  Average similarity to SAVED centroid: ${avgSkippedToSaved.toFixed(4)}`,
  );
  console.log(
    `  Average similarity to SKIPPED centroid: ${avgSkippedToSkipped.toFixed(4)}`,
  );
  console.log(
    `  Difference: ${(avgSkippedToSkipped - avgSkippedToSaved).toFixed(4)}`,
  );
  console.log();

  // Calculate contrastive scores
  console.log("=".repeat(80));
  console.log("📈 CONTRASTIVE SCORE DISTRIBUTION");
  console.log("=".repeat(80));
  console.log();

  console.log("If contrastive learning worked, we'd see:");
  console.log(
    "  • Saved chunks: high contrastive score (closer to saved, far from skipped)",
  );
  console.log(
    "  • Skipped chunks: low contrastive score (closer to skipped, far from saved)",
  );
  console.log();

  const savedContrastiveScores = savedChunks.slice(0, 20).map((chunk, i) => {
    const score = savedToSavedSims[i] - savedToSkippedSims[i];
    return score;
  });

  const skippedContrastiveScores = skippedChunks
    .slice(0, 20)
    .map((chunk, i) => {
      const score = skippedToSavedSims[i] - skippedToSkippedSims[i];
      return score;
    });

  const avgSavedContrastive =
    savedContrastiveScores.reduce((a, b) => a + b, 0) /
    savedContrastiveScores.length;
  const avgSkippedContrastive =
    skippedContrastiveScores.reduce((a, b) => a + b, 0) /
    skippedContrastiveScores.length;

  console.log(
    `SAVED chunks contrastive score: ${avgSavedContrastive.toFixed(4)}`,
  );
  console.log(
    `SKIPPED chunks contrastive score: ${avgSkippedContrastive.toFixed(4)}`,
  );
  console.log(
    `Separation: ${(avgSavedContrastive - avgSkippedContrastive).toFixed(4)}`,
  );
  console.log();

  if (Math.abs(avgSavedContrastive - avgSkippedContrastive) < 0.05) {
    console.log("❌ TERRIBLE SEPARATION (<0.05)");
    console.log(
      "   Contrastive scores of saved vs skipped are nearly identical!",
    );
    console.log("   System cannot learn which content is good vs bad.");
  } else if (Math.abs(avgSavedContrastive - avgSkippedContrastive) < 0.1) {
    console.log("⚠️  WEAK SEPARATION (0.05-0.1)");
    console.log("   Some signal exists but it's very noisy.");
  } else {
    console.log("✅ GOOD SEPARATION (>0.1)");
    console.log("   Contrastive learning has some discriminative power.");
  }

  console.log();
  console.log("=".repeat(80));
  console.log("💡 RECOMMENDATIONS");
  console.log("=".repeat(80));
  console.log();

  if (centroidSimilarity > 0.85) {
    console.log(
      "Your embeddings cannot distinguish saved from skipped content.",
    );
    console.log();
    console.log("STOP using contrastive learning. Instead:");
    console.log();
    console.log("1. Extract better features:");
    console.log("   - Content length (saved is 67% longer)");
    console.log("   - Framework detection (named concepts, 'X vs Y' patterns)");
    console.log("   - Specificity (concrete examples vs abstract claims)");
    console.log("   - Causal claims ('X causes Y', 'if X then Y')");
    console.log();
    console.log("2. Use LLM-as-judge:");
    console.log(
      "   - Score each chunk on: framework clarity, insight novelty,",
    );
    console.log("     tactical specificity, reasoning depth");
    console.log("   - Cost: ~$0.001 per chunk");
    console.log();
    console.log("3. Hybrid approach:");
    console.log("   - Pre-filter by length (>200 words)");
    console.log("   - Use simple heuristics for obvious cases");
    console.log("   - Use LLM only for borderline (50-70% range)");
  } else {
    console.log("Your centroids are reasonably separated.");
    console.log("The problem might be:");
    console.log("  • Quality features too weak");
    console.log("  • Threshold too low/high");
    console.log("  • Need more training data");
    console.log();
    console.log("Try:");
    console.log("  • Adding length as a strong signal");
    console.log("  • Better quality features (framework detection)");
    console.log("  • Collecting explicit feedback on why saved/skipped");
  }

  console.log();
  console.log("=".repeat(80));
}

main()
  .then(() => {
    console.log("\n✅ Diagnosis complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
