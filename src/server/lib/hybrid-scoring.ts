import { scoreWithHeuristics } from "./hybrid-heuristics";
import { judgeHybrid, judgeHybridBatch } from "./hybrid-judge";
import type {
  HybridDiagnostics,
  HybridScoreResult,
  ScoringMethod,
} from "./hybrid-types";
import { LENGTH_SKIP_THRESHOLD, LLM_SAVE_THRESHOLD } from "./hybrid-types";

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

export async function hybridScoreBatch(
  contents: string[],
): Promise<HybridScoreResult[]> {
  const results: (
    | HybridScoreResult
    | {
        index: number;
        heuristic: ReturnType<typeof scoreWithHeuristics>;
        trimmed: string;
        wordCount: number;
      }
  )[] = [];
  const llmQueue: {
    index: number;
    trimmed: string;
    heuristic: ReturnType<typeof scoreWithHeuristics>;
    wordCount: number;
  }[] = [];

  for (let i = 0; i < contents.length; i++) {
    const trimmed = contents[i].trim();
    const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

    if (wordCount < LENGTH_SKIP_THRESHOLD) {
      results[i] = buildResult({
        rawScore: 15,
        pass: false,
        method: "length",
        wordCount,
        borderline: false,
      });
      continue;
    }

    const heuristic = scoreWithHeuristics(trimmed);

    if (heuristic.pass || heuristic.fail) {
      results[i] = buildResult({
        rawScore: heuristic.score,
        pass: heuristic.pass,
        method: "heuristics",
        wordCount,
        borderline: false,
        diagnostics: {
          heuristic: heuristic.buckets,
        },
      });
    } else {
      results[i] = { index: i, heuristic, trimmed, wordCount };
      llmQueue.push({ index: i, trimmed, heuristic, wordCount });
    }
  }

  if (llmQueue.length > 0) {
    const judgedResults = await judgeHybridBatch(
      llmQueue.map((item) => item.trimmed),
    );

    for (let i = 0; i < llmQueue.length; i++) {
      const item = llmQueue[i];
      const judged = judgedResults[i];
      const pass = judged.score >= LLM_SAVE_THRESHOLD;

      results[item.index] = buildResult({
        rawScore: judged.score,
        pass,
        method: "llm",
        wordCount: item.wordCount,
        borderline: true,
        diagnostics: {
          heuristic: item.heuristic.buckets,
          llm: {
            buckets: judged.buckets,
            reasoning: judged.reasoning,
            reasons: judged.reasons,
            usage: judged.usage,
          },
        },
      });
    }
  }

  return results as HybridScoreResult[];
}
