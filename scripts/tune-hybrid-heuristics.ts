/**
 * Tuned Hybrid Scoring - Optimized for Usman's patterns
 *
 * Goal: Increase recall from 20% to 50-60% while maintaining high precision
 *
 * Key changes:
 * 1. More aggressive framework detection (metaphors, analogies, "this is like")
 * 2. Better insight detection (dialectic patterns, challenges)
 * 3. Lower thresholds for borderline cases
 * 4. Content quality signals (questions, specificity)
 */
/** biome-ignore-all lint/correctness/useParseIntRadix: ** */

import { generateObject } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { dailySignal, savedChunk, transcriptChunk } from "@/server/db/schema";
import { openrouter } from "../src/ai/models";

const USMAN_USER_ID = "50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G";

// ============================================================================
// IMPROVED HEURISTIC SCORING
// ============================================================================

interface HeuristicScore {
  frameworkScore: number;
  insightScore: number;
  specificityScore: number;
  qualityScore: number;
  overallScore: number;
  reasons: string[];
}

function extractImprovedFeatures(content: string): HeuristicScore {
  const reasons: string[] = [];
  let frameworkScore = 0;
  let insightScore = 0;
  let specificityScore = 0;
  let qualityScore = 0;

  const wordCount = content.trim().split(/\s+/).length;

  // ========================================================================
  // FRAMEWORK DETECTION (Most important for Usman)
  // ========================================================================

  // 1. Explicit naming: "we call this X", "known as X"
  const hasExplicitNaming =
    /\b(we call (this|that|it)|this is called|known as|referred to as|term for|name for)\b/i.test(
      content,
    );

  // 2. Conceptual labeling: "idea maze", "operating rails", "sea of sameness"
  // Look for quoted or capitalized multi-word concepts
  const hasConceptualLabel =
    /"[A-Z][a-z]+(\s[A-Z][a-z]+)*"/g.test(content) ||
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(content);

  // 3. Framework markers
  const frameworkMarkers =
    content.match(
      /\b(framework|model|pattern|principle|law|rule|playbook|system|theory|concept|paradigm)\b/gi,
    ) || [];

  // 4. Comparison patterns: "X vs Y", "X rather than Y"
  const hasComparison =
    /\b\w+\s+(vs\.?|versus|compared to|rather than|instead of|as opposed to)\s+\w+/i.test(
      content,
    );

  // 5. Analogies and metaphors: "it's like X", "similar to X", "think of it as"
  const hasAnalogy =
    /\b(it'?s like|similar to|think of it as|imagine|as if|metaphor|analogy)\b/i.test(
      content,
    );

  // 6. Definitional patterns: "X is when", "X means"
  const hasDefinition = /\b\w+\s+(is when|means|refers to|describes)\b/i.test(
    content,
  );

  // Scoring
  if (hasExplicitNaming) {
    frameworkScore += 0.6;
    reasons.push("Explicit concept naming");
  }
  if (hasConceptualLabel) {
    frameworkScore += 0.4;
    reasons.push("Conceptual label detected");
  }
  if (frameworkMarkers.length >= 2) {
    frameworkScore += 0.5;
    reasons.push(`Multiple framework markers (${frameworkMarkers.length})`);
  } else if (frameworkMarkers.length === 1) {
    frameworkScore += 0.2;
    reasons.push("Framework marker");
  }
  if (hasComparison) {
    frameworkScore += 0.4;
    reasons.push("Comparison pattern (X vs Y)");
  }
  if (hasAnalogy) {
    frameworkScore += 0.3;
    reasons.push("Analogy/metaphor");
  }
  if (hasDefinition) {
    frameworkScore += 0.3;
    reasons.push("Definitional pattern");
  }

  // ========================================================================
  // INSIGHT DENSITY (Counter-intuitive, challenges assumptions)
  // ========================================================================

  // 1. Contrarian language
  const contrarianPhrases =
    content.match(
      /\b(but actually|but really|however|contrary to|opposite|paradox|irony|counterintuitive|surprising|unexpected|myth|misconception)\b/gi,
    ) || [];

  // 2. Causal reasoning
  const causalPhrases =
    content.match(
      /\b(because|therefore|thus|hence|leads to|causes|results in|driven by|stems from)\b/gi,
    ) || [];

  // 3. Critical thinking markers (negation, questioning)
  const negations =
    content.match(
      /\b(not|never|nobody|nothing|isn't|doesn't|won't|can't|don't)\b/gi,
    ) || [];
  const questions = (content.match(/\?/g) || []).length;

  // 4. Conditional logic: "if X then Y", "unless X"
  const hasConditional =
    /\b(if .+ then|unless|when .+ then|given that)\b/i.test(content);

  // 5. Challenge framing: "the problem is", "what's missing", "mistake"
  const hasChallengeFrame =
    /\b(problem is|issue is|mistake|wrong|misunderstand|miss|overlook|ignore)\b/i.test(
      content,
    );

  // Scoring
  if (contrarianPhrases.length >= 2) {
    insightScore += 0.6;
    reasons.push(`Strong contrarian language (${contrarianPhrases.length})`);
  } else if (contrarianPhrases.length === 1) {
    insightScore += 0.3;
    reasons.push("Contrarian language");
  }

  if (causalPhrases.length >= 3) {
    insightScore += 0.5;
    reasons.push(`Deep causal reasoning (${causalPhrases.length})`);
  } else if (causalPhrases.length >= 1) {
    insightScore += 0.3;
    reasons.push("Causal reasoning");
  }

  if (negations.length >= 4) {
    insightScore += 0.4;
    reasons.push(`Heavy critical thinking (${negations.length} negations)`);
  } else if (negations.length >= 2) {
    insightScore += 0.2;
    reasons.push("Critical thinking");
  }

  if (questions >= 2) {
    insightScore += 0.3;
    reasons.push(`Dialectic reasoning (${questions} questions)`);
  }

  if (hasConditional) {
    insightScore += 0.3;
    reasons.push("Conditional logic");
  }

  if (hasChallengeFrame) {
    insightScore += 0.3;
    reasons.push("Challenge framing");
  }

  // ========================================================================
  // SPECIFICITY (Concrete vs abstract)
  // ========================================================================

  // 1. Numbers and data
  const numbers =
    content.match(
      /\d+([.,]\d+)?(%|x|X|\s*(percent|million|billion|thousand|times))?/g,
    ) || [];

  // 2. Named entities (people, companies)
  const properNouns = content.match(/\b[A-Z][a-z]+(\s[A-Z][a-z]+)?\b/g) || [];

  // 3. Concrete examples
  const hasExample =
    /\b(for example|for instance|such as|like when|case in point|consider)\b/i.test(
      content,
    );

  // 4. Step-by-step process
  const hasProcess =
    /\b(first|second|third|next|then|finally|step|stage|phase)\b/i.test(
      content,
    );

  // 5. Specific tactics/actions
  const hasTactic =
    /\b(you (can|should|need to|must|have to)|start by|begin with|the way to)\b/i.test(
      content,
    );

  // Scoring
  if (numbers.length >= 3) {
    specificityScore += 0.5;
    reasons.push(`Data-rich (${numbers.length} numbers)`);
  } else if (numbers.length >= 1) {
    specificityScore += 0.25;
    reasons.push("Contains data");
  }

  if (properNouns.length >= 3) {
    specificityScore += 0.4;
    reasons.push(`Specific examples (${properNouns.length} named entities)`);
  } else if (properNouns.length >= 1) {
    specificityScore += 0.2;
    reasons.push("Named entities");
  }

  if (hasExample) {
    specificityScore += 0.3;
    reasons.push("Concrete examples");
  }

  if (hasProcess) {
    specificityScore += 0.3;
    reasons.push("Step-by-step process");
  }

  if (hasTactic) {
    specificityScore += 0.3;
    reasons.push("Actionable tactics");
  }

  // ========================================================================
  // QUALITY SIGNALS
  // ========================================================================

  // 1. Length (detailed analysis needs words)
  if (wordCount >= 250) {
    qualityScore += 0.4;
    reasons.push(`Detailed (${wordCount} words)`);
  } else if (wordCount >= 150) {
    qualityScore += 0.2;
    reasons.push(`Moderate length (${wordCount} words)`);
  } else if (wordCount < 100) {
    qualityScore -= 0.3; // Penalty for very short
    reasons.push(`Very short (${wordCount} words) - likely surface-level`);
  }

  // 2. Sentence complexity (varied structure)
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLength = wordCount / sentences.length;
  if (avgSentenceLength > 20 && avgSentenceLength < 40) {
    qualityScore += 0.2;
    reasons.push("Good sentence complexity");
  }

  // 3. Vocabulary richness (rare words)
  const commonWords = /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi;
  const totalWords = content.split(/\s+/).length;
  const commonWordCount = (content.match(commonWords) || []).length;
  const vocabularyRichness = 1 - commonWordCount / totalWords;
  if (vocabularyRichness > 0.6) {
    qualityScore += 0.3;
    reasons.push("Rich vocabulary");
  }

  // ========================================================================
  // FINAL SCORING
  // ========================================================================

  // Clamp individual scores
  frameworkScore = Math.min(1, Math.max(0, frameworkScore));
  insightScore = Math.min(1, Math.max(0, insightScore));
  specificityScore = Math.min(1, Math.max(0, specificityScore));
  qualityScore = Math.min(1, Math.max(0, qualityScore));

  // Weighted combination - framework most important for Usman
  const overallScore =
    frameworkScore * 0.4 +
    insightScore * 0.3 +
    specificityScore * 0.2 +
    qualityScore * 0.1;

  return {
    frameworkScore,
    insightScore,
    specificityScore,
    qualityScore,
    overallScore,
    reasons,
  };
}

// ============================================================================
// LLM SCORING (unchanged)
// ============================================================================

const llmScoreSchema = z.object({
  frameworkClarity: z.number().min(0).max(100),
  insightNovelty: z.number().min(0).max(100),
  tacticalSpecificity: z.number().min(0).max(100),
  reasoningDepth: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

async function llmScore(content: string): Promise<{
  scores: z.infer<typeof llmScoreSchema>;
  cost: number;
}> {
  try {
    const result = await generateObject({
      model: openrouter("x-ai/grok-4-fast"),
      schema: llmScoreSchema,
      prompt: `You are evaluating podcast transcript chunks for Usman, an investor/founder who values:
- Named frameworks ("idea maze", "operating rails", "sea of sameness")
- Counter-intuitive insights that flip conventional wisdom
- Specific tactics with conceptual grounding
- Assessment criteria for judging people/companies/ideas

He SKIPS generic observations, vague wisdom, and biographical fluff.

Score this chunk. Be critical - most content is 30-50. Only exceptional content scores >70.

CHUNK:
${content}`,
    });

    const estimatedCost = (500 * 0.15 + 100 * 0.6) / 1_000_000;
    return { scores: result.object, cost: estimatedCost };
  } catch (error) {
    console.error("LLM scoring failed:", error);
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
// TUNED HYBRID PIPELINE
// ============================================================================

interface HybridResult {
  pass: boolean;
  score: number;
  method: "lengthFilter" | "heuristics" | "llm";
  details: {
    wordCount?: number;
    heuristicScore?: HeuristicScore;
    llmScore?: z.infer<typeof llmScoreSchema>;
  };
  cost: number;
}

async function tunedHybridScore(content: string): Promise<HybridResult> {
  const wordCount = content.trim().split(/\s+/).length;

  // STAGE 1: Hard filter for very short content
  if (wordCount < 80) {
    return {
      pass: false,
      score: 15,
      method: "lengthFilter",
      details: { wordCount },
      cost: 0,
    };
  }

  // STAGE 2: Improved heuristic scoring
  const heuristics = extractImprovedFeatures(content);
  const heuristicScore = heuristics.overallScore * 100;

  // TUNED THRESHOLDS (more aggressive to increase recall)
  // High confidence: >= 52 (lowered from 55 to catch more)
  // Low confidence: <= 28 (lowered from 30)
  // Borderline: 28-52 (wider range for LLM)

  if (heuristicScore >= 52) {
    return {
      pass: true,
      score: heuristicScore,
      method: "heuristics",
      details: { wordCount, heuristicScore: heuristics },
      cost: 0,
    };
  }

  if (heuristicScore <= 28) {
    return {
      pass: false,
      score: heuristicScore,
      method: "heuristics",
      details: { wordCount, heuristicScore: heuristics },
      cost: 0,
    };
  }

  // STAGE 3: LLM for borderline (28-52)
  console.log(
    `  Borderline heuristic score (${heuristicScore.toFixed(1)}) -> using LLM`,
  );
  const llmResult = await llmScore(content);

  // Slightly lower LLM threshold to increase recall
  return {
    pass: llmResult.scores.overallScore >= 48,
    score: llmResult.scores.overallScore,
    method: "llm",
    details: {
      wordCount,
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
  falseSaves: number; // Predicted save but was skip
  falseSkips: number; // Predicted skip but was save
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalCost: number;
  methodBreakdown: {
    lengthFilter: number;
    heuristics: number;
    llm: number;
  };
}

async function evaluateTunedHybrid(
  sampleSize: number = 50,
): Promise<EvaluationResult> {
  console.log("=".repeat(80));
  console.log("EVALUATING TUNED HYBRID SCORING");
  console.log("=".repeat(80));
  console.log();

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
  let falseSaves = 0;
  let falseSkips = 0;
  let totalCost = 0;
  const methodBreakdown = {
    lengthFilter: 0,
    heuristics: 0,
    llm: 0,
  };

  console.log("Testing SAVES...");
  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];
    if (!save.content) continue;

    console.log(`\n[${i + 1}/${saves.length}]`);
    const result = await tunedHybridScore(save.content);

    methodBreakdown[result.method]++;
    totalCost += result.cost;

    if (result.pass) {
      correctSavePredictions++;
      console.log(
        `  ✅ SAVE (score: ${result.score.toFixed(1)}, method: ${result.method})`,
      );
    } else {
      falseSkips++;
      console.log(
        `  ❌ SKIP (score: ${result.score.toFixed(1)}, method: ${result.method}) - MISSED SAVE`,
      );
    }
  }

  console.log("\n\nTesting SKIPS...");
  for (let i = 0; i < skips.length; i++) {
    const skip = skips[i];
    if (!skip.content) continue;

    console.log(`\n[${i + 1}/${skips.length}]`);
    const result = await tunedHybridScore(skip.content);

    methodBreakdown[result.method]++;
    totalCost += result.cost;

    if (!result.pass) {
      correctSkipPredictions++;
      console.log(
        `  ✅ SKIP (score: ${result.score.toFixed(1)}, method: ${result.method})`,
      );
    } else {
      falseSaves++;
      console.log(
        `  ❌ SAVE (score: ${result.score.toFixed(1)}, method: ${result.method}) - FALSE POSITIVE`,
      );
    }
  }

  const totalCorrect = correctSavePredictions + correctSkipPredictions;
  const totalSamples = saves.length + skips.length;
  const accuracy = totalCorrect / totalSamples;
  const precision =
    correctSavePredictions + falseSaves > 0
      ? correctSavePredictions / (correctSavePredictions + falseSaves)
      : 0;
  const recall = saves.length > 0 ? correctSavePredictions / saves.length : 0;
  const f1Score =
    precision + recall > 0
      ? (2 * (precision * recall)) / (precision + recall)
      : 0;

  return {
    totalSaves: saves.length,
    totalSkips: skips.length,
    correctSavePredictions,
    correctSkipPredictions,
    falseSaves,
    falseSkips,
    accuracy,
    precision,
    recall,
    f1Score,
    totalCost,
    methodBreakdown,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const sampleSize = parseInt(process.argv[2] || "30");

  console.log("\n");
  console.log("=".repeat(80));
  console.log("🎯 TUNED HYBRID SCORING TEST");
  console.log("=".repeat(80));
  console.log();
  console.log("Improvements:");
  console.log(
    "  ✅ More aggressive framework detection (analogies, metaphors)",
  );
  console.log("  ✅ Better insight detection (dialectic patterns, challenges)");
  console.log("  ✅ Lower thresholds (55 for high, 30 for low, was 60/25)");
  console.log("  ✅ Quality signals (questions, vocabulary richness)");
  console.log();
  console.log(`Sample size: ${sampleSize} saves + ${sampleSize} skips`);
  console.log();

  const results = await evaluateTunedHybrid(sampleSize);

  console.log("\n\n");
  console.log("=".repeat(80));
  console.log("📊 RESULTS");
  console.log("=".repeat(80));
  console.log();
  console.log(`Total samples: ${results.totalSaves + results.totalSkips}`);
  console.log();

  console.log("ACCURACY:");
  console.log(`  Overall: ${(results.accuracy * 100).toFixed(1)}%`);
  console.log(
    `  Correct saves: ${results.correctSavePredictions}/${results.totalSaves} (${((results.correctSavePredictions / results.totalSaves) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Correct skips: ${results.correctSkipPredictions}/${results.totalSkips} (${((results.correctSkipPredictions / results.totalSkips) * 100).toFixed(1)}%)`,
  );
  console.log();

  console.log("ERROR ANALYSIS:");
  console.log(`  False skips (missed saves): ${results.falseSkips}`);
  console.log(`  False saves (false positives): ${results.falseSaves}`);
  console.log();

  console.log("QUALITY METRICS:");
  console.log(
    `  Precision: ${(results.precision * 100).toFixed(1)}% (of predicted saves, how many correct)`,
  );
  console.log(
    `  Recall: ${(results.recall * 100).toFixed(1)}% (of actual saves, how many caught)`,
  );
  console.log(
    `  F1 Score: ${(results.f1Score * 100).toFixed(1)}% (balanced metric)`,
  );
  console.log();

  console.log("EFFICIENCY:");
  console.log(
    `  Length filter: ${results.methodBreakdown.lengthFilter} (${((results.methodBreakdown.lengthFilter / (results.totalSaves + results.totalSkips)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Heuristics: ${results.methodBreakdown.heuristics} (${((results.methodBreakdown.heuristics / (results.totalSaves + results.totalSkips)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  LLM: ${results.methodBreakdown.llm} (${((results.methodBreakdown.llm / (results.totalSaves + results.totalSkips)) * 100).toFixed(1)}%)`,
  );
  console.log();

  console.log("COST:");
  console.log(`  Total: $${results.totalCost.toFixed(4)}`);
  console.log(
    `  Per chunk: $${(results.totalCost / (results.totalSaves + results.totalSkips)).toFixed(6)}`,
  );
  console.log(
    `  For 1000 chunks: $${((results.totalCost / (results.totalSaves + results.totalSkips)) * 1000).toFixed(2)}`,
  );
  console.log();

  console.log("=".repeat(80));
  console.log("💡 ASSESSMENT");
  console.log("=".repeat(80));
  console.log();

  if (results.accuracy >= 0.7 && results.recall >= 0.5) {
    console.log("✅ EXCELLENT! Ready for production.");
    console.log(
      `   • ${(results.accuracy * 100).toFixed(0)}% accuracy with ${(results.recall * 100).toFixed(0)}% recall`,
    );
    console.log(
      `   • ${(results.precision * 100).toFixed(0)}% precision (low false positives)`,
    );
    console.log(
      `   • Cost-effective: $${((results.totalCost / (results.totalSaves + results.totalSkips)) * 1000).toFixed(2)} per 1000 chunks`,
    );
  } else if (results.accuracy >= 0.65 && results.recall >= 0.4) {
    console.log("⚠️  GOOD PROGRESS - Needs minor tuning");
    console.log(
      `   • Accuracy: ${(results.accuracy * 100).toFixed(0)}% (target: 70%+)`,
    );
    console.log(
      `   • Recall: ${(results.recall * 100).toFixed(0)}% (target: 50%+)`,
    );
    console.log(
      "   • Consider: Lower thresholds slightly or add more patterns",
    );
  } else {
    console.log("❌ NEEDS MORE WORK");
    console.log(
      `   • Accuracy: ${(results.accuracy * 100).toFixed(0)}% (too low)`,
    );
    console.log(
      `   • Recall: ${(results.recall * 100).toFixed(0)}% (missing too many saves)`,
    );
    console.log("   • Next: Review false negatives, adjust patterns");
  }

  console.log();
  console.log("COMPARISON TO BASELINE:");
  console.log("  Current system: ~50% accuracy, 97% centroid similarity");
  console.log(
    `  Tuned hybrid: ${(results.accuracy * 100).toFixed(0)}% accuracy, ${(results.recall * 100).toFixed(0)}% recall, ${(results.precision * 100).toFixed(0)}% precision`,
  );
  console.log();
  console.log("=".repeat(80));
}

main()
  .then(() => {
    console.log("\n✅ Evaluation complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
