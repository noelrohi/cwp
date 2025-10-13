import { LLM_SAVE_THRESHOLD, LENGTH_SKIP_THRESHOLD } from "./hybrid-types";
import type {
  HybridScoreResult,
  HybridDiagnostics,
  ScoringMethod,
} from "./hybrid-types";
import { judgeHybrid } from "./hybrid-judge";
import { scoreWithHeuristics } from "./hybrid-heuristics";

interface BuildResultArgs {
  rawScore: number;
  pass: boolean;
  method: ScoringMethod;
  wordCount: number;
  borderline: boolean;
  diagnostics?: Omit<HybridDiagnostics, "wordCount">;
}

function buildResult({
  rawScore,
  pass,
  method,
  wordCount,
  borderline,
  diagnostics,
}: BuildResultArgs): HybridScoreResult {
  const clampedScore = Math.max(0, Math.min(100, rawScore));
  const mergedDiagnostics: HybridDiagnostics = {
    wordCount,
    ...diagnostics,
  };

  return {
    rawScore: clampedScore,
    normalizedScore: clampedScore / 100,
    pass,
    method,
    borderline,
    diagnostics: mergedDiagnostics,
  };
}

export async function hybridScore(content: string): Promise<HybridScoreResult> {
  const trimmed = content.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  if (wordCount < LENGTH_SKIP_THRESHOLD) {
    return buildResult({
      rawScore: 15,
      pass: false,
      method: "length",
      wordCount,
      borderline: false,
    });
  }

  const heuristic = scoreWithHeuristics(trimmed);

  if (heuristic.pass || heuristic.fail) {
    return buildResult({
      rawScore: heuristic.score,
      pass: heuristic.pass,
      method: "heuristics",
      wordCount,
      borderline: false,
      diagnostics: {
        heuristic: heuristic.buckets,
      },
    });
  }

  const judged = await judgeHybrid(trimmed);
  const pass = judged.score >= LLM_SAVE_THRESHOLD;

  return buildResult({
    rawScore: judged.score,
    pass,
    method: "llm",
    wordCount,
    borderline: true,
    diagnostics: {
      heuristic: heuristic.buckets,
      llm: {
        buckets: judged.buckets,
        reasoning: judged.reasoning,
        reasons: judged.reasons,
        usage: judged.usage,
      },
    },
  });
}
