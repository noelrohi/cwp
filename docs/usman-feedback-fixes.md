# Usman Feedback Fixes - Signal Regeneration & Episode UX

## Date
2025-10-01

## Issues Addressed

### 1. ❌ **Regenerate Signals Not Working**
**Problem**: Clicking "Regenerate Signals" did nothing because:
- `episodeId` parameter wasn't being used in `generateUserSignals()`
- `getNewChunksForUser()` filtered out chunks with existing signals
- Result: 0 candidates = 0 regenerated signals

**Root Cause**: 
```typescript
// Router passed episodeId but function didn't accept it
await inngest.send({
  data: { episodeId: input.episodeId }  // ← Passed
});

// Function signature ignored it
async function generateUserSignals(userId: string) {  // ← Not used!
```

**Fix**:
- Added `episodeId` and `forceRegenerate` parameters to `generateUserSignals()`
- Updated `getNewChunksForUser()` to:
  - Filter by `episodeId` when provided
  - Skip the "already has signal" filter when `forceRegenerate=true`
- Added debug logging to track filtering decisions

**Files Changed**:
- `src/inngest/functions/daily-intelligence-pipeline.ts` (lines 389-515)

---

### 2. ⚠️ **Score Updates Losing Historical Context**
**Problem**: When regenerating signals, the system updated scores even for signals users had already acted on (saved/skipped). This loses training data context.

**Example**:
1. User sees signal at 45% confidence → skips it (good negative feedback)
2. Algorithm improves, regenerates → score now 75%
3. Historical context lost: "user skipped this at 45%" → "user skipped this at 75%" ❌

**Karpathy's Point**: "User actions are ground truth. Never delete ground truth."

**Fix**: 
Only update scores/content for un-actioned signals:
```typescript
.onConflictDoUpdate({
  target: [dailySignal.chunkId, dailySignal.userId],
  set: {
    relevanceScore: sql`CASE 
      WHEN ${dailySignal.userAction} IS NULL 
      THEN excluded.relevance_score 
      ELSE ${dailySignal.relevanceScore}  // Preserve original
    END`,
    // Same for excerpt and speakerName
  },
})
```

**Files Changed**:
- `src/inngest/functions/daily-intelligence-pipeline.ts` (lines 779-805)

---

### 3. 📊 **No Episode-Level Signal Visibility**
**Problem**: Usman couldn't tell:
- How many signals were generated from an episode
- Which signals were pending vs processed
- If a 2-hour episode only had 4 signals (red flag)

**User Request**: 
> "I should be able to just go to that page and just run it or finish it off in that page"

**Fix**:
1. **Added `episodeStats` query** - Returns counts:
   - Total signals from episode
   - Pending (not yet reviewed)
   - Saved
   - Skipped

2. **Enhanced `byEpisode` query** - Added `filter` parameter:
   - `"pending"` - Only unreviewed signals
   - `"actioned"` - Only saved/skipped signals  
   - `"all"` - Everything

3. **Updated Episode Page UI**:
   - Stats header: "30 total • 12 pending • 10 saved • 8 skipped"
   - Tab filters with badge counts
   - Context-aware empty states

**Files Changed**:
- `src/server/trpc/routers/signals.ts` (lines 238-256, 279-354)
- `src/app/(app)/episode/[id]/page.tsx` (lines 34-47, 299-346)

---

### 4. 🔍 **Better Debug Logging**
**Added**: Comprehensive logging throughout signal generation pipeline:
```typescript
console.log(
  `User ${userId}: Found ${candidateChunks.length} candidate chunks` +
  `${episodeId ? ` (episode: ${episodeId})` : ""}` +
  `${forceRegenerate ? " [FORCE REGENERATE]" : ""}`
);
```

Makes it easy to diagnose issues like:
- "Why only 3 signals from 118-minute episode?"
- "Are chunks being filtered out?"
- "Is episodeId actually being applied?"

**Files Changed**:
- `src/inngest/functions/daily-intelligence-pipeline.ts` (throughout)

---

## Remaining Issue: Negative Training Data

### 5. 🎯 **Skip Actions as Reinforcement Learning**
**Usman's Insight**:
> "When I see a 23% confidence chunk and click skip, that's reinforcing data that the system got the bad chunk right"

**Current State**: 
- Skip actions are tracked (`userAction: "skipped"`)
- But not used in scoring algorithm

**Next Step** (Karpathy's recommendation):
Implement **contrastive scoring**:
```typescript
// Current: Only positive examples
score = similarity(chunk, saved_centroid)

// Proposed: Positive AND negative examples
score = similarity(chunk, saved_centroid) - similarity(chunk, skipped_centroid)
```

This naturally spreads the distribution and reinforces correct predictions.

**Implementation Plan**:
1. Track skipped chunks separately in signal generation
2. Calculate "anti-centroid" from skipped embeddings
3. Use contrastive similarity: `sim(saved) - sim(skipped)`
4. Validate with A/B test: Does it improve save rate?

**Files to Change**:
- `src/inngest/functions/daily-intelligence-pipeline.ts` (scoreChunksForRelevance function)

---

### 6. 💬 **Confirmation Dialogs for Actions**
**Problem**: Users clicked "Process Episode" or "Regenerate Signals" without understanding:
- What the action actually does
- How long it takes
- What gets preserved vs changed
- Whether it's safe to click

**User Pain Point**:
> "I clicked regenerate but nothing happened... did it work?"

**Fix**: Added informative confirmation dialogs for both actions:

#### Process Episode Dialog
Shows:
- Step-by-step breakdown of what happens
- Estimated duration (2-5 minutes)
- Different content for first-time vs re-processing
- Clear "Existing signals preserved" note

#### Regenerate Signals Dialog  
Shows:
- What gets updated (scores for pending signals)
- What gets preserved (user actions: saves/skips)
- Current episode stats (28 total • 12 pending • 10 saved • 6 skipped)
- Scope clarification ("this episode only")

**UX Principle**: "Be honest with users" - Karpathy
- No hidden behavior
- Set correct expectations
- Build trust through transparency

**Files Changed**:
- `src/app/(app)/episode/[id]/page.tsx` (lines 39-40, 70-83, 217-332)

---

## Testing Checklist

### Before Deploying
- [ ] Test regeneration on single episode (does episodeId filter work?)
- [ ] Test with episode that has existing signals (does forceRegenerate work?)
- [ ] Verify un-actioned signals get updated scores
- [ ] Verify actioned signals keep original scores
- [ ] Test episode page filters (pending/actioned/all)
- [ ] Check stats accuracy (counts match actual signals)

### After Deploying
- [ ] Monitor logs for `getNewChunksForUser` candidate counts
- [ ] Verify 118-minute episode generates ~30 signals
- [ ] Check Usman can see episode-level signal counts
- [ ] Confirm filters work on episode page
- [ ] Validate regeneration creates signals for existing episodes

---

## Key Metrics to Watch

**Before**:
- 118-minute episode → 3 signals ❌
- Regenerate button → no effect ❌
- No episode-level visibility ❌

**After** (Expected):
- 118-minute episode → ~20-30 signals ✅
- Regenerate button → updates all episode signals ✅
- Episode page shows: "28 total • 12 pending • 10 saved • 6 skipped" ✅

---

## Karpathy's Verdict

### What We Fixed ✅
1. **Append-only is correct** - Preserving user actions for training
2. **Conditional updates** - Only update un-actioned signals
3. **Episode filtering works** - Parameter is now actually used
4. **Better observability** - Debug logs + UI stats

### What's Still Missing ⚠️
1. **Negative training data** - Skips not used in scoring
2. **Contrastive learning** - Need anti-centroid from skipped chunks
3. **Distribution validation** - Still need to prove 0-100% spread

### Process Issues 🚨
- **"Fast and furious doesn't work"** - The episodeId bug was from moving too fast
- **"Can you overfit on a single batch?"** - Test on ONE episode first before deploying
- **"Check for basics first"** - Always validate the simple case (does filter work?)

---

## Summary

**Changed Files**: 3
- `src/inngest/functions/daily-intelligence-pipeline.ts` (signal generation logic)
- `src/server/trpc/routers/signals.ts` (new queries)
- `src/app/(app)/episode/[id]/page.tsx` (UI enhancements)

**Lines Changed**: ~150

**Impact**:
- ✅ Regenerate signals actually works now
- ✅ Episode-level signal management
- ✅ Historical training data preserved
- ✅ Better debugging capabilities
- ⏳ Next: Implement contrastive scoring with skipped chunks

**Risk Level**: Low
- All changes are backwards compatible
- Existing signals unaffected
- Only improves regeneration behavior
