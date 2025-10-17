import "dotenv/config";
import { generateEmbedding } from "@/lib/embedding";
import { hybridScoreBatchWithNovelty } from "@/server/lib/hybrid-scoring";
import { scoreWithHeuristics } from "@/server/lib/hybrid-heuristics";

const signal = `Yeah. Well one of those is technology and the AI race. By the way, we like to refer to AI not as artificial intelligence but as augmented intelligence. I think if more people started talking about as augmented intelligence it would take a lot of the fear and the trepidation and the mystery out of what's being done out there. The reason I say augmented it's really helping our people to do a better job serving our customers. Whether that's figuring out, you know, the turbulence in the sky and using technologies to better map and plot a route destination, having more signals available, whether it's Delta Concierge, which is our latest that we're rolling out in terms of our app, where we have, essentially an agentic framework where you're getting the more you feed into your own personal app and experience, the more that's going to come to you in terms of opportunities or what you want to experience when you're on the ground or what we can do to help you. Not necessarily what we're there to sell you, which is I think that's one of the dangers of this. We're there to help you. We got caught in a little with thinking about some storms, recent storm AI pricing.`;

async function test() {
  console.log("=".repeat(80));
  console.log("STAGE 1: LENGTH CHECK");
  console.log("=".repeat(80));
  const wordCount = signal.trim().split(/\s+/).length;
  console.log(`Word count: ${wordCount}`);
  console.log(`Threshold: 80 words`);
  console.log(`Result: ${wordCount >= 80 ? "✅ PASS" : "❌ FAIL (score: 15)"}`);

  console.log("\n" + "=".repeat(80));
  console.log("STAGE 2: HEURISTIC FILTER");
  console.log("=".repeat(80));
  const heuristic = scoreWithHeuristics(signal);
  console.log(`Score: ${heuristic.score}`);
  console.log(`Pass: ${heuristic.pass}`);
  console.log(`Fail: ${heuristic.fail}`);
  console.log(`Method: ${heuristic.method}`);
  console.log("\nBuckets:");
  console.log(`  Framework: ${heuristic.buckets.frameworkScore}`);
  console.log(`  Insight: ${heuristic.buckets.insightScore}`);
  console.log(`  Specificity: ${heuristic.buckets.specificityScore}`);
  console.log(`  Quality: ${heuristic.buckets.qualityScore}`);
  console.log(`  Overall: ${heuristic.buckets.overallScore}`);
  console.log("\nReasons:");
  heuristic.buckets.reasons.forEach((r) => console.log(`  - ${r}`));

  if (heuristic.fail) {
    console.log("\n❌ STOPPED: Heuristic filter marked as FAIL (score: 0)");
    console.log("This signal would get score 0 and never reach the LLM!");
    console.log("\nThis is likely why the user saw 0%!");
    return;
  }

  if (heuristic.pass) {
    console.log("\n✅ STOPPED: Heuristic filter marked as PASS");
    console.log(
      `Signal would get score ${heuristic.score} without LLM scoring`,
    );
    return;
  }

  console.log("\n✅ Passed heuristics, continuing to LLM...");

  console.log("\n" + "=".repeat(80));
  console.log("STAGE 3: LLM SCORING");
  console.log("=".repeat(80));

  const embedding = await generateEmbedding(signal);
  const results = await hybridScoreBatchWithNovelty(
    [{ content: signal, embedding }],
    "test_user",
  );

  const result = results[0];
  console.log(`Final Score: ${result.rawScore}%`);
  console.log(`Method: ${result.method}`);
  console.log(`Pass (≥60): ${result.pass}`);

  if (result.diagnostics.llm) {
    console.log("\nLLM Reasoning:");
    console.log(result.diagnostics.llm.reasoning);
  }
}

test().catch(console.error);
