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
  // Philosophy: Be specific to avoid false positives. Only catch clear CTAs and sponsorships.
  // Don't block legitimate discussion of topics like "pricing strategy" or "excited to share insights"
  const adIndicators = [
    // CTAs with action verbs (high confidence - clear calls to action)
    /\b(check out|learn more at|sign up now|get started today|click here|find out more)\b/i,
    /\b(visit (our|my|the) (site|website|page|link))\b/i, // "visit" only with CTA context
    /\b(try (it|this|us) (now|today|free|out))\b/i,
    /\b(subscribe (now|today|to (our|my|the)))\b/i, // "subscribe" with CTA context, not standalone

    // URLs with paths (likely ads/affiliate links)
    /\.(com|io|net|org)\/[a-z-_]/i,

    // Sponsorship mentions (high confidence)
    /\b(this episode is sponsored|brought to you by|today'?s sponsor|our sponsor)\b/i,

    // Legal/compliance language (high confidence)
    /\b(member fdic|terms (and|&) conditions apply|subject to availability)\b/i,

    // Pricing CTAs (specific phrases, not generic "pricing" discussion)
    /\b(plans starting at|pricing starts at|starting from \$\d+|from only \$\d+)\b/i,
    /\$\d+\s?\/(month|year|mo|yr)\b/i, // $99/month format

    // Event CTAs (specific calls to action, not general announcements)
    /\b(register (now|today|here)|save your spot|rsvp (now|today|here))\b/i,
    /\b(join (me|us) (at|for) (our|the|this) (event|conference|webinar|workshop))\b/i,

    // Product pitches with URLs (high confidence)
    /\b(that's why (I|we) (built|created|made|launched))\s+\w+\.(com|io|net)/i,

    // Event marketing (specific promotional language)
    /\b(I'm (speaking|presenting) at (the|this|our))\b/i,
    /\b(event features|connect with peers|lineup of (amazing|great|industry) speakers)\b/i,
  ];

  const adPenalty = adIndicators.filter((pattern) => pattern.test(trimmed));

  if (adPenalty.length > 0) {
    return buildEmptyBuckets([
      `Commercial/ad content detected (${adPenalty.length} indicators)`,
    ]);
  }

  // FILTER 3: Intro/outro detection
  // Philosophy: Catch episode framing and social CTAs, but allow legitimate summaries.
  // "In this episode they discussed X" is valid content, not an intro.
  const introOutroIndicators = [
    // Episode framing (high confidence - clear intros/outros)
    /\b(enjoy the episode|let's (dive|jump) (right )?in|here we go)\b/i,
    /\b(stick (around|to the end)|if you (stay|stick) (around|to the end))\b/i,

    // Social media CTAs (high confidence)
    /\b(like for the algorithm|hit the (bell|like button)|smash that (like|bell))\b/i,
    /\b(comment (below|down below)|subscribe (and|to) (the|my) (channel|newsletter))\b/i,

    // Show logistics (high confidence)
    /\b(show notes|links? in the (description|comments|show notes))\b/i,
    /\b(check (out )?the (show notes|description))\b/i,

    // Pleasantries at start/end (high confidence)
    /\b(thanks for (coming on|having me|listening|tuning in))\b/i,
    /\b(glad to be here|thank you for having me|thanks for being here)\b/i,
    /\b(hope you (enjoyed|enjoy)|see you next (time|week|episode))\b/i,

    // Product pitch with URL (moved from ad indicators)
    /\b(that's why (I|we) (built|created|made|launched))\s+\w+\.(com|io|net)/i,
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
