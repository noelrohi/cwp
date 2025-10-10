# Separate Episode Processing from Signal Generation

## Priority
**HIGH** - User control issue causing signal overwhelm

## Problem
Currently, when you click "Process Episode", it automatically generates 30 signals per episode. Usman says:
> "The auto signal generation shouldn't fire off automatically because it creates too many signals (467 unprocessed) that no human can reasonably review."

While episodes aren't processed automatically via cron, the **signal generation step happens automatically** after processing. If you process 467 episodes, you get **~14,000 signals** with no way to control it.

## Current State
**Process Episode flow:**
1. User clicks "Process Episode" (manual)
2. Pipeline: Fetch transcript → Chunk → Embed → **Auto-generate 30 signals** (automatic)
3. User has no control over signal generation

**Code location:**
`/src/inngest/functions/daily-intelligence-pipeline.ts` lines 283-289:
```typescript
await step.sendEvent("signal-generation", [{
  name: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT,
  data: { pipelineRunId, userId, episodeId }
}]);
```

This fires automatically after episode processing completes.

## Acceptance Criteria
- [ ] "Process Episode" only processes transcript (no signal generation)
- [ ] Separate "Generate Signals" button appears after processing
- [ ] User decides when to generate signals
- [ ] "Generate Signals" shows preview: "This will create ~30 signals"
- [ ] Batch operation: "Generate signals for selected episodes"
- [ ] Episode status shows: "Ready for signal generation" vs "Signals generated"

## Implementation Options

### Option 1: Two-Step Process (Recommended)
Separate processing from signal generation entirely.

**Step 1: Process Episode (Prepare)**
- Fetch transcript
- Chunk content
- Generate embeddings
- Mark as `processed` (ready for signals)

**Step 2: Generate Signals (On Demand)**
- User clicks "Generate Signals"
- Creates up to 30 signals
- Mark as `signals-generated`

### Option 2: Opt-In Flag
Add checkbox: "Generate signals after processing" (default: off)

### Option 3: Limit Control
Keep auto-generation but let user control count:
- Slider: "Generate 0-30 signals"
- Default: 0 (no auto-generation)

## Recommended Approach: Option 1 (Two-Step)

### 1. Modify Episode Processing Pipeline
**File:** `/src/inngest/functions/daily-intelligence-pipeline.ts`

**Current (lines 283-295):**
```typescript
await step.sendEvent("signal-generation", [{
  name: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT,
  data: { pipelineRunId, userId, episodeId }
}]);

logger.info(`Episode processed and signal generation dispatched`);
```

**New:**
```typescript
// REMOVE automatic signal generation
// Signal generation is now manual via "Generate Signals" button

logger.info(
  `Episode ${episodeId} processed and ready for signal generation ` +
  `(user must manually trigger via "Generate Signals" button)`
);

return { status: "ready-for-signals" } as const;
```

### 2. Update Episode Schema
**File:** `/src/server/db/schema/podcast.ts`

Add new status value:
```typescript
export const episode = pgTable('episode', {
  // ... existing fields
  status: text('status')
    .notNull()
    .default('pending')
    .$type<'pending' | 'processing' | 'processed' | 'signals-generated' | 'failed'>(),
});
```

Or use separate flag:
```typescript
export const episode = pgTable('episode', {
  // ... existing fields
  signalsGenerated: boolean('signals_generated').default(false),
  signalCount: integer('signal_count').default(0),
});
```

### 3. Add "Generate Signals" Button to UI
**File:** `/src/app/(app)/episode/[id]/page.tsx`

**Current logic:**
- If not processed → "Process Episode" button
- If processed → "Regenerate Signals" button

**New logic:**
```tsx
{/* After processing, show generate signals button */}
{isProcessed && !signalsGenerated && (
  <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
    <DialogTrigger asChild>
      <Button variant="default" size="sm">
        <HugeiconsIcon icon={SparklesIcon} size={16} />
        Generate Signals
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generate Signals for This Episode</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This will analyze the episode transcript and create up to 30 
          personalized signals based on your preferences.
        </p>
        
        {/* Optional: Signal count slider */}
        <div>
          <Label>Number of signals to generate</Label>
          <Slider 
            value={[signalCount]} 
            onValueChange={([v]) => setSignalCount(v)}
            min={5}
            max={30}
            step={5}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {signalCount} signals (recommended: 15-30)
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
            Cancel
          </Button>
          <Button onClick={() => generateSignals.mutate({ episodeId })}>
            Generate {signalCount} Signals
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
)}

{/* If signals already generated, show regenerate */}
{isProcessed && signalsGenerated && (
  <Button variant="outline" size="sm" onClick={/* ... */}>
    <HugeiconsIcon icon={SparklesIcon} size={16} />
    Regenerate Signals
  </Button>
)}
```

### 4. Create tRPC Endpoint for Signal Generation
**File:** `/src/server/trpc/routers/episodes.ts`

Add new endpoint (separate from regenerate):
```typescript
generateSignals: protectedProcedure
  .input(
    z.object({
      episodeId: z.string(),
      maxSignals: z.number().min(5).max(30).default(30),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Verify episode is processed
    const ep = await db.query.episode.findFirst({
      where: eq(episode.id, input.episodeId)
    });

    if (!ep) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Episode not found',
      });
    }

    if (ep.status !== 'processed') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Episode must be processed before generating signals',
      });
    }

    // Trigger signal generation with custom count
    await inngest.send({
      name: 'app/daily-intelligence.user.generate-signals',
      data: {
        pipelineRunId: randomUUID(),
        userId: ctx.user.id,
        episodeId: input.episodeId,
        maxSignals: input.maxSignals, // Pass custom count
      },
    });

    return { success: true };
  })
```

### 5. Update Signal Generation Function
**File:** `/src/inngest/functions/daily-intelligence-pipeline.ts`

Make `maxSignals` configurable:
```typescript
export const dailyIntelligenceGenerateSignals = inngest.createFunction(
  { id: 'daily-intelligence-generate-signals' },
  { event: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT },
  async ({ event, step, logger }) => {
    const { 
      pipelineRunId, 
      userId, 
      episodeId,
      maxSignals = 30 // Default to 30, but allow override
    } = event.data;

    const result = await step.run('generate-user-signals', async () => {
      const diagnostics = await generateUserSignals(
        userId, 
        episodeId, 
        true,
        maxSignals // Pass through
      );
      
      // ... rest of existing code
    });
  }
);
```

## Migration Strategy

### Phase 1: Immediate Fix (This PR)
1. Remove auto signal generation from episode processing
2. Add "Generate Signals" button to UI
3. Update episode status to track signal generation
4. Deploy

### Phase 2: Enhanced Controls (Future)
1. Batch signal generation ("Generate for 10 selected episodes")
2. Signal count slider (5-30 signals)
3. Preview: "This will create ~X signals based on your preferences"
4. Smart defaults based on episode length

## User Experience Flow

### Before (Current - Overwhelming):
1. User: "I want to process this episode"
2. Clicks "Process Episode"
3. **System auto-generates 30 signals** ← No control!
4. User has 467 episodes × 30 signals = 14,010 signals ← Overwhelming!

### After (User Control):
1. User: "Let me process this episode first"
2. Clicks "Process Episode" → Only prepares transcript
3. User sees: "Episode ready. Generate signals?" 
4. User decides: "Not right now, I'll do it later"
5. Later: User selects 5 best episodes → "Generate signals for selected"
6. Result: 5 episodes × 30 signals = 150 signals ← Manageable!

## Files to Modify
- `/src/inngest/functions/daily-intelligence-pipeline.ts` - Remove auto signal generation
- `/src/server/db/schema/podcast.ts` - Add `signalsGenerated` flag
- `/src/server/trpc/routers/episodes.ts` - Add `generateSignals` endpoint
- `/src/app/(app)/episode/[id]/page.tsx` - Add "Generate Signals" button
- `/src/app/(app)/dashboard/page.tsx` - Add batch signal generation (future)

## Testing
- [ ] Process episode → Verify NO signals created
- [ ] Click "Generate Signals" → Verify signals created
- [ ] Process 10 episodes → Verify can control which ones get signals
- [ ] Check episode status correctly reflects signal generation state
- [ ] Verify regenerate still works

## Success Metrics
- User can process 467 episodes without overwhelming signals
- Average pending signals per user drops from 467 to <50
- User satisfaction: "I can control my signal queue now"

## Notes from Usman
> "The auto signal generation shouldn't fire off automatically because it creates too many signals (467 unprocessed) that no human can reasonably review."

The key insight: Users want to **process transcripts** (prepare for search/reference) separately from **generating signals** (daily review queue). Not every processed episode needs signals.

## Alternative: "View Summary" First
Combine with Task #2 (View Summary):
1. Process episode (transcript only)
2. View summary → Decide if worth generating signals
3. If yes → Generate signals
4. If no → Skip, but transcript is searchable

This gives users a triage mechanism before committing to 30 signals per episode.
