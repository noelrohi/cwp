# Karpathy Review: Stratified Sampling Implementation

## Review Date
2025-10-01

## Code Review Summary

**Status**: ✅ V3 implementation with proper distribution across full confidence range (0-100%)

## Critical Bugs Found in V1

### Bug #1: Broken Middle Quintile Sampling Logic

```typescript
// BUGGY CODE (V1)
const midSampleRate = midCount / midQuintiles.length;  // e.g., 18/200 = 0.09
for (let i = 0; i < midQuintiles.length && sampled.length < highCount + midCount; i++) {
  if (Math.random() < midSampleRate || sampled.length < highCount + midCount) {
    sampled.push(midQuintiles[i]);
  }
}
```

**Problem**: The `|| sampled.length < highCount + midCount` condition **always evaluates true** for the first 18 iterations, making the random sampling irrelevant. It just took the first 18 chunks sequentially.

**Impact**: Not actually sampling - deterministic selection from top of middle range.

### Bug #2: Position Quintiles Don't Map to Score Confidence

```typescript
// BUGGY ASSUMPTION (V1)
const quintileSize = Math.floor(sorted.length / 5);
const topQuintile = sorted.slice(0, quintileSize);        // "High confidence"
const bottomQuintile = sorted.slice(quintileSize * 4);    // "Low confidence"
```

**Problem**: This assumes uniform score distribution, but actual scores cluster heavily in 60-70% range.

**Result**:
- "Top quintile" contained 60-65% scores (not high)
- "Bottom quintile" contained 55-60% scores (not low)
- Position ≠ Confidence level

**Why This Happened**: When you split by position (quintiles) on a non-uniform distribution, you don't split by score thresholds.

## Distribution Analysis

### V1 Results (Buggy Implementation)
- 40-50%: 12%
- 50-60%: 14%
- 60-70%: 74%

**Why not 20/60/20 target?**
1. Candidate pool has natural clustering (most scores 60-70%)
2. Position quintiles don't map to score buckets
3. Bug #1 takes top 18 from middle quintiles → these fall in 60-70% band
4. Everything ends up clustered where the natural density is

### V2 Results (Fixed Implementation)
- 30-40%: 2%
- 40-50%: 22%
- 50-60%: 34%
- 60-70%: 42%

**Better spread** because:
1. Buckets defined by actual score thresholds (<50%, 50-65%, ≥65%)
2. True uniform random sampling (Fisher-Yates)
3. Handles non-uniform distributions correctly

## Key Insights

### 1. Score Clustering Reveals Deeper Issue

**Observation**: All scores fall in 40-70% range, with heavy clustering at 60-70%.

**What this means**:
- Embedding space isn't perfectly calibrated for this task
- Centroid-only approach (without negative examples) has limited discrimination
- The model genuinely can't distinguish quality beyond "medium similar"

**Karpathy's point**: "You can't fix a broken signal with fancy sampling."

### 2. Need for Negative Training Data

Current approach only uses saved chunks (positive examples). This creates a centroid that represents "stuff user likes" but no anti-centroid for "stuff user dislikes."

**Recommendation**: 
```typescript
score = similarity_to_saved_centroid - similarity_to_skipped_centroid
```

This contrastive scoring will naturally spread the distribution.

### 3. Honest vs Artificial Distribution

**Don't**: Relabel 55% scores as "20% confidence" to hit distribution targets

**Do**: Show users real scores, let them calibrate expectations

If everything genuinely scores 60-70%, options are:
1. Fix the scoring (add negative signals, use contrastive learning)
2. Embrace it and use other signals (speaker, podcast, recency)
3. Show percentiles instead of raw scores

## Fixed Implementation (V2)

```typescript
function randomSample<T>(array: T[], n: number): T[] {
  if (array.length <= n) return [...array];
  
  // Fisher-Yates shuffle for true uniform random sampling
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

function filterRankedChunks(chunks: ScoredChunk[], ...): ScoredChunk[] {
  // ... setup code ...
  
  // Define buckets by actual score thresholds (not position)
  const buckets = {
    low: sorted.filter(c => c.relevanceScore < 0.5),
    mid: sorted.filter(c => c.relevanceScore >= 0.5 && c.relevanceScore < 0.65),
    high: sorted.filter(c => c.relevanceScore >= 0.65),
  };
  
  // Sample uniformly from each bucket
  const sampled = [
    ...randomSample(buckets.high, highCount),
    ...randomSample(buckets.mid, midCount),
    ...randomSample(buckets.low, lowCount),
  ];
  
  return sampled.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
```

**Why this is correct**:
1. ✅ Buckets based on actual score thresholds, not position
2. ✅ Handles non-uniform distributions properly
3. ✅ True uniform random sampling (Fisher-Yates)
4. ✅ Gracefully handles imbalanced buckets
5. ✅ More interpretable: "6 chunks scoring <50%" vs "bottom quintile"

## Production Readiness

**V1**: ❌ Not safe to ship (critical bugs)

**V2**: ✅ Safe to ship but limited range (40-70%)

**V3** (Current): ✅ Production ready:
1. Full distribution across 0-100% range
2. Stratified sampling shows both good and bad examples
3. Skipping low-confidence signals reinforces correct predictions
4. 5 bucket system (0-30%, 30-50%, 50-65%, 65-80%, 80-100%)
5. Weighted toward high scores but includes low scores for training

## Recommended Next Steps

### Short-term (this week)
1. ✅ Ship V2 implementation (done)
2. 📊 Monitor user behavior: skip rates by score band
3. 🔍 Investigate score clustering: Why 60-70%?
4. 📈 Visualize embedding space: Run PCA on saved vs random chunks

### Medium-term (next sprint)
1. Track skipped chunks as negative training data
2. Implement contrastive scoring: `sim(saved) - sim(skipped)`
3. A/B test: stratified vs top-K, measure save rates
4. Adjust bucket thresholds based on data

### Long-term (future)
1. Explore alternative similarity metrics
2. Consider percentile-based display for users
3. Add explicit "exploration mode" for random sampling
4. Multi-armed bandit approach for bucket selection

## Key Takeaways

1. **Position-based methods fail on non-uniform distributions** - Always use score-based thresholds
2. **Implement true random sampling** - Don't rely on probabilistic shortcuts
3. **Test your assumptions** - Quintiles don't equal confidence levels
4. **Fix the signal before the presentation** - Score clustering is the real problem
5. **Be honest with users** - Don't fake confidence you don't have

## References

- Implementation: `src/inngest/functions/daily-intelligence-pipeline.ts:593`
- Results doc: `docs/stratified-sampling-results.md`
- Validation context: `docs/context/signal-validation.llm.txt`
