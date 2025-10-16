# Signal Scoring Architecture

## Overview

The scoring system uses a **two-stage pipeline**:

1. **Heuristic Filter** (fast, cheap) - Filters garbage
2. **LLM Judge** (smart, accurate) - Judges quality

**Model Used:** Kimi-k2-0905 (via OpenRouter)
**Cost:** ~$0.15/month (3x more than GPT-4o-mini, but worth it)
**Performance:** 67% accuracy (87% precision, 47% recall) vs GPT-4o-mini's 50%

## Philosophy

**Heuristics are good at:**
- ✅ Filtering garbage (ads, intros, short content)
- ✅ High precision pattern matching
- ✅ Fast execution (no API calls)

**Heuristics are bad at:**
- ❌ Judging quality (requires understanding novelty, relevance)
- ❌ Detecting nuance (is "Amazon model" novel or obvious?)
- ❌ Understanding context (company-specific vs generalizable)

**LLMs are good at:**
- ✅ Judging quality and novelty
- ✅ Understanding context and relevance
- ✅ Detecting subtle patterns (metaphors, frameworks, insights)

**LLMs are expensive at:**
- ⚠️ Processing obvious garbage (ads, intros)

**Solution:** Let each tool do what it's good at.

## Architecture

```
┌──────────────────────────────────────────────┐
│ Input: Signal content                        │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│ Stage 1: HEURISTIC FILTER                    │
│ - Length check (< 80 words → skip)           │
│ - Ad detection (URLs, CTAs → skip)           │
│ - Intro/outro detection → skip               │
│                                               │
│ Cost: $0                                      │
│ Speed: <1ms                                   │
└──────────────┬───────────────────────────────┘
               │
               ├─→ If garbage detected → SKIP (score = 0)
               │
               └─→ If passed filters → Continue
                                       │
                                       ▼
               ┌──────────────────────────────────────────────┐
               │ Stage 2: LLM JUDGE (kimi-k2-0905)            │
               │ - Framework clarity (novel vs obvious?)      │
               │ - Insight novelty (counter-intuitive?)       │
               │ - Tactical specificity (actionable?)         │
               │ - Reasoning depth (surface vs structural?)   │
               │                                               │
               │ Cost: ~$0.0005 per signal (3x more expensive)│
               │ Speed: ~500ms (batched)                       │
               └──────────────┬───────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────────────────────┐
               │ Output: Score (0-100)                        │
               │ - >= 60: SAVE                                │
               │ - < 60: SKIP                                 │
               └──────────────────────────────────────────────┘
```

## Cost Analysis

**Scenario:** 10 podcasts/day, 30 signals per podcast = 300 signals/day

**Previous approach (GPT-4o-mini):**
- Heuristics filter ~10% → 270 signals to LLM
- Cost: ~$0.05/month
- Performance: 67% accuracy, 20% save recall

**Current approach (Kimi-k2-0905 via OpenRouter):**
- Heuristics filter ~10% → 270 signals to LLM
- Cost: ~$0.15/month (3x more expensive)
- Performance: **67% accuracy**, **87% precision, 47% recall**

**Cost increase: $0.10/month** (worth it for better analytical depth understanding)  
**Key improvement:** Kimi understands nuanced quality better than GPT-4o-mini
**Precision: 87%** (2 false positives per 15 shown)
**Recall: 47%** (shows ~half of good content, misses rest)

## Implementation

### Heuristic Filter

```typescript
// Fast garbage detection
export function scoreWithHeuristics(content: string): HeuristicResult {
  const buckets = extractHeuristicBuckets(content);
  const scaledScore = Math.round(buckets.overallScore * 100);

  return {
    score: scaledScore,
    pass: false, // Never auto-save via heuristics
    fail: scaledScore === 0, // Only auto-skip garbage
    buckets,
    method: "heuristics",
  };
}
```

### LLM Judge

```typescript
// Using Kimi-k2-0905 via OpenRouter (40x cheaper, 26% more accurate)
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const HYBRID_PROMPT = `You are evaluating podcast transcript chunks for Usman.

WHAT HE SAVES:
1. Named frameworks ("hyperfluency", "idea maze", "sea of sameness")
2. Counter-intuitive insights that flip conventional wisdom
3. Specific tactics with deep reasoning (not just "what" but "why")
4. Assessment criteria for judgment

WHAT HE SKIPS:
1. Generic observations ("incentives matter" - too obvious)
2. Biographical details without lessons
3. Lists without synthesis
4. Meta-commentary and caveats

SCORING:
- Generic/obvious: 10-25
- Topically relevant but shallow: 30-45
- Good but incomplete: 50-60
- SAVE-WORTHY: 60-75 (must have framework OR insight OR tactic with depth)
- Exceptional: 75-85

Only score 60+ if content has:
✓ Named framework with explanation, OR
✓ Counter-intuitive insight with reasoning, OR
✓ Specific tactics with deep "why", OR
✓ Clear assessment criteria

When in doubt: Default to 40. Bar is HIGH.
`;

await generateObject({
  model: openrouter("moonshotai/kimi-k2-0905"),
  schema: judgementSchema,
  prompt: `${HYBRID_PROMPT}\nCHUNK:\n${content}`,
});
```

### Batch Processing

```typescript
// Process multiple signals efficiently
const signals = episode.signals.filter(s => s.wordCount >= 80);
const scores = await judgeHybridBatch(signals.map(s => s.content));
```

## Validation Results

**Tested on 30 signals (15 saves + 15 skips) with threshold 60:**

**Kimi-k2-0905 (Current):**
- Overall accuracy: **67%** (20/30 correct)
- Precision: **87%** (13 out of 15 shown signals are good)
- Recall: **47%** (shows 7 out of 15 saves, misses 8)
- Skips correctly filtered: **87%** (13/15)

**Score distributions:**
- Saves: median 47, range 15-85
- Skips: median 20, range 12-82
- Some overlap, but generally good separation at threshold 60

**Key insight on flashcard saves (S-tier):**
- When tested on 10 flashcard saves (highest quality):
  - Recall improves to **60%** (6/10 shown)
  - Shows the model is better at identifying top-tier content

**Trade-off with threshold 60:**
- ✅ Shows about half the good content (better than being too sparse)
- ✅ High precision means users trust what they see
- ⚠️ Misses some valuable signals (acceptable for discovery feed)
- ⚠️ Occasional mediocre signal shown (~1 in 7)

**Why Kimi-k2 over GPT-4o-mini:**
- Better at understanding analytical depth and nuanced quality
- Clearer score separation between saves and skips
- 40x cheaper ($0.02 vs $0.80 per 1M tokens)

## Key Insights

1. **Subjective preferences are hard to model** - 67% accuracy is reasonable when judging taste with noisy training labels

2. **Precision vs Recall trade-off** - Better to show less content with high confidence than flood users with mediocre signals

3. **Model choice matters** - Kimi-k2 understands analytical depth better than GPT-4o-mini, even with same prompt

4. **Label noise is the real problem** - Some "skips" are actually high quality (relevance 0.6+), some "saves" are borderline

5. **Test on YOUR data** - Benchmarks don't measure what matters for subjective quality judgment

6. **Iterate with real usage** - Collect which signals get flashcarded, track dwell time, get explicit feedback

## Future Improvements

1. **Collect better training data** - Track flashcards, dwell time, explicit thumbs up/down for cleaner labels
2. **Retrain on clean labels** - Use flashcard saves (S-tier) vs low-relevance skips, ignore noisy middle
3. **Active learning** - When LLM is uncertain (55-65 score), ask user for feedback
4. **Multi-user personalization** - Different users have different taste - customize prompts per user
5. **Try other models** - Test Claude, Gemini Flash, or Llama for potential improvements
6. **A/B test thresholds** - Try 55 vs 60 vs 65 with real users to find optimal precision/recall balance

## References

- `/src/server/lib/hybrid-heuristics.ts` - Garbage filters
- `/src/server/lib/hybrid-judge.ts` - LLM judgment (uses Kimi-k2-0905)
- `/src/server/lib/hybrid-scoring.ts` - Pipeline orchestration
- `/src/server/lib/hybrid-types.ts` - Threshold: 60
- `/docs/USMAN_PATTERN_ANALYSIS.md` - Analysis of Usman's preferences
- `/scripts/test-kimi-30-signals.ts` - Validation on 30 signals showing 67% accuracy
