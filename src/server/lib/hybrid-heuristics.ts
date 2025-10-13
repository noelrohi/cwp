import type { HeuristicBuckets, HeuristicResult } from "./hybrid-types";
import {
  HEURISTIC_SAVE_THRESHOLD,
  HEURISTIC_SKIP_THRESHOLD,
  LENGTH_SKIP_THRESHOLD,
} from "./hybrid-types";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

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

export function extractHeuristicBuckets(content: string): HeuristicBuckets {
  const trimmed = content.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  if (wordCount < LENGTH_SKIP_THRESHOLD) {
    return buildEmptyBuckets([
      `Very short (${wordCount} words) - below hybrid threshold`,
    ]);
  }

  // AD & NON-CONTENT DETECTION
  const adIndicators = [
    /\b(check out|visit|learn more at|sign up|get started|try|subscribe to)\b/i,
    /\.(com|io|net|org)\/[a-z-_]/i, // URLs with paths
    /\b(sponsor|sponsored|brought to you|partner with|partnering with)\b/i,
    /\b(member fdic|terms.*conditions apply|subject to)\b/i,
    /\b(pricing|plans starting at|\$\d+\/month)\b/i,
    /\b(register|join (me|us)|save your spot|rsvp|inaugural)\b/i,
    /\b(excited to (join|announce|share)|I'm (on stage|speaking at))\b/i,
    /\b(event features|connect with peers|lineup of.*speakers)\b/i,
  ];

  const introOutroIndicators = [
    /\b(enjoy the episode|stick to the end|if you (stay|stick) (around|to)|let's (dive|jump) in)\b/i,
    /\b(like for the algorithm|comment for|subscribe|hit the bell)\b/i,
    /\b(that's why (I|we) (built|created|made))\s+\w+\.(com|io)/i,
    /\b(in this episode|so in this episode|in today's episode)\b/i,
    /\b(thanks for (coming on|having me)|hope you come back|include links)\b/i,
    /\b(show notes|in the (description|comments))\b/i,
    /\b(delivered.*over delivered|glad to be here|thank you for having me)\b/i,
  ];

  const adPenalty = adIndicators.filter((pattern) => pattern.test(trimmed));
  const introPenalty = introOutroIndicators.filter((pattern) =>
    pattern.test(trimmed),
  );

  if (adPenalty.length > 0) {
    return buildEmptyBuckets([
      `Commercial/ad content detected (${adPenalty.length} indicators)`,
    ]);
  }

  if (introPenalty.length > 0) {
    return buildEmptyBuckets([
      `Episode intro/outro detected (${introPenalty.length} indicators)`,
    ]);
  }

  const reasons: string[] = [];
  let frameworkScore = 0;
  let insightScore = 0;
  let specificityScore = 0;
  let qualityScore = 0;

  // FRAMEWORK DETECTION
  const hasExplicitNaming =
    /\b(we call (this|that|it)|this is called|known as|referred to as|term for|name for)\b/i.test(
      trimmed,
    );

  const hasConceptualLabel =
    /"[A-Z][a-z]+(\s[A-Z][a-z]+)*"/g.test(trimmed) ||
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(trimmed);

  const frameworkMarkers =
    trimmed.match(
      /\b(framework|model|pattern|principle|law|rule|playbook|system|theory|concept|paradigm)\b/gi,
    ) || [];

  const hasComparison =
    /\b\w+\s+(vs\.?|versus|compared to|rather than|instead of|as opposed to)\s+\w+/i.test(
      trimmed,
    );

  const hasAnalogy =
    /\b(it'?s like|similar to|think of it as|imagine|as if|metaphor|analogy)\b/i.test(
      trimmed,
    );

  const hasDefinition = /\b\w+\s+(is when|means|refers to|describes)\b/i.test(
    trimmed,
  );

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

  // INSIGHT DENSITY
  const contrarianPhrases =
    trimmed.match(
      /\b(but actually|but really|however|contrary to|opposite|paradox|irony|counterintuitive|surprising|unexpected|myth|misconception)\b/gi,
    ) || [];

  const causalPhrases =
    trimmed.match(
      /\b(because|therefore|thus|hence|leads to|causes|results in|driven by|stems from)\b/gi,
    ) || [];

  const negations =
    trimmed.match(
      /\b(not|never|nobody|nothing|isn't|doesn't|won't|can't|don't)\b/gi,
    ) || [];
  const questions = (trimmed.match(/\?/g) || []).length;

  const hasConditional =
    /\b(if .+ then|unless|when .+ then|given that)\b/i.test(trimmed);

  const hasChallengeFrame =
    /\b(problem is|issue is|mistake|wrong|misunderstand|miss|overlook|ignore)\b/i.test(
      trimmed,
    );

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

  // SPECIFICITY
  const numbers =
    trimmed.match(
      /\d+([.,]\d+)?(%|x|X|\s*(percent|million|billion|thousand|times))?/g,
    ) || [];

  const properNouns = trimmed.match(/\b[A-Z][a-z]+(\s[A-Z][a-z]+)?\b/g) || [];

  const hasExample =
    /\b(for example|for instance|such as|like when|case in point|consider)\b/i.test(
      trimmed,
    );

  const hasProcess =
    /\b(first|second|third|next|then|finally|step|stage|phase)\b/i.test(
      trimmed,
    );

  const hasTactic =
    /\b(you (can|should|need to|must|have to)|start by|begin with|the way to)\b/i.test(
      trimmed,
    );

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

  // QUALITY SIGNALS
  if (wordCount >= 250) {
    qualityScore += 0.4;
    reasons.push(`Detailed (${wordCount} words)`);
  } else if (wordCount >= 150) {
    qualityScore += 0.2;
    reasons.push(`Moderate length (${wordCount} words)`);
  } else if (wordCount < 100) {
    qualityScore -= 0.3;
    reasons.push(`Very short (${wordCount} words) - likely surface-level`);
  }

  const sentences = trimmed
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const averageSentenceLength =
    sentences.length > 0 ? wordCount / sentences.length : wordCount;
  if (averageSentenceLength > 20 && averageSentenceLength < 40) {
    qualityScore += 0.2;
    reasons.push("Good sentence complexity");
  }

  const totalWords = Math.max(wordCount, 1);
  const commonWordCount =
    trimmed.match(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi)
      ?.length || 0;
  const vocabularyRichness = 1 - commonWordCount / totalWords;
  if (vocabularyRichness > 0.6) {
    qualityScore += 0.3;
    reasons.push("Rich vocabulary");
  }

  frameworkScore = clamp(frameworkScore);
  insightScore = clamp(insightScore);
  specificityScore = clamp(specificityScore);
  qualityScore = clamp(qualityScore, -1, 1);

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

export function scoreWithHeuristics(content: string): HeuristicResult {
  const buckets = extractHeuristicBuckets(content);
  const normalized = Math.max(0, Math.min(1, buckets.overallScore));
  const scaledScore = Math.round(normalized * 100);

  return {
    score: scaledScore,
    pass: scaledScore >= HEURISTIC_SAVE_THRESHOLD,
    fail: scaledScore <= HEURISTIC_SKIP_THRESHOLD || normalized === 0,
    buckets,
    method: "heuristics",
  };
}
