# Regenerate Signals Fix - Dead Code Bug

## Issue Identified by Karpathy Review

### The Bug
The `storeDailySignals` function had dead code that prevented existing pending signals from being updated during regeneration.

**Problem Flow:**
1. Lines 1039-1050: Query for existing signals
2. Lines 1052-1055: Filter OUT all chunks with existing signals, early return if none left
3. Lines 1096-1121: `onConflictDoUpdate` with logic to update pending signals
4. **Bug**: Step 3 never executes because step 2 filtered out all existing signals!

### What This Caused
When clicking "Regenerate Signals":
- ✅ Would re-score all chunks
- ✅ Would add NEW signals from previously unselected chunks
- ❌ Would NEVER update existing pending signal scores
- ❌ The `onConflictDoUpdate` was unreachable dead code

### UI vs Reality Mismatch
Original UI said: "Update relevance scores for pending signals"
Reality: Pending signals were never updated, keeping old scores forever

## The Fix

### Backend Change (`src/inngest/functions/daily-intelligence-pipeline.ts`)

**Removed the premature filter** (lines 1039-1055):
```typescript
// ❌ BEFORE: Filter out existing signals, preventing updates
const existingSignals = await db.select(...)
const existingIds = new Set(existingSignals.map(...))
const newChunks = chunks.filter((chunk) => !existingIds.has(chunk.id))
if (newChunks.length === 0) return;  // Early return!

// ✅ AFTER: Let UPSERT handle all chunks
// No filter - pass ALL chunks to the insert statement
const signals = chunks.map((chunk) => { ... })
```

**Now the UPSERT logic actually runs:**
- For new chunks → INSERT new signal
- For existing chunks with `userAction = NULL` (pending) → UPDATE scores
- For existing chunks with `userAction = 'saved'/'skipped'` → Preserve unchanged
- Database UNIQUE constraint prevents duplicates: `unique().on(table.chunkId, table.userId)`

### Frontend Change (`src/app/(app)/episode/[id]/page.tsx`)

**Made the dialog clearer about what happens:**

```tsx
✅ Preserved: Your saved and skipped signals won't be changed
⚠️ Updated: Pending signals will be re-scored with your latest preferences  
➕ Added: New signals may be added from previously unselected chunks
```

Color-coded for quick scanning:
- Green = safe/preserved
- Amber = will change
- Blue = may add

## Behavior After Fix

When you click "Regenerate Signals" on an episode with 200 chunks and 46 existing signals:

1. **Re-scores all 200 chunks** with latest user preferences
2. **Applies stratified sampling** → selects top 30 chunks (0-100% distribution)
3. **Uses UPSERT** to:
   - Update pending signals if they're in the top 30
   - Add new signals from chunks that weren't previously signals
   - Preserve saved/skipped signals exactly as they were
4. **No duplicates** thanks to database UNIQUE constraint

## Why This Matters

**Training Signal Integrity:**
- User changes preferences (saves/skips different content)
- Their embedding centroid shifts
- Regenerate re-scores pending signals with the NEW centroid
- User sees updated relevance scores reflecting their evolved preferences
- System learns from the delta between old and new scores

**Without this fix:**
- Pending signals frozen at old scores forever
- User changes preferences but sees no impact on existing signals
- Only new episodes would reflect preference changes
- Slower/broken feedback loop for the ML system

## Karpathy's Take

> "The implementation had the right idea with onConflictDoUpdate, but the premature optimization of filtering out existing signals made that code unreachable. Classic case of 'defensive coding' that actually broke the feature. The database already handles duplicates via UNIQUE constraint - trust it and let UPSERT do its job."

## Testing Checklist

- [ ] Episode with 46 pending signals → regenerate → verify scores change
- [ ] Episode with saved signals → regenerate → verify saved scores DON'T change
- [ ] Episode with skipped signals → regenerate → verify skipped scores DON'T change
- [ ] Episode with no existing signals → regenerate → verify new signals added
- [ ] Check that no duplicate signals are created (chunkId + userId unique)
- [ ] Verify stratified sampling still produces 0-100% distribution
