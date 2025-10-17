import "dotenv/config";
import { judgeHybrid } from "@/server/lib/hybrid-judge";

const signal = `Yeah. Well one of those is technology and the AI race. By the way, we like to refer to AI not as artificial intelligence but as augmented intelligence. I think if more people started talking about as augmented intelligence it would take a lot of the fear and the trepidation and the mystery out of what's being done out there. The reason I say augmented it's really helping our people to do a better job serving our customers. Whether that's figuring out, you know, the turbulence in the sky and using technologies to better map and plot a route destination, having more signals available, whether it's Delta Concierge, which is our latest that we're rolling out in terms of our app, where we have, essentially an agentic framework where you're getting the more you feed into your own personal app and experience, the more that's going to come to you in terms of opportunities or what you want to experience when you're on the ground or what we can do to help you. Not necessarily what we're there to sell you, which is I think that's one of the dangers of this. We're there to help you. We got caught in a little with thinking about some storms, recent storm AI pricing.`;

async function test() {
  console.log("Testing signal that supposedly scored 0%...\n");

  const result = await judgeHybrid(signal);

  console.log(`Score: ${result.score}%`);
  console.log("\nBuckets:");
  console.log(`  Framework Clarity: ${result.buckets.frameworkClarity}`);
  console.log(`  Insight Novelty: ${result.buckets.insightNovelty}`);
  console.log(`  Tactical Specificity: ${result.buckets.tacticalSpecificity}`);
  console.log(`  Reasoning Depth: ${result.buckets.reasoningDepth}`);
  console.log("\nReasoning:");
  console.log(result.reasoning);

  console.log("\n" + "=".repeat(80));
  console.log("ANALYSIS");
  console.log("=".repeat(80));
  console.log("Word count:", signal.split(/\s+/).length);
  console.log("\nWhat it HAS:");
  console.log("  ✓ Named concept: 'augmented intelligence' (rebranding AI)");
  console.log("  ✓ Specific product: 'Delta Concierge' with agentic framework");
  console.log("  ✓ Philosophy: 'help not sell' principle");
  console.log("\nWhat it LACKS:");
  console.log("  ✗ No quantified outcomes (no metrics, no numbers)");
  console.log(
    "  ✗ No counter-intuitive insight (help > sell is common wisdom)",
  );
  console.log("  ✗ Mostly product marketing/description");
  console.log(
    "  ✗ Incomplete (cuts off mid-sentence: 'recent storm AI pricing')",
  );
  console.log(
    "\nExpected score: 30-45% (topically relevant but mostly marketing)",
  );
  console.log("Actual score from user's screenshot: 0%");
  console.log("\nLikely explanation:");
  console.log(
    "  - Old system (Kimi-k2 with high variance) might have scored this 0%",
  );
  console.log("  - Or heuristic filter caught it as marketing/product pitch");
  console.log(
    "  - Grok-4-fast should score this 30-45% (generic but relevant)",
  );
}

test().catch(console.error);
