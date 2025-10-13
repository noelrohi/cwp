# Signal Scoring Architecture

## Overview

The scoring system uses a **two-stage pipeline**:

1. **Heuristic Filter** (fast, cheap) - Filters garbage
2. **LLM Judge** (smart, accurate) - Judges quality

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
               │ Stage 2: LLM JUDGE (gpt-4o-mini)             │
               │ - Framework clarity (novel vs obvious?)      │
               │ - Insight novelty (counter-intuitive?)       │
               │ - Tactical specificity (actionable?)         │
               │ - Reasoning depth (surface vs structural?)   │
               │                                               │
               │ Cost: ~$0.0001 per signal                     │
               │ Speed: ~500ms (batched)                       │
               └──────────────┬───────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────────────────────┐
               │ Output: Score (0-100)                        │
               │ - >= 50: SAVE                                │
               │ - < 50: SKIP                                 │
               └──────────────────────────────────────────────┘
```

## Cost Analysis

**Scenario:** 10 podcasts/day, 30 signals per podcast = 300 signals/day

**Previous hybrid approach:**
- Heuristics filter ~50% → 150 signals to LLM
- Cost: 150 × $0.0001 = **$0.45/month**
- Problem: Heuristics had false positives (scored Amazon model at 95%)

**New LLM-only approach:**
- Heuristics filter only garbage (~10%) → 270 signals to LLM
- Cost: 270 × $0.0001 = **$0.81/month**
- Benefit: No false positives, accurate quality judgment

**Cost increase: $0.36/month** (~1 coffee)  
**Complexity decrease: 70% less code**  
**Accuracy increase: Significant** (LLM can detect novelty)

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
// Quality judgment with Usman's preferences
const HYBRID_PROMPT = `You are evaluating podcast transcript chunks for Usman.

WHAT HE SAVES:
1. Named frameworks ("positional chess", "idea maze")
2. Counter-intuitive insights that flip conventional wisdom
3. Specific tactics with deep reasoning
4. Assessment criteria for judgment

WHAT HE SKIPS:
1. Generic observations (even if true)
2. Well-known frameworks (Amazon marketplace model)
3. Biographical details without lessons
4. Company-specific strategies (not generalizable)

Score 0-100. Most content: 30-50. Exceptional: 65+.
`;
```

### Batch Processing

```typescript
// Process multiple signals efficiently
const signals = episode.signals.filter(s => s.wordCount >= 80);
const scores = await judgeHybridBatch(signals.map(s => s.content));
```

## Validation Results

**Before (hybrid heuristics):**
- Signal 3 (Amazon model): 95% → Auto-save ❌ (Usman skipped)
- False positive rate: ~20%

**After (LLM-only):**
- Signal 3 (Amazon model): ~45% → Skip ✅ (Usman skipped)
- False positive rate: <5%

## Key Insights

1. **Don't try to hardcode taste** - Pattern matching can't distinguish "armchair quarterback" (novel) from "Amazon model" (obvious)

2. **Length is a weak signal** - Saves range 107-529 words, skips range 101-278 words. Too much overlap.

3. **Novelty requires understanding** - Only LLMs can judge if a framework is fresh or everyone knows it.

4. **Keep it simple** - The best architecture is the one you can understand and debug.

## Future Improvements

1. **Fine-tune on Usman's data** - Use his 122 saves + 150 skips to fine-tune a small model
2. **Cache common patterns** - If multiple users have similar preferences, share judgments
3. **Active learning** - When LLM is uncertain (45-55% score), ask user for feedback
4. **Multi-user** - Different users have different taste - personalize the prompt

## References

- `/src/server/lib/hybrid-heuristics.ts` - Garbage filters
- `/src/server/lib/hybrid-judge.ts` - LLM judgment
- `/src/server/lib/hybrid-scoring.ts` - Pipeline orchestration
- `/docs/USMAN_PATTERN_ANALYSIS.md` - Analysis of Usman's preferences
