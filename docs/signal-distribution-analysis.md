# Signal Distribution Analysis: Does Our System Match Expectations?

**Date**: 2025-10-01  
**User**: 50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G (Usman)  
**Analyst**: Andrej Karpathy (simulated)

---

## Executive Summary

**Critical Finding**: The system is NOT behaving as expected. We're artificially restricting the score distribution by only showing "top 30" signals, which creates a narrow 60-80% band instead of the expected broad distribution.

**Root Cause**: Line 607 in `daily-intelligence-pipeline.ts` - we sort by score and take `.slice(0, 30)`, guaranteeing clustered scores.

**Impact**: User sees no low-confidence signals, can't provide negative training data, and the model can't learn what to avoid.

---

## Usman's Expectations vs Current Reality

### Expected Distribution (Usman's Mental Model)
For a random 30-chunk episode entering the system:
- **20% low** (0-40%): "23% confidence chunks" that he should skip
- **60% middle** (40-70%): Uncertain, could go either way
- **20% high** (70-100%): Strong matches to save

**Purpose**: Training signal from skipping low scores reinforces "the model got it right"

### Current Reality (User 50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G)
```
📊 Pending Signals Distribution (50 signals):
   60-70%:  39 signals (78%)
   70-80%:  11 signals (22%)
   Nothing below 60%
   Nothing above 80%
```

**Embedding Baseline Metrics**:
- Saved → Centroid: **71.7%** avg
- Random → Centroid: **44.1%** avg
- Separation: **62.5%** higher (good!)
- Pairwise saved similarity: **48.3%** (diverse interests)

---

## The Problem: Top-K Filtering Creates Artificial Clustering

### Current Pipeline Logic (lines 593-607 of daily-intelligence-pipeline.ts)

```typescript
function filterRankedChunks(
  chunks: ScoredChunk[],
  preferences: UserPreferenceRecord,
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  console.log(`Filtering chunks. User has ${preferences.totalSaved} saves`);

  // Simple approach: always return top 30 regardless of confidence
  // Let the user's save/skip actions be the filter, not algorithmic thresholds
  return sorted.slice(0, PIPELINE_SETTINGS.maxDailySignals);  // ← THE CULPRIT
}
```

### What This Does

1. **Scores all candidate chunks** (could be 200+ chunks from 2 days of podcasts)
2. **Sorts by relevanceScore descending**
3. **Takes top 30 only**

### Why This Breaks Usman's Expectations

**Example Scenario**: New episode with 30 chunks enters pipeline

**What should happen** (Usman's expectation):
- Score all 30 chunks against centroid
- Natural distribution: some high (0.8+), some medium (0.5-0.7), some low (0.2-0.4)
- Show ALL 30 to user with varied confidence
- User skipping 23% chunk = "good, model was right to score it low"

**What actually happens**:
- Score all 30 chunks against centroid  
- Sort them: [0.72, 0.71, 0.69, 0.68, ..., 0.35, 0.28, 0.23]
- Take top 30: [0.72, 0.71, 0.69, 0.68, ..., 0.65, 0.63]
- **Discard the bottom scores entirely** (0.35, 0.28, 0.23)
- User only sees 60-80% range, never sees the 23% chunks!

---

## Why Nothing Scores Below 60%

### The Math

With these metrics:
- Random → Centroid: **44.1%**
- Saved → Centroid: **71.7%**

We should absolutely see chunks in the 40-60% range in the candidate pool.

**But we don't show them** because:

1. If there are 200 candidate chunks from 2 days of podcasts
2. And we take top 30 only
3. Then we're taking the **top 15%** of candidates
4. The 85th percentile of scores will be much higher than the median

**Simple test**: If random baseline is 44%, and we're taking top 15%, we'd expect our cutoff around 60-65%, which matches what we see!

---

## The Deeper Issue: Misalignment of Philosophy

### Comment in Code (Line 605-606)
```typescript
// Simple approach: always return top 30 regardless of confidence
// Let the user's save/skip actions be the filter, not algorithmic thresholds
```

This philosophy is **half-right**:
- ✅ YES: Don't use hard thresholds to filter out "bad" content
- ❌ NO: You still need to show diverse scores for training signal

### What "User Actions as Filter" Actually Means

**Correct interpretation**: 
- Don't assume scores below 0.7 are "bad" and hide them
- Show the full distribution
- Let user teach you what's actually good/bad

**Current interpretation** (buggy):
- Only show top-scored items
- User never sees what the model thinks is low quality
- No negative training signal

---

## Diagnosis: Is the Scoring Itself Broken?

### Short Answer: NO

The cosine similarity scoring is working correctly:

```typescript
// Line 580-589
const similarity = cosineSimilarity(chunk.embedding, centroid);
const relevanceScore = Math.max(0, similarity); // Clamp to ensure non-negative
return {
  ...chunk,
  relevanceScore,
};
```

**Evidence it works**:
1. Saved chunks average **71.7%** similarity to centroid
2. Random chunks average **44.1%** similarity to centroid  
3. **62.5% separation** is good (>20% threshold)
4. Pairwise diversity at **48.3%** suggests centroid is meaningful despite broad interests

### The Real Issue

**The scoring creates the RIGHT distribution**. We just **throw away** the bottom 85% before showing it to users.

---

## What the Distribution SHOULD Look Like

Given the metrics, here's what we should expect for a mature user (17 saves):

### Candidate Pool (all chunks scored, before filtering)
```
0-20%:   ██████ (30 chunks) - Very different from user interests
20-40%:  ████████████ (60 chunks) - Somewhat different  
40-60%:  ████████████████ (80 chunks) - Uncertain middle
60-80%:  ████████████ (60 chunks) - Good matches
80-100%: ██████ (30 chunks) - Strong matches
```

This would be a **normal distribution centered around random baseline** (44%), with a **right tail** toward saved baseline (71.7%).

### What User Should See (better sampling strategy)
Instead of top 30, sample to maintain distribution shape:
```
0-20%:   ██ (3 signals, 10%)
20-40%:  ████ (6 signals, 20%)  
40-60%:  ██████████ (12 signals, 40%)
60-80%:  ██████ (6 signals, 20%)
80-100%: ██ (3 signals, 10%)
```

This maintains **exploration vs exploitation** and provides **training signal across the full range**.

---

## Recommended Fix: Stratified Sampling Instead of Top-K

### Proposed Algorithm

Replace `filterRankedChunks()` with stratified sampling:

```typescript
function filterRankedChunks(
  chunks: ScoredChunk[],
  preferences: UserPreferenceRecord,
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const maxSignals = PIPELINE_SETTINGS.maxDailySignals; // 30

  // For users with <10 saves, keep pure random (already handled in scoring)
  if (preferences.totalSaved < 10) {
    return chunks.slice(0, maxSignals);
  }

  // For mature users: stratified sampling
  // Distribution: 10% low, 20% med-low, 40% medium, 20% med-high, 10% high
  const stratify = [
    { min: 0.0, max: 0.3, count: 3 },   // Low confidence (exploration)
    { min: 0.3, max: 0.5, count: 6 },   // Medium-low
    { min: 0.5, max: 0.7, count: 12 },  // Medium (bulk)
    { min: 0.7, max: 0.85, count: 6 },  // Medium-high
    { min: 0.85, max: 1.0, count: 3 },  // High confidence
  ];

  const selected: ScoredChunk[] = [];

  for (const stratum of stratify) {
    const candidates = chunks.filter(
      c => c.relevanceScore >= stratum.min && c.relevanceScore < stratum.max
    );
    
    if (candidates.length === 0) continue;

    // Sort within stratum and take top N (or all if fewer)
    candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
    selected.push(...candidates.slice(0, stratum.count));
  }

  // If we didn't hit 30, backfill with top remaining scores
  if (selected.length < maxSignals) {
    const selectedIds = new Set(selected.map(s => s.id));
    const remaining = chunks
      .filter(c => !selectedIds.has(c.id))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    selected.push(...remaining.slice(0, maxSignals - selected.length));
  }

  // Sort by episode timestamp for display (not by score)
  return selected.sort((a, b) => 
    new Date(b.episodePublishedAt || 0).getTime() - 
    new Date(a.episodePublishedAt || 0).getTime()
  );
}
```

### Why This Works

1. **Maintains exploration**: Always shows some low-confidence signals
2. **Provides negative training**: User skipping 23% chunk confirms model is right
3. **Avoids filter bubbles**: Doesn't trap user in narrow band
4. **Preserves quality**: Still biases toward higher scores (40% in medium range)
5. **Handles edge cases**: Backfills if strata are empty

---

## Alternative: Simple Percentile-Based Sampling

If stratified sampling is too complex, simpler approach:

```typescript
function filterRankedChunks(
  chunks: ScoredChunk[],
  preferences: UserPreferenceRecord,
): ScoredChunk[] {
  if (chunks.length === 0) return [];
  if (preferences.totalSaved < 10) {
    return chunks.slice(0, PIPELINE_SETTINGS.maxDailySignals);
  }

  const sorted = [...chunks].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const n = sorted.length;
  const maxSignals = PIPELINE_SETTINGS.maxDailySignals;

  // Sample across percentiles: 
  // Take every (n / maxSignals)th item to maintain distribution shape
  const step = Math.max(1, Math.floor(n / maxSignals));
  const sampled: ScoredChunk[] = [];
  
  for (let i = 0; i < n && sampled.length < maxSignals; i += step) {
    sampled.push(sorted[i]);
  }

  return sampled;
}
```

This is simpler but less controlled - you get whatever distribution exists in candidates.

---

## Testing the Fix

### Before Fix
Run: `pnpm tsx scripts/check-pending-signals.ts 50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G`

Expected:
```
60-70%:  78%
70-80%:  22%
Nothing else
```

### After Fix
Same command should show:
```
0-30%:   ~10-15%
30-50%:  ~15-20%
50-70%:  ~35-45%
70-85%:  ~15-20%
85-100%: ~5-10%
```

### Validation Checklist

- [ ] Score distribution spans full range (0-100%)
- [ ] Low-confidence signals appear in feed (20-40% range)
- [ ] High-confidence signals still present (80%+ range)
- [ ] User sees ~30 signals total per day
- [ ] Saved → Centroid avg still >20% higher than Random → Centroid
- [ ] User can skip low-confidence items and it feels "right"

---

## Answers to Original Questions

### 1. Does our current distribution match Usman's expectations?

**NO.** He expects 20/60/20 (low/mid/high). We show 0/100/0 (nothing low, everything clustered mid-high).

### 2. Why is nothing scoring below 60%?

**Top-K filtering.** We take top 30 from ~200 candidates (top 15%), which naturally excludes the bottom 85% including all low scores.

### 3. Is the 60-80% clustering actually correct given the metrics?

**YES, but misleading.** The *scoring* is correct. The *filtering* creates artificial clustering by only showing the top segment.

### 4. What should the "ideal" distribution look like?

**Stratified sampling** to maintain the natural score distribution:
- 10% in 0-30% range (explicit negative examples)
- 20% in 30-50% range  
- 40% in 50-70% range (bulk of uncertain content)
- 20% in 70-85% range
- 10% in 85-100% range (high confidence)

This balances **exploitation** (showing good stuff) with **exploration** (learning boundaries).

### 5. Is cosine similarity alone sufficient?

**For now, YES.** The problem isn't the similarity metric - it's the sampling strategy.

**Future consideration**: Once we have skip data, we could:
- Add uncertainty estimates (distance from centroid ≠ confidence)
- Multi-armed bandit for exploration/exploitation
- But don't do this until basic distribution is fixed!

---

## Action Items

### High Priority (Do Now)
1. **Implement stratified sampling** in `filterRankedChunks()` (see code above)
2. **Test with Usman's account** to verify distribution spreads out
3. **Monitor save rates** - should stay similar or improve (less wasted time on borderline 65% items)

### Medium Priority (Next Sprint)  
4. **Add score distribution to UI** - show user their pending signals histogram
5. **Track skip patterns** - do low-scored skips happen faster? (validation)
6. **A/B test** distribution shapes (20/60/20 vs 10/40/40/10 vs uniform)

### Low Priority (Future)
7. **Confidence intervals** around centroid similarity
8. **Active learning** - explicitly request labels on uncertain items
9. **Multi-objective ranking** - diversity, recency, score

---

## Philosophical Note: First Principles Thinking

The comment in the code was trying to do the right thing:
> "Let user actions be the filter, not algorithmic thresholds"

But we made a **subtle logical error**:

**Wrong**: "Don't use thresholds" → "Only show high scores"  
**Right**: "Don't use thresholds" → "Show full distribution, let user decide"

This is a classic case where **good intentions** (avoid filter bubbles) led to **bad implementation** (created a different filter bubble).

**The fix is simple**: Show diverse scores, track what users actually do, learn from the full signal.

---

## Conclusion

Usman's intuition was correct. The system should show him 23% confidence chunks so he can skip them and reinforce "yes, that was bad."

Current implementation artificially narrows the distribution by taking top-K, which prevents negative training signal and creates a misleading user experience.

**Fix**: Replace top-K filtering with stratified sampling to preserve natural score distribution.

**Expected outcome**: Users see varied confidence levels, can provide both positive and negative feedback, model learns faster.

**Risk**: Very low. Worst case, users skip more low-confidence items - but that's *valuable training data* we're currently missing.

---

**Next steps**: Implement stratified sampling, deploy, measure impact on save rates and user engagement.
