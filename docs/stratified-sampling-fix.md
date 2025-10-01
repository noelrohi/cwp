# Stratified Sampling Fix - Signal Distribution

## Problem

**Issue**: UI only showed high-scoring signals (50-60% range), missing low-confidence signals completely.

**Root Cause**: Top-N selection in `daily-intelligence-pipeline.ts` line 624:
```typescript
const selected = sorted.slice(0, targetCount); // Only top 30 by score
```

This meant when scoring 285 chunks ranging from 9% to 82%, only the top 30 (all clustered in 50-60%) were shown.

## Why This Matters

Per Usman's insight:
> "When I see a 23% confidence chunk and click skip as well, **that's a reinforcing thing** that the system got the bad chunk right."

**Training needs BOTH signals**:
- ✅ **Save high scores** → Confirms good predictions
- ✅ **Skip low scores** → Confirms bad predictions (equally important!)

The system learns from both saves AND skips. By only showing high scores, we lost half the training signal.

## Solution: Stratified Sampling

Updated `filterRankedChunks()` to distribute signals across confidence ranges:

```typescript
// Target distribution
const distribution = {
  veryLow: 0.10,   // 10% - Show clearly bad examples (0-30%)
  low: 0.15,       // 15% - Low confidence (30-50%)
  mid: 0.25,       // 25% - System unsure (50-65%)
  high: 0.35,      // 35% - Likely good (65-80%)
  veryHigh: 0.15,  // 15% - Very confident (80-100%)
};
```

## Results

### Before (Top-N Only)
- 54 signals total
- All in 50-60% range
- Missing 9-40% range entirely
- **No low-confidence training data**

### After (Stratified Sampling)
- 84 signals total
- Distribution:
  - 0-30%: 9 signals (very low - clearly wrong)
  - 30-50%: 40 signals (low-medium)
  - 50-60%: 31 signals (medium)
  - 60-80%: 3 signals (high)
  - 80-100%: 1 signal (very high - very confident)

## Key Files Changed

**`src/inngest/functions/daily-intelligence-pipeline.ts`**
- Removed unused `_randomSample()` function
- Updated `filterRankedChunks()` (lines 604-643) with stratified sampling logic
- Removed old top-N selection

## How It Works

1. Score all candidate chunks (0.0 to 1.0)
2. Group into 5 buckets by score range
3. Sample from each bucket according to target distribution
4. Return mixed set with full range representation
5. User trains on both good AND bad examples

## Validation

```bash
# Check signal distribution
pnpm tsx scripts/check-pending-signals.ts <userId>

# Should show:
# - Spread across 0-100% range
# - More weight toward high scores
# - Some low scores for training
```

## Success Criteria

- ✅ Signals distributed across score ranges
- ✅ Low-confidence signals visible for skip training
- ✅ High-confidence signals prominent
- ✅ User can validate both good and bad predictions
