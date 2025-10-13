import type { HeuristicBuckets, HeuristicResult } from "./hybrid-types";
import { LENGTH_SKIP_THRESHOLD } from "./hybrid-types";

function buildEmptyBuckets(reason: string[]): HeuristicBuckets {
  return {
    frameworkScore: 0,
    insightScore: 0,
    specificityScore: 0,
    qualityScore: 0,
    overallScore: 0,
    reasons: reason,
  };
}

/**
 * Fast garbage filter - catches ads, intros, and very short content.
 * Everything else goes to LLM for quality judgment.
 *
 * Philosophy: Heuristics are good at filtering garbage (high precision),
 * but bad at judging quality (requires understanding novelty, relevance).
 * Let the LLM do what it's good at.
 */
export function extractHeuristicBuckets(content: string): HeuristicBuckets {
  const trimmed = content.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  // FILTER 1: Too short
  if (wordCount < LENGTH_SKIP_THRESHOLD) {
    return buildEmptyBuckets([
      `Very short (${wordCount} words) - below threshold`,
    ]);
  }

  // FILTER 2: Ad content detection
  const adIndicators = [
    /\b(check out|visit|learn more at|sign up now|get started today|try (it|this) (now|today)|subscribe to)\b/i,
    /\.(com|io|net|org)\/[a-z-_]/i, // URLs with paths
    /\b(this episode is sponsored|brought to you by|today'?s sponsor)\b/i,
    /\b(member fdic|terms.*conditions apply|subject to)\b/i,
    /\b(pricing|plans starting at|\$\d+\/month)\b/i,
    /\b(register (now|today)|join (me|us) (at|for)|save your spot|rsvp|inaugural)\b/i,
    /\b(excited to (join|announce|share)|I'm (on stage|speaking at))\b/i,
    /\b(event features|connect with peers|lineup of.*speakers)\b/i,
  ];

  const adPenalty = adIndicators.filter((pattern) => pattern.test(trimmed));

  if (adPenalty.length > 0) {
    return buildEmptyBuckets([
      `Commercial/ad content detected (${adPenalty.length} indicators)`,
    ]);
  }

  // FILTER 3: Intro/outro detection
  const introOutroIndicators = [
    /\b(enjoy the episode|stick to the end|if you (stay|stick) (around|to)|let's (dive|jump) in)\b/i,
    /\b(like for the algorithm|comment for|subscribe|hit the bell)\b/i,
    /\b(that's why (I|we) (built|created|made))\s+\w+\.(com|io)/i,
    /\b(in this episode|so in this episode|in today's episode)\b/i,
    /\b(thanks for (coming on|having me)|hope you come back|include links)\b/i,
    /\b(show notes|in the (description|comments))\b/i,
    /\b(delivered.*over delivered|glad to be here|thank you for having me)\b/i,
  ];

  const introPenalty = introOutroIndicators.filter((pattern) =>
    pattern.test(trimmed),
  );

  if (introPenalty.length > 0) {
    return buildEmptyBuckets([
      `Episode intro/outro detected (${introPenalty.length} indicators)`,
    ]);
  }

  // Passed all filters → Send to LLM for quality judgment
  // Return neutral score (50%) to indicate "borderline" status
  return {
    frameworkScore: 0.5,
    insightScore: 0.5,
    specificityScore: 0.5,
    qualityScore: 0.5,
    overallScore: 0.5,
    reasons: [`Passed filters (${wordCount} words) - awaiting LLM judgment`],
  };
}

export function scoreWithHeuristics(content: string): HeuristicResult {
  const buckets = extractHeuristicBuckets(content);
  const scaledScore = Math.round(buckets.overallScore * 100);

  return {
    score: scaledScore,
    pass: false, // Never auto-save via heuristics
    fail: scaledScore === 0, // Only auto-skip garbage (ads, intros, too short)
    buckets,
    method: "heuristics",
  };
}
