/**
 * Test script to validate novelty-aware scoring is working
 *
 * This script:
 * 1. Tests the Delta Airlines signal with both old and new scoring
 * 2. Shows the difference novelty detection makes
 * 3. Validates that novelty diagnostics are present
 */

import { generateEmbedding } from "@/lib/embedding";
import {
  hybridScoreBatch,
  hybridScoreBatchWithNovelty,
} from "@/server/lib/hybrid-scoring";

const DELTA_SIGNAL_1 = `Schedule, utility was kind of a distant second. And third was loyalty, whatever that meant, but price was the dominant driver. I'm proud to say almost thirty years later, there's no question Delta, the number one driver of why people buy Delta is because it's Delta and people want service and the reliability, you know the service that our great people provide and they're willing to pay a premium. On average people pay a 20% premium to be on Delta versus the industry at large. Not every flight, not every day, that's an average by the way, every flight every day, but there's some differences in there based on who we're competing with and the priorities those customers have.`;

const DELTA_SIGNAL_3 = `They have questions, you have answers, and if you say I don't know that doesn't necessarily inspire confidence and help you in terms of the success. But it's important when you are honest though, and you have that willingness to be vulnerable, and you have a willingness not to say I don't know, but have confidence in saying but we're going to figure it out and I'm going to figure it out. And it's really hard. I think it's one of the hardest things as a new leader is to say I don't know. And whether it's with your board, because your board and there's very few people, I'm sure in their first few board meetings, they'll get questions and the sales, I don't know. They're going to come up with stuff. They'll talk around it and they'll try to hope somebody changes the topic or your own employees. Then that vulnerability builds trust. It builds, you know, courage because that's what people want to say and authenticity and humility. You know, no one wants to follow someone that has all the answers. They to follow someone that they feel they're going`;

async function main() {
  console.log("🧪 Testing Novelty-Aware Scoring\n");

  // Test Signal 1: Quantified business insight
  console.log("=".repeat(80));
  console.log("📊 Signal 1: Delta's 20% premium story");
  console.log("=".repeat(80));

  console.log("\n🔍 OLD SCORING (no novelty detection):");
  const oldResults1 = await hybridScoreBatch([DELTA_SIGNAL_1]);
  const oldScore1 = oldResults1[0];
  console.log(`Score: ${oldScore1.rawScore}%`);
  console.log(`Method: ${oldScore1.method}`);
  console.log(`Has novelty diagnostics: ${!!oldScore1.diagnostics.novelty}`);
  if (oldScore1.diagnostics.llm) {
    console.log("\nLLM Buckets:");
    console.log(
      `  Framework Clarity: ${oldScore1.diagnostics.llm.buckets.frameworkClarity}`,
    );
    console.log(
      `  Insight Novelty: ${oldScore1.diagnostics.llm.buckets.insightNovelty}`,
    );
    console.log(
      `  Tactical Specificity: ${oldScore1.diagnostics.llm.buckets.tacticalSpecificity}`,
    );
    console.log(
      `  Reasoning Depth: ${oldScore1.diagnostics.llm.buckets.reasoningDepth}`,
    );
  }

  console.log("\n🆕 NEW SCORING (with novelty detection):");
  const embedding1 = await generateEmbedding(DELTA_SIGNAL_1);

  // Use a test user ID - in production this would be the actual user
  const TEST_USER_ID = "test_user_novelty_demo";

  const newResults1 = await hybridScoreBatchWithNovelty(
    [{ content: DELTA_SIGNAL_1, embedding: embedding1 }],
    TEST_USER_ID,
  );
  const newScore1 = newResults1[0];
  console.log(`Score: ${newScore1.rawScore}%`);
  console.log(`Method: ${newScore1.method}`);
  console.log(`Has novelty diagnostics: ${!!newScore1.diagnostics.novelty}`);

  if (newScore1.diagnostics.novelty) {
    console.log("\nNovelty Diagnostics:");
    console.log(
      `  Novelty Score: ${newScore1.diagnostics.novelty.noveltyScore.toFixed(3)} (1.0 = novel, 0.0 = redundant)`,
    );
    console.log(
      `  Avg Similarity: ${newScore1.diagnostics.novelty.avgSimilarity.toFixed(3)}`,
    );
    console.log(
      `  Max Similarity: ${newScore1.diagnostics.novelty.maxSimilarity.toFixed(3)}`,
    );
    console.log(
      `  Cluster Size: ${newScore1.diagnostics.novelty.clusterSize} past saves`,
    );
    console.log(
      `  Adjustment: ${newScore1.diagnostics.novelty.adjustment} points`,
    );
  }

  if (newScore1.diagnostics.llm) {
    console.log("\nLLM Buckets:");
    console.log(
      `  Framework Clarity: ${newScore1.diagnostics.llm.buckets.frameworkClarity}`,
    );
    console.log(
      `  Insight Novelty: ${newScore1.diagnostics.llm.buckets.insightNovelty}`,
    );
    console.log(
      `  Tactical Specificity: ${newScore1.diagnostics.llm.buckets.tacticalSpecificity}`,
    );
    console.log(
      `  Reasoning Depth: ${newScore1.diagnostics.llm.buckets.reasoningDepth}`,
    );

    console.log("\nLLM Reasoning:");
    console.log(newScore1.diagnostics.llm.reasoning);
  }

  // Test Signal 3: Leadership canon (should get penalized if user has similar saves)
  console.log("\n\n" + "=".repeat(80));
  console.log("📊 Signal 3: Vulnerability/leadership advice");
  console.log("=".repeat(80));

  console.log("\n🔍 OLD SCORING (no novelty detection):");
  const oldResults3 = await hybridScoreBatch([DELTA_SIGNAL_3]);
  const oldScore3 = oldResults3[0];
  console.log(`Score: ${oldScore3.rawScore}%`);
  console.log(`Method: ${oldScore3.method}`);

  console.log("\n🆕 NEW SCORING (with novelty detection):");
  const embedding3 = await generateEmbedding(DELTA_SIGNAL_3);
  const newResults3 = await hybridScoreBatchWithNovelty(
    [{ content: DELTA_SIGNAL_3, embedding: embedding3 }],
    TEST_USER_ID,
  );
  const newScore3 = newResults3[0];
  console.log(`Score: ${newScore3.rawScore}%`);
  console.log(`Method: ${newScore3.method}`);

  if (newScore3.diagnostics.novelty) {
    console.log("\nNovelty Diagnostics:");
    console.log(
      `  Novelty Score: ${newScore3.diagnostics.novelty.noveltyScore.toFixed(3)}`,
    );
    console.log(
      `  Avg Similarity: ${newScore3.diagnostics.novelty.avgSimilarity.toFixed(3)}`,
    );
    console.log(
      `  Adjustment: ${newScore3.diagnostics.novelty.adjustment} points`,
    );
  }

  // Summary
  console.log("\n\n" + "=".repeat(80));
  console.log("📈 SUMMARY");
  console.log("=".repeat(80));
  console.log("\nSignal 1 (Business insight):");
  console.log(
    `  Old: ${oldScore1.rawScore}% | New: ${newScore1.rawScore}% | Diff: ${newScore1.rawScore - oldScore1.rawScore > 0 ? "+" : ""}${newScore1.rawScore - oldScore1.rawScore}`,
  );

  console.log("\nSignal 3 (Leadership canon):");
  console.log(
    `  Old: ${oldScore3.rawScore}% | New: ${newScore3.rawScore}% | Diff: ${newScore3.rawScore - oldScore3.rawScore > 0 ? "+" : ""}${newScore3.rawScore - oldScore3.rawScore}`,
  );

  console.log(
    "\n✅ Novelty detection is " +
      (newScore1.diagnostics.novelty ? "ENABLED" : "DISABLED"),
  );

  if (!newScore1.diagnostics.novelty) {
    console.log(
      "\n⚠️  Warning: Novelty diagnostics not found. The new scoring may not be working correctly.",
    );
  } else {
    console.log(
      "\n💡 Note: With cold start (< 10 past saves), novelty adjustment is 0.",
    );
    console.log(
      "   After user has 10+ saves with embeddings, novelty penalties will apply.",
    );
  }
}

main().catch(console.error);
