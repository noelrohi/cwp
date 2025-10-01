# Episode Reprocessing Feature

## Summary

Added full episode reprocessing capability with destructive data cleanup, separate from the non-destructive signal regeneration feature.

## The Problem

The UI claimed "re-run processing" would re-fetch transcripts, re-chunk, and re-identify speakers, but the backend just regenerated signals using existing chunks. This was misleading and the two operations (full reprocess vs. signal regeneration) did the same thing.

## The Solution

### Two Distinct Operations

1. **Regenerate Signals** (Non-destructive)
   - Button: `Regenerate Signals` (outline variant)
   - Re-scores existing chunks
   - Updates relevance scores
   - Preserves all user saves/skips
   - Fast operation (~30 seconds)

2. **Reprocess Episode** (Destructive)
   - Button: `Reprocess Episode` (destructive/red variant)
   - Deletes all chunks, signals, speaker mappings
   - Re-fetches transcript from audio
   - Re-chunks with current settings
   - Re-identifies speakers
   - Generates new embeddings
   - Creates new signals
   - **Deletes user saves from this episode**
   - Slower operation (3-7 minutes)

## Implementation

### Backend Changes

#### 1. New tRPC Mutation: `reprocessEpisode`
**File:** `src/server/trpc/routers/episodes.ts`

```typescript
reprocessEpisode: protectedProcedure
  .input(z.object({ episodeId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Rate limiting
    // Validate episode ownership
    // Set status to processing
    // Dispatch reprocess event
    await inngest.send({
      name: "app/daily-intelligence.episode.reprocess",
      data: { pipelineRunId, userId, episodeId }
    });
  })
```

#### 2. New Inngest Function: `dailyIntelligenceReprocessEpisode`
**File:** `src/inngest/functions/daily-intelligence-pipeline.ts`

Key steps:
1. **Delete existing data** (cascade deletes handle signals and saved_chunks)
   - Delete all transcript_chunk records
   - Delete episode_speaker_mapping
   
2. **Reset episode status** to pending, clear transcriptUrl

3. **Re-fetch transcript** with `force: true`

4. **Re-chunk** using current CHUNK_SETTINGS

5. **Re-identify speakers** using AI

6. **Generate embeddings**

7. **Dispatch signal generation**

### Frontend Changes

**File:** `src/app/(app)/episode/[id]/page.tsx`

1. Split the single "Process/Re-run" button into two separate buttons for processed episodes:
   - "Process Episode" - only shown for unprocessed episodes
   - "Regenerate Signals" - safe, non-destructive (outline)
   - "Reprocess Episode" - destructive, red button with warning

2. Updated dialogs with accurate descriptions:
   - Reprocess dialog has red warning styling
   - Shows count of saves that will be lost
   - Clear use cases (transcript errors, speaker ID failed, etc.)

## Database Schema

Cascade deletes are already configured in the schema:

```typescript
// transcript_chunk
episodeId: text("episode_id")
  .references(() => episode.id, { onDelete: "cascade" })

// daily_signal
chunkId: text("chunk_id")
  .references(() => transcriptChunk.id, { onDelete: "cascade" })

// saved_chunk  
chunkId: text("chunk_id")
  .references(() => transcriptChunk.id, { onDelete: "cascade" })
```

When chunks are deleted, signals and saved_chunks cascade automatically.

## User Experience

### Before Reprocessing
User sees processed episode with saved signals.

### After Clicking "Reprocess Episode"
1. Red warning dialog appears
2. Shows what will be deleted (e.g., "⚠️ You will lose 5 saved signals from this episode")
3. Lists use cases for reprocessing
4. Requires explicit "Delete and Reprocess" confirmation

### During Reprocessing
- Episode status: "processing"
- All existing chunks/signals gone
- Takes 3-7 minutes

### After Reprocessing
- Fresh transcript chunks
- New speaker identification
- New embeddings
- New signals (may be different from before)
- User's saves from THIS episode are gone
- Saves from other episodes unaffected

## When to Use Each Operation

### Regenerate Signals
- Updated your preferences
- Want to see different signals from same content
- Preference algorithm improved
- Safe, reversible operation

### Reprocess Episode
- Transcript had quality issues
- Speaker identification failed or was wrong
- Chunking logic has been updated in codebase
- Audio source improved/changed
- Destructive, loses episode-specific saves

## Rate Limiting

Both operations use rate limiting:
- `signal-regenerate:${userId}` - for regenerate signals
- `episode-reprocess:${userId}` - for full reprocessing
- Same limit as `RATE_LIMITS.EPISODE_PROCESSING`

## Testing Checklist

- [ ] Reprocess deletes chunks
- [ ] Reprocess deletes signals (via cascade)
- [ ] Reprocess deletes saved_chunks (via cascade)
- [ ] Reprocess deletes speaker mappings
- [ ] Reprocess re-fetches transcript
- [ ] Reprocess re-chunks content
- [ ] Reprocess re-identifies speakers
- [ ] Reprocess generates new embeddings
- [ ] Regenerate signals keeps chunks
- [ ] Regenerate signals updates scores
- [ ] Regenerate signals preserves saves
- [ ] UI shows correct warnings
- [ ] Toast messages are accurate
- [ ] Rate limiting works

## Future Improvements

1. **Batch reprocessing** - reprocess multiple episodes
2. **Partial reprocessing** - e.g., just re-identify speakers without re-chunking
3. **Reprocess history** - track when episodes were reprocessed
4. **Migration tool** - try to migrate saves to new chunks via embedding similarity
5. **Preview mode** - show what would change before committing
