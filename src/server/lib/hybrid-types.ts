// Garbage filter: Skip content shorter than this
export const LENGTH_SKIP_THRESHOLD = 80;

// LLM judgment: Save content scoring above this
// Calibrated for Kimi-k2-0905: 60 gives 100% precision
export const LLM_SAVE_THRESHOLD = 60;

export type ScoringMethod = "length" | "heuristics" | "llm";

export interface HeuristicBuckets {
  frameworkScore: number;
  insightScore: number;
  specificityScore: number;
  qualityScore: number;
  overallScore: number;
  reasons: string[];
}

export interface HeuristicResult {
  score: number;
  pass: boolean;
  fail: boolean;
  buckets: HeuristicBuckets;
  method: "heuristics";
}

export interface JudgeBuckets {
  frameworkClarity: number;
  insightNovelty: number;
  tacticalSpecificity: number;
  reasoningDepth: number;
  overallScore: number;
}

export type LlmUsage = Record<string, unknown>;

export interface JudgeResult {
  score: number;
  buckets: JudgeBuckets;
  reasoning: string;
  reasons: string[];
  usage?: LlmUsage;
  method: "llm";
}

export interface NoveltyDiagnostics {
  noveltyScore: number; // 0.0-1.0
  avgSimilarity: number;
  maxSimilarity: number;
  clusterSize: number;
  adjustment: number;
}

export interface HybridDiagnostics {
  wordCount: number;
  heuristic?: HeuristicBuckets;
  novelty?: NoveltyDiagnostics;
  llm?: {
    buckets: JudgeBuckets;
    reasoning: string;
    reasons: string[];
    usage?: LlmUsage;
  };
}

export interface HybridScoreResult {
  rawScore: number;
  normalizedScore: number;
  pass: boolean;
  method: ScoringMethod;
  borderline: boolean;
  diagnostics: HybridDiagnostics;
}
