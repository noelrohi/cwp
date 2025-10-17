/**
 * Test Grok-4-fast for scoring variance and quality
 */

import "dotenv/config";
import { generateObject } from "ai";
import { z } from "zod";
import { openrouter } from "@/ai/models";

const judgementSchema = z.object({
  frameworkClarity: z.number().min(0).max(100),
  insightNovelty: z.number().min(0).max(100),
  tacticalSpecificity: z.number().min(0).max(100),
  reasoningDepth: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

const DELTA_SIGNAL = `Schedule, utility was kind of a distant second. And third was loyalty, whatever that meant, but price was the dominant driver. I'm proud to say almost thirty years later, there's no question Delta, the number one driver of why people buy Delta is because it's Delta and people want service and the reliability, you know the service that our great people provide and they're willing to pay a premium. On average people pay a 20% premium to be on Delta versus the industry at large. Not every flight, not every day, that's an average by the way, every flight every day, but there's some differences in there based on who we're competing with and the priorities those customers have.`;

const PROMPT = `You are evaluating podcast transcript chunks for Usman, who has read 400+ entrepreneur biographies.

Rate this business insight on a scale of 0-100. Consider:
- Does it have quantified outcomes (specific numbers, timeframes)?
- Is it counter-intuitive or just common business knowledge?
- Does it reveal a specific mechanism or just state a result?

CHUNK:
${DELTA_SIGNAL}

Score each dimension 0-100, then provide overall score with reasoning.`;

async function testGrok4Fast() {
  console.log("🧪 Testing Grok-4-fast for Scoring Variance\n");
  console.log("Running 5 iterations to test consistency...\n");

  const scores: number[] = [];

  for (let i = 1; i <= 5; i++) {
    console.log(`--- Run ${i} ---`);

    const result = await generateObject({
      model: openrouter("x-ai/grok-4-fast"),
      schema: judgementSchema,
      prompt: PROMPT,
      temperature: 0, // Deterministic
    });

    const score = result.object.overallScore;
    scores.push(score);

    console.log(`Score: ${score}%`);
    console.log(
      `Buckets: F=${result.object.frameworkClarity} I=${result.object.insightNovelty} T=${result.object.tacticalSpecificity} R=${result.object.reasoningDepth}`,
    );
    console.log(`Reasoning: ${result.object.reasoning.substring(0, 150)}...`);
    console.log();
  }

  // Calculate variance
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) /
    scores.length;
  const stdDev = Math.sqrt(variance);

  console.log("\n" + "=".repeat(80));
  console.log("📊 VARIANCE ANALYSIS");
  console.log("=".repeat(80));
  console.log(`Scores: ${scores.join(", ")}`);
  console.log(`Mean: ${avg.toFixed(1)}%`);
  console.log(`Std Dev: ${stdDev.toFixed(1)}%`);
  console.log(`Range: ${Math.min(...scores)}% - ${Math.max(...scores)}%`);
  console.log(
    `Variance: ${stdDev < 5 ? "✅ LOW (good)" : stdDev < 15 ? "⚠️ MEDIUM" : "❌ HIGH (bad)"}`,
  );
}

testGrok4Fast().catch(console.error);
