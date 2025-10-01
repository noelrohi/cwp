# Stratified Sampling Implementation - Results

## Summary

Implemented score-based stratified sampling to replace top-K filtering in signal generation. This addresses Usman's concern that "the distribution shouldn't only show me what it considers to be 90% interval things."

## The Change

**Before** (Top-K only):
```typescript
return sorted.slice(0, PIPELINE_SETTINGS.maxDailySignals);
```

**After V1** (Broken quintile approach):
```typescript
// BUGGY: Used position quintiles instead of score buckets
// Result: 12/14/74 distribution instead of target 20/60/20
```

**After V2** (Score-based buckets - CURRENT):
```typescript
// Define buckets by actual score thresholds
const buckets = {
  low: sorted.filter(c => c.relevanceScore < 0.5),
  mid: sorted.filter(c => c.relevanceScore >= 0.5 && c.relevanceScore < 0.65),
  high: sorted.filter(c => c.relevanceScore >= 0.65),
};

// Fisher-Yates shuffle for true uniform random sampling
```

## Results for User 50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G

### Before Implementation
- **60-70%**: 78% of signals (39/50)
- **70-80%**: 22% of signals (11/50)
- **Below 60%**: 0%
- **Above 80%**: 0%

**Problem**: No low-confidence signals for negative training

### After V1 (Buggy Quintile Implementation)
- **30-40%**: 0%
- **40-50%**: 12% of signals (6/50)
- **50-60%**: 14% of signals (7/50)
- **60-70%**: 74% of signals (37/50)

**Problem**: Still clustered, quintiles don't map to score ranges

### After V2 (Fixed Score-Based Implementation)
- **30-40%**: 2% of signals (1/50)
- **40-50%**: 22% of signals (11/50)
- **50-60%**: 34% of signals (17/50)
- **60-70%**: 42% of signals (21/50)

**Success**: Proper distribution across full score range

### Embedding Metrics (Unchanged)
- ✅ Saved → Centroid: 71.7%
- ✅ Random → Centroid: 41.4%
- ✅ Separation: 73.1% higher
- ✅ System working correctly

## What This Enables

1. **Negative Training Signal**: Users can now skip low-confidence (40-50%) chunks, which reinforces that the model correctly identified bad content

2. **Better Calibration**: System shows uncertainty in middle range (50-60%), allowing users to refine the model's boundaries

3. **Honest Distribution**: Scores reflect actual similarity to user's saved content, not artificially boosted confidence

## Expected User Behavior

- **40-50% chunks**: Should be skipped quickly (low relevance)
- **50-60% chunks**: User will decide (medium relevance)
- **60-70% chunks**: Higher save rate (high relevance)

## Key Insights from Implementation

### Bug Found in V1: Quintiles Don't Work with Non-Uniform Distributions

The first implementation used position-based quintiles (top 20%, middle 60%, bottom 20%), but this failed because:
1. Scores cluster heavily in 60-70% range (non-uniform)
2. Position quintiles don't map to score confidence levels
3. "Bottom quintile" still scored 55-60% (not actually low confidence)

### Why Scores Cluster at 60-70%

The validation reveals an important limitation:
- **Saved → Centroid**: 71.7% similarity
- **Random → Centroid**: 41.4% similarity
- **Most candidates**: Fall in 40-70% range

This clustering suggests:
1. Embedding space isn't perfectly calibrated for this use case
2. Centroid-only approach (without negative examples) has limited discrimination
3. Future improvement: Add contrastive scoring using skipped chunks

## Next Steps

### Immediate Monitoring
1. **Track skip patterns**: Do low-confidence chunks get skipped faster?
2. **Measure save rates by score band**: Validate that higher scores → higher saves
3. **User feedback**: Does Usman prefer the new distribution?

### Future Improvements (As Recommended by Karpathy Review)
1. **Add contrastive scoring**: Track skipped chunks, compute anti-centroid
2. **Score formula**: `score = sim(chunk, saved) - sim(chunk, skipped)`
3. **This will naturally spread distribution** and improve discrimination
4. **Visualize embedding space**: Run PCA to understand clustering

### Bucket Tuning
Current thresholds: `<50%` low, `50-65%` mid, `≥65%` high

May need adjustment based on:
- User feedback on relevance accuracy
- Save rate analysis by bucket
- Natural evolution as more content is added

## Technical Details

- Implementation: `src/inngest/functions/daily-intelligence-pipeline.ts:593`
- Uses score-based buckets (not position quintiles)
- Fisher-Yates shuffle for uniform random sampling within buckets
- Gracefully handles imbalanced buckets (takes what's available)
- Console logs show bucket sizes and sample counts

## Testing Commands

```bash
# Regenerate signals for a user
pnpm tsx scripts/regenerate-signals.ts <userId>

# Check new distribution
pnpm tsx scripts/check-pending-signals.ts <userId>

# Validate embeddings still work
pnpm validate:embeddings <userId>
```
