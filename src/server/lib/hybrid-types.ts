export const LENGTH_SKIP_THRESHOLD = 80;
export const HEURISTIC_SAVE_THRESHOLD = 60;
export const HEURISTIC_SKIP_THRESHOLD = 25;
export const LLM_SAVE_THRESHOLD = 50;

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

export interface HybridDiagnostics {
  wordCount: number;
  heuristic?: HeuristicBuckets;
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
