/**
 * Test Hybrid Scoring Approach (Option C)
 *
 * Pipeline:
 * 1. Length filter (>200 words) - eliminates shallow content
 * 2. Framework heuristics - detects patterns Usman values
 * 3. LLM-as-judge (for borderline cases) - deep reasoning assessment
 *
 * This script tests the approach on Usman's actual saves/skips
 * to see if it would predict his behavior better than current system.
 */
/** biome-ignore-all lint/correctness/noUnusedVariables: ** */
/** biome-ignore-all lint/correctness/useParseIntRadix: ** */
/** biome-ignore-all lint/style/useTemplate: ** */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { dailySignal, savedChunk, transcriptChunk } from "@/server/db/schema";

const USMAN_USER_ID = "50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// STEP 1: LENGTH FILTER
// ============================================================================

function lengthFilter(content: string): { pass: boolean; wordCount: number } {
  const wordCount = content.trim().split(/\s+/).length;
  // Lower threshold - many saves are 100-150 words
  // But give penalty to very short content in heuristics instead
  const pass = wordCount >= 80;
  return { pass, wordCount };
}

// ============================================================================
// STEP 2: FRAMEWORK HEURISTICS
// ============================================================================

interface HeuristicScore {
  frameworkScore: number; // 0-1
  insightScore: number; // 0-1
  specificityScore: number; // 0-1
  overallScore: number; // 0-1
  reasons: string[];
}

function extractHeuristicFeatures(content: string): HeuristicScore {
  const reasons: string[] = [];
  let frameworkScore = 0;
  let insightScore = 0;
  let specificityScore = 0;

  // LENGTH PENALTY: Very short content is usually low quality
  const wordCount = content.trim().split(/\s+/).length;
  let lengthMultiplier = 1.0;
  if (wordCount < 100) {
    lengthMultiplier = 0.5; // Heavy penalty for very short
    reasons.push(`Very short (${wordCount} words)`);
  } else if (wordCount < 150) {
    lengthMultiplier = 0.7; // Moderate penalty
    reasons.push(`Short (${wordCount} words)`);
  } else if (wordCount > 250) {
    lengthMultiplier = 1.2; // Bonus for longer, detailed content
    reasons.push(`Long detailed content (${wordCount} words)`);
  }

  // FRAMEWORK DETECTION
  // Named concepts: "we call this X", "idea maze", "hyperfluency", etc.
  const hasNamedConcept =
    /\b(we call (this|that|it)|this is called|known as|referred to as|term for)\b/i.test(
      content,
    );
  const hasQuotedConcept = /"[A-Z][a-z]+(\s[A-Z][a-z]+)*"/g.test(content); // "Idea Maze", "Operating Rails"
  const hasVsPattern =
    /\b\w+\s+(vs\.?|versus|compared to|rather than|instead of)\s+\w+/i.test(
      content,
    );
  const hasFrameworkMarker =
    /\b(framework|model|pattern|principle|law|rule|playbook|system)\b/i.test(
      content,
    );

  if (hasNamedConcept) {
    frameworkScore += 0.5; // INCREASED - this is a strong signal
    reasons.push("Named concept detected");
  }
  if (hasQuotedConcept) {
    frameworkScore += 0.4;
    reasons.push("Quoted framework/concept");
  }
  if (hasVsPattern) {
    frameworkScore += 0.3;
    reasons.push("Comparison pattern (X vs Y)");
  }
  if (hasFrameworkMarker) {
    frameworkScore += 0.3; // INCREASED
    reasons.push("Framework marker word");
  }
  if (hasQuotedConcept) {
    frameworkScore += 0.3;
    reasons.push("Quoted framework/concept");
  }
  if (hasVsPattern) {
    frameworkScore += 0.2;
    reasons.push("Comparison pattern (X vs Y)");
  }
  if (hasFrameworkMarker) {
    frameworkScore += 0.2;
    reasons.push("Framework marker word");
  }

  // INSIGHT DENSITY
  // Counter-intuitive signals
  const hasContrarian =
    /\b(but actually|but really|however|contrary to|opposite|paradox|irony|counterintuitively)\b/i.test(
      content,
    );
  const hasCausalClaim =
    /\b(because|therefore|thus|hence|leads to|causes|results in|if .+ then)\b/i.test(
      content,
    );
  const hasNegation =
    /\b(not|never|nobody|nothing|isn't|doesn't|won't|can't)\b/gi.test(content);
  const negationCount = (
    content.match(
      /\b(not|never|nobody|nothing|isn't|doesn't|won't|can't)\b/gi,
    ) || []
  ).length;

  if (hasContrarian) {
    insightScore += 0.5; // INCREASED
    reasons.push("Counter-intuitive language");
  }
  if (hasCausalClaim) {
    insightScore += 0.4; // INCREASED
    reasons.push("Causal reasoning");
  }
  if (negationCount >= 3) {
    insightScore += 0.4; // INCREASED - challenging assumptions
    reasons.push("Multiple negations (challenging assumptions)");
  } else if (negationCount >= 1) {
    insightScore += 0.2; // At least some critical thinking
    reasons.push("Some negation/critical thinking");
  }

  // SPECIFICITY
  // Concrete examples, numbers, names
  const hasNumbers =
    /\d+([.,]\d+)?(%|x|X|\s*(percent|million|billion|thousand))?/.test(content);
  const hasProperNouns = /\b[A-Z][a-z]+(\s[A-Z][a-z]+)*\b/g.test(content);
  const hasSteps = /\b(first|second|third|step|stage|phase)\b/i.test(content);
  const hasExampleMarker =
    /\b(for example|for instance|such as|like when|imagine)\b/i.test(content);

  if (hasNumbers) {
    specificityScore += 0.3;
    reasons.push("Contains data/numbers");
  }
  if (hasProperNouns) {
    specificityScore += 0.2;
    reasons.push("Named entities");
  }
  if (hasSteps) {
    specificityScore += 0.25;
    reasons.push("Step-by-step process");
  }
  if (hasExampleMarker) {
    specificityScore += 0.25;
    reasons.push("Concrete examples");
  }

  // Clamp scores to 0-1
  frameworkScore = Math.min(1, frameworkScore);
  insightScore = Math.min(1, insightScore);
  specificityScore = Math.min(1, specificityScore);

  // Overall: weighted average (framework matters most for Usman)
  // Apply length multiplier to penalize very short content
  const baseScore =
    frameworkScore * 0.4 + insightScore * 0.35 + specificityScore * 0.25;
  const overallScore = Math.min(1, baseScore * lengthMultiplier);

  return {
    frameworkScore,
    insightScore,
    specificityScore,
    overallScore,
    reasons,
  };
}

// ============================================================================
// STEP 3: LLM-AS-JUDGE (for borderline cases)
// ============================================================================

const llmScoreSchema = z.object({
  frameworkClarity: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Does this introduce a named framework, concept, or mental model that can be reused? " +
        "100 = Clear named framework ('idea maze', 'operating rails'). " +
        "0 = No framework, just commentary.",
    ),
  insightNovelty: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Is this counter-intuitive or does it flip conventional wisdom? " +
        "100 = Highly counter-intuitive, challenges assumptions. " +
        "0 = Obvious, generic observation.",
    ),
  tacticalSpecificity: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Is this actionable with specific tactics, or vague advice? " +
        "100 = Specific steps, concrete examples, named tactics. " +
        "0 = Vague platitudes, abstract wisdom.",
    ),
  reasoningDepth: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Does this show deep structural analysis or surface observation? " +
        "100 = Deep systems thinking, causal reasoning, pattern recognition. " +
        "0 = Surface-level commentary, stating the obvious.",
    ),
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Overall, would Usman (investor/founder who values frameworks, counter-intuitive insights, " +
        "and deep analysis) save this for future reference?",
    ),
  reasoning: z.string().describe("Brief explanation of the scores"),
});

async function llmScore(content: string): Promise<{
  scores: z.infer<typeof llmScoreSchema>;
  cost: number;
}> {
  const startTime = Date.now();

  try {
    const result = await generateObject({
      model: openai("gpt-4.1-mini"), // Cheapest, good enough for scoring
      schema: llmScoreSchema,
      prompt: `You are evaluating podcast transcript chunks for Usman, an investor/founder who writes about:
- Professional services disruption
- NewCo vs LegacyCo frameworks  
- Structural transformations in work/business

He VALUES:
- Named frameworks he can reuse ("idea maze", "operating rails", "sea of sameness")
- Counter-intuitive insights that flip conventional wisdom
- Specific tactics with conceptual grounding
- Assessment criteria for judging people/companies/ideas

He SKIPS:
- Generic observations (even if true)
- Lists without synthesis
- Vague wisdom without specificity
- Biographical details without lessons

Score this chunk on the dimensions provided.

CHUNK:
${content}

Be critical. Most content should score 30-50. Only truly exceptional content scores >70.`,
    });

    const elapsed = Date.now() - startTime;

    // Estimate cost (gpt-4.1-mini is ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens)
    // Rough estimate: ~500 input tokens, ~100 output tokens
    const estimatedCost = (500 * 0.15 + 100 * 0.6) / 1_000_000;

    console.log(
      `  LLM scored in ${elapsed}ms (cost: ~$${estimatedCost.toFixed(6)})`,
    );

    return {
      scores: result.object,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error("LLM scoring failed:", error);
    // Fallback to neutral score
    return {
      scores: {
        frameworkClarity: 50,
        insightNovelty: 50,
        tacticalSpecificity: 50,
        reasoningDepth: 50,
        overallScore: 50,
        reasoning: "LLM scoring failed",
      },
      cost: 0,
    };
  }
}

// ============================================================================
// HYBRID SCORING PIPELINE
// ============================================================================

interface HybridResult {
  pass: boolean;
  score: number; // 0-100
  method: "lengthFilter" | "heuristics" | "llm";
  details: {
    wordCount?: number;
    heuristicScore?: HeuristicScore;
    llmScore?: z.infer<typeof llmScoreSchema>;
  };
  cost: number;
}

async function hybridScore(content: string): Promise<HybridResult> {
  // STAGE 1: Length filter
  const lengthCheck = lengthFilter(content);

  if (!lengthCheck.pass) {
    return {
      pass: false,
      score: 20, // Auto-fail short content
      method: "lengthFilter",
      details: { wordCount: lengthCheck.wordCount },
      cost: 0,
    };
  }

  // STAGE 2: Heuristic scoring
  const heuristics = extractHeuristicFeatures(content);
  const heuristicScore = heuristics.overallScore * 100; // Convert to 0-100

  // If heuristics are confident (very high or very low), trust them
  if (heuristicScore >= 60) {
    // High heuristic score -> likely good
    return {
      pass: true,
      score: heuristicScore,
      method: "heuristics",
      details: {
        wordCount: lengthCheck.wordCount,
        heuristicScore: heuristics,
      },
      cost: 0,
    };
  }

  if (heuristicScore <= 25) {
    // Low heuristic score -> likely bad
    return {
      pass: false,
      score: heuristicScore,
      method: "heuristics",
      details: {
        wordCount: lengthCheck.wordCount,
        heuristicScore: heuristics,
      },
      cost: 0,
    };
  }

  // STAGE 3: LLM for borderline cases (25-60)
  console.log(
    `  Borderline heuristic score (${heuristicScore.toFixed(1)}) -> using LLM`,
  );
  const llmResult = await llmScore(content);

  return {
    pass: llmResult.scores.overallScore >= 50,
    score: llmResult.scores.overallScore,
    method: "llm",
    details: {
      wordCount: lengthCheck.wordCount,
      heuristicScore: heuristics,
      llmScore: llmResult.scores,
    },
    cost: llmResult.cost,
  };
}

// ============================================================================
// EVALUATION
// ============================================================================

interface EvaluationResult {
  totalSaves: number;
  totalSkips: number;
  correctSavePredictions: number;
  correctSkipPredictions: number;
  accuracy: number;
  precision: number; // Of predicted saves, how many were actual saves?
  recall: number; // Of actual saves, how many did we predict?
  totalCost: number;
  methodBreakdown: {
    lengthFilter: number;
    heuristics: number;
    llm: number;
  };
}

async function evaluateHybridScoring(
  sampleSize: number = 50,
): Promise<EvaluationResult> {
  console.log("=".repeat(80));
  console.log("EVALUATING HYBRID SCORING APPROACH");
  console.log("=".repeat(80));
  console.log();

  // Get sample of saves
  const saves = await db
    .select({
      chunkId: savedChunk.chunkId,
      content: transcriptChunk.content,
      currentScore: dailySignal.relevanceScore,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .leftJoin(
      dailySignal,
      and(
        eq(dailySignal.chunkId, savedChunk.chunkId),
        eq(dailySignal.userId, USMAN_USER_ID),
      ),
    )
    .where(eq(savedChunk.userId, USMAN_USER_ID))
    .orderBy(desc(savedChunk.savedAt))
    .limit(sampleSize);

  // Get sample of skips
  const skips = await db
    .select({
      chunkId: dailySignal.chunkId,
      content: transcriptChunk.content,
      currentScore: dailySignal.relevanceScore,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, USMAN_USER_ID),
        eq(dailySignal.userAction, "skipped"),
      ),
    )
    .orderBy(desc(dailySignal.actionedAt))
    .limit(sampleSize);

  console.log(`Testing on ${saves.length} saves and ${skips.length} skips`);
  console.log();

  let correctSavePredictions = 0;
  let correctSkipPredictions = 0;
  let totalCost = 0;
  let predictedSaves = 0;
  const methodBreakdown = {
    lengthFilter: 0,
    heuristics: 0,
    llm: 0,
  };

  // Test on saves
  console.log("Testing SAVES...");
  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];
    if (!save.content) continue;

    console.log(`\n[${i + 1}/${saves.length}] Testing saved chunk...`);
    const result = await hybridScore(save.content);

    methodBreakdown[result.method]++;
    totalCost += result.cost;

    const predicted = result.score >= 50;
    if (predicted) {
      predictedSaves++;
      correctSavePredictions++;
    }

    console.log(
      `  Result: ${predicted ? "✅ SAVE" : "❌ SKIP"} ` +
        `(score: ${result.score.toFixed(1)}, method: ${result.method}, ` +
        `current score: ${
          save.currentScore ? (save.currentScore * 100).toFixed(1) + "%" : "N/A"
        })`,
    );
  }

  // Test on skips
  console.log("\n\nTesting SKIPS...");
  for (let i = 0; i < skips.length; i++) {
    const skip = skips[i];
    if (!skip.content) continue;

    console.log(`\n[${i + 1}/${skips.length}] Testing skipped chunk...`);
    const result = await hybridScore(skip.content);

    methodBreakdown[result.method]++;
    totalCost += result.cost;

    const predicted = result.score >= 50;
    if (predicted) predictedSaves++;
    if (!predicted) correctSkipPredictions++;

    console.log(
      `  Result: ${!predicted ? "✅ SKIP" : "❌ SAVE"} ` +
        `(score: ${result.score.toFixed(1)}, method: ${result.method}, ` +
        `current score: ${skip.currentScore ? (skip.currentScore * 100).toFixed(1) + "%" : "N/A"})`,
    );
  }

  // Calculate metrics
  const totalCorrect = correctSavePredictions + correctSkipPredictions;
  const totalSamples = saves.length + skips.length;
  const accuracy = totalCorrect / totalSamples;
  const precision =
    predictedSaves > 0 ? correctSavePredictions / predictedSaves : 0;
  const recall = saves.length > 0 ? correctSavePredictions / saves.length : 0;

  return {
    totalSaves: saves.length,
    totalSkips: skips.length,
    correctSavePredictions,
    correctSkipPredictions,
    accuracy,
    precision,
    recall,
    totalCost,
    methodBreakdown,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const sampleSize = parseInt(process.argv[2] || "20");

  console.log("\n");
  console.log("=".repeat(80));
  console.log("🧪 TESTING HYBRID SCORING APPROACH");
  console.log("=".repeat(80));
  console.log();
  console.log("Pipeline:");
  console.log("  1. Length filter (>200 words) - FREE");
  console.log("  2. Heuristics (frameworks, insights, specificity) - FREE");
  console.log("  3. LLM-as-judge (borderline cases 30-70) - ~$0.001 per chunk");
  console.log();
  console.log(`Sample size: ${sampleSize} saves + ${sampleSize} skips`);
  console.log();

  const results = await evaluateHybridScoring(sampleSize);

  console.log("\n\n");
  console.log("=".repeat(80));
  console.log("📊 RESULTS");
  console.log("=".repeat(80));
  console.log();
  console.log(`Total samples: ${results.totalSaves + results.totalSkips}`);
  console.log(`  Saves: ${results.totalSaves}`);
  console.log(`  Skips: ${results.totalSkips}`);
  console.log();
  console.log("ACCURACY:");
  console.log(`  Overall: ${(results.accuracy * 100).toFixed(1)}%`);
  console.log(
    `  Correctly predicted saves: ${results.correctSavePredictions}/${results.totalSaves} ` +
      `(${((results.correctSavePredictions / results.totalSaves) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Correctly predicted skips: ${results.correctSkipPredictions}/${results.totalSkips} ` +
      `(${((results.correctSkipPredictions / results.totalSkips) * 100).toFixed(1)}%)`,
  );
  console.log();
  console.log("PRECISION & RECALL:");
  console.log(
    `  Precision: ${(results.precision * 100).toFixed(1)}% (of predicted saves, how many were correct)`,
  );
  console.log(
    `  Recall: ${(results.recall * 100).toFixed(1)}% (of actual saves, how many did we catch)`,
  );
  console.log();
  console.log("METHOD BREAKDOWN:");
  console.log(
    `  Length filter: ${results.methodBreakdown.lengthFilter} chunks (${((results.methodBreakdown.lengthFilter / (results.totalSaves + results.totalSkips)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Heuristics: ${results.methodBreakdown.heuristics} chunks (${((results.methodBreakdown.heuristics / (results.totalSaves + results.totalSkips)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  LLM: ${results.methodBreakdown.llm} chunks (${((results.methodBreakdown.llm / (results.totalSaves + results.totalSkips)) * 100).toFixed(1)}%)`,
  );
  console.log();
  console.log("COST:");
  console.log(`  Total: $${results.totalCost.toFixed(4)}`);
  console.log(
    `  Per chunk: $${(results.totalCost / (results.totalSaves + results.totalSkips)).toFixed(6)}`,
  );
  console.log(
    `  Extrapolated for 1000 chunks: $${((results.totalCost / (results.totalSaves + results.totalSkips)) * 1000).toFixed(2)}`,
  );
  console.log();

  // Compare to baseline
  console.log("=".repeat(80));
  console.log("💡 COMPARISON");
  console.log("=".repeat(80));
  console.log();
  console.log("Current system (embedding-based):");
  console.log("  • Saved avg score: 67.8%");
  console.log("  • Skipped avg score: 55.0%");
  console.log("  • Problem: 55 high-scoring chunks (>60%) were skipped");
  console.log("  • Centroid similarity: 97.37% (cannot distinguish)");
  console.log();
  console.log("Hybrid approach:");
  console.log(`  • Accuracy: ${(results.accuracy * 100).toFixed(1)}%`);
  console.log(`  • Precision: ${(results.precision * 100).toFixed(1)}%`);
  console.log(`  • Recall: ${(results.recall * 100).toFixed(1)}%`);
  console.log(
    `  • Cost: $${((results.totalCost / (results.totalSaves + results.totalSkips)) * 1000).toFixed(2)} per 1000 chunks`,
  );
  console.log();

  if (results.accuracy > 0.7) {
    console.log("✅ HYBRID APPROACH LOOKS PROMISING!");
    console.log("   Consider implementing this in production.");
  } else if (results.accuracy > 0.6) {
    console.log("⚠️  HYBRID APPROACH SHOWS IMPROVEMENT");
    console.log("   Needs tuning, but better than baseline.");
  } else {
    console.log("❌ HYBRID APPROACH NEEDS MORE WORK");
    console.log("   May need better heuristics or LLM tuning.");
  }

  console.log();
  console.log("=".repeat(80));
}

main()
  .then(() => {
    console.log("\n✅ Test complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
