# Process Episode/Document UX Improvement Plan

## Overview

Improve the UX for processing episodes and documents by providing clear, context-aware buttons for different user workflows.

## User Workflows

### Workflow 1: Full Processing (Confident User)
**User clicks header "Process Episode" button**
- Fetches transcript/content
- Generates AI summary
- Chunks content
- Identifies speakers (episodes only)
- Generates embeddings
- **Generates up to 30 personalized signals**
- **Use case:** User wants everything done in one go

### Workflow 2: Summary-First (Cautious User)
**User clicks "Summarize Episode" in Summary tab empty state**
- Fetches transcript/content
- Generates AI summary
- Chunks content
- Identifies speakers (episodes only)
- Generates embeddings
- **Does NOT generate signals**
- **Use case:** User wants to preview/triage via summary first

**Then user goes to Signals tab and clicks "Generate Signals"**
- Generates signals from already-processed content
- **Use case:** User liked the summary and wants signals

### Workflow 3: Skip Episode (Triage User)
**User clicks "Summarize Episode" in Summary tab empty state**
- Processes and generates summary
- User reads summary
- **User skips episode** - doesn't generate signals
- **Use case:** Summary wasn't interesting enough

---

## Button Layout

### Header Buttons (when NOT processed)
- **ONE button only:** "Process Episode" → Calls new `processEpisodeWithSignals` mutation
- Dialog explains: "This will fully process the episode including signal generation"
- Duration: 3-6 minutes

### Summary Tab Empty State
- **Button:** "Summarize Episode" → Calls existing `processEpisode` mutation (NO signals)
- Description: "Summarize this episode to get key takeaways. Perfect for quick triage."
- Hint: "Want full processing with signals? Use the 'Process Episode' button at the top."
- Duration: 2.5-5 minutes

### Signals Tab Empty State

**When NOT processed (`!isProcessed`):**
- **Empty state message:** "Process this episode first"
- No button (directs user to header)

**When processed but no signals (`isProcessed && !hasSignalsGenerated`):**
- **Button:** "Generate Signals" → Calls existing `generateSignals` mutation
- Description: "Episode is processed and ready! Generate up to 30 insights."
- Duration: 30-60 seconds

---

## Backend Implementation

### 1. New Inngest Function: `dailyIntelligenceProcessEpisodeWithSignals`

**File:** `src/inngest/functions/daily-intelligence-pipeline.ts`

**Event:** `app/daily-intelligence.episode.process-with-signals`

**Steps:**
1. Load episode
2. Ensure transcript
3. Generate summary (if not exists)
4. Chunk transcript
5. Identify speakers
6. Generate embeddings
7. Mark as processed
8. **Generate signals** (NEW - calls `generateUserSignals`)
9. Mark signals as generated

**Key Features:**
- All steps in ONE atomic function
- If signal generation fails, whole process fails
- Clean error handling
- Proper logging for each step

### 2. New Inngest Function: `processArticleWithSignals`

**File:** `src/inngest/functions/article-processing.ts`

**Event:** `article/process-with-signals.requested`

**Steps:**
1. Extract article content
2. Generate summary
3. Chunk content
4. Generate embeddings
5. Mark as processed
6. **Generate signals** (NEW - calls `generateArticleSignals`)
7. Mark signals as generated

### 3. New tRPC Mutations

**File:** `src/server/trpc/routers/episodes.ts`

**Mutation:** `processEpisodeWithSignals`
- Rate limited (same as `processEpisode`)
- Checks if already fully processed (status=processed + signalsGeneratedAt exists)
- Returns early if processing in progress (< 1 hour)
- Sends event to new Inngest function
- Returns `{ status: "queued", pipelineRunId }`

**File:** `src/server/trpc/routers/articles.ts`

**Mutation:** `processArticleWithSignals`
- Similar pattern to episodes
- Sends to `article/process-with-signals.requested` event

### 4. Keep Existing Functions

**DO NOT MODIFY:**
- `processEpisode` / `processArticle` - Used for summary-only workflow
- `generateSignals` - Used when user wants signals after summary
- All regenerate functions

---

## Frontend Implementation

### 1. Episode Page: Header Button

**File:** `src/app/(app)/episode/[id]/page.tsx`

**Location:** Lines 683-754

**Changes:**
1. Add new mutation hook:
```typescript
const processEpisodeWithSignals = useMutation(
  trpc.episodes.processEpisodeWithSignals.mutationOptions({
    onSuccess: () => {
      toast.success("Episode processing started with signal generation");
      // Invalidate queries...
    },
    onError: (error) => {
      toast.error(`Failed to process episode: ${error.message}`);
    },
  }),
);
```

2. Update dialog content:
   - Title: "Process Episode"
   - Add bullet: "Generate up to 30 personalized signals"
   - Duration: "3-6 minutes"
   - Tip: "If you only want a summary preview, use the 'Summarize Episode' button in the Summary tab."

3. Update button onClick:
```typescript
onClick={() => processEpisodeWithSignals.mutate({ episodeId: params.id })}
```

### 2. Episode Page: Summary Tab Empty State

**File:** `src/app/(app)/episode/[id]/page.tsx`

**Location:** Lines 1218-1272

**Changes:**
1. Replace with `Empty` component
2. Icon: `SparklesIcon`
3. Title: "Quick Overview Summary"
4. Description: "Summarize this episode to get key takeaways, examples, lessons, and quotes. Perfect for quick triage."
5. Button: "Summarize Episode" → Calls `processEpisode.mutate()`
6. Add hint text: "Want full processing with signals? Use the 'Process Episode' button at the top."

### 3. Episode Page: Signals Tab Empty State

**File:** `src/app/(app)/episode/[id]/page.tsx`

**Location:** Lines 1417-1426

**Changes:**
Replace current text-based empty state with:

```tsx
{signalFilter === "pending" && episodeStats.data?.total === 0 ? (
  isProcessed ? (
    // Processed, can generate signals
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={SparklesIcon} size={20} />
        </EmptyMedia>
        <EmptyTitle>Generate Personalized Signals</EmptyTitle>
        <EmptyDescription>
          Episode is processed and ready! Generate up to 30 insights ranked by your preferences.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          size="lg"
          onClick={() => generateSignals.mutate({ episodeId: params.id })}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
              Generating Signals...
            </>
          ) : (
            <>
              <HugeiconsIcon icon={SparklesIcon} size={16} />
              Generate Signals
            </>
          )}
        </Button>
      </EmptyContent>
    </Empty>
  ) : (
    // Not processed yet
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={SparklesIcon} size={20} />
        </EmptyMedia>
        <EmptyTitle>No Signals Yet</EmptyTitle>
        <EmptyDescription>
          Process this episode to get signals. Use the "Process Episode" button at the top.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
) : (
  // Keep existing messages for other filter states
  <div className="rounded-xl border border-border/50 bg-muted/30 p-6 text-base text-muted-foreground">
    {signalFilter === "pending"
      ? "No pending signals. All signals have been processed."
      : signalFilter === "actioned"
        ? "No processed signals yet. Start reviewing signals to see them here."
        : "No signals found for this episode."}
  </div>
)}
```

### 4. Article Page: Same Pattern

**File:** `src/app/(app)/post/[id]/page.tsx`

Apply identical changes:
- Add `processArticleWithSignals` mutation
- Update header button to call new mutation
- Update Summary tab empty state with "Summarize Article" button
- Update Signals tab empty state with proper `Empty` component

### 5. Update Active Operation Banner

**Both pages:**

When `isProcessing` or `isGenerating`, update the banner text:
- Processing: "Fetching content, generating summary, and preparing embeddings..."
- Processing with signals: "Fully processing episode including signal generation..."

---

## Benefits

1. **✅ Clear User Intent:** Each button clearly communicates what it does
2. **✅ Progressive Disclosure:** Users can preview via summary before committing to signals
3. **✅ Efficient for Power Users:** One-click full processing option
4. **✅ Better Triage:** Users can quickly summarize and skip uninteresting content
5. **✅ Scalable Backend:** Atomic Inngest functions with proper error handling
6. **✅ No Race Conditions:** Signal generation happens as part of processing pipeline
7. **✅ Clean Architecture:** Reuses existing functions for other workflows

---

## Testing Checklist

### Backend
- [ ] `processEpisodeWithSignals` mutation creates proper Inngest event
- [ ] `dailyIntelligenceProcessEpisodeWithSignals` function completes all steps
- [ ] Signal generation happens after processing is marked complete
- [ ] Error handling works (processing fails = signals don't generate)
- [ ] `signalsGeneratedAt` timestamp is set correctly
- [ ] Same for articles

### Frontend
- [ ] Header "Process Episode" button calls new mutation
- [ ] Summary tab "Summarize Episode" button calls existing `processEpisode`
- [ ] Signals tab shows correct empty state based on `isProcessed`
- [ ] Signals tab "Generate Signals" button works when processed
- [ ] Loading states work correctly
- [ ] Toast notifications show appropriate messages
- [ ] All three user workflows work end-to-end

### Edge Cases
- [ ] Handle case where processing succeeds but signal generation fails
- [ ] Handle case where user clicks "Process Episode" while already processing
- [ ] Handle case where summary exists but no signals
- [ ] Rate limiting works correctly
- [ ] Regenerate buttons still work as before

---

## Files to Modify

### Backend
1. `src/inngest/functions/daily-intelligence-pipeline.ts` - Add new function
2. `src/inngest/functions/article-processing.ts` - Add new function
3. `src/inngest/functions/index.ts` - Export new functions
4. `src/server/trpc/routers/episodes.ts` - Add new mutation
5. `src/server/trpc/routers/articles.ts` - Add new mutation

### Frontend
6. `src/app/(app)/episode/[id]/page.tsx` - Update buttons and empty states
7. `src/app/(app)/post/[id]/page.tsx` - Update buttons and empty states

---

## Rollout Plan

1. **Phase 1:** Backend changes (Inngest functions + tRPC mutations)
2. **Phase 2:** Frontend changes (buttons and empty states)
3. **Phase 3:** Testing with existing episodes/articles
4. **Phase 4:** Monitor Inngest dashboard for new function execution
5. **Phase 5:** Gather user feedback on new UX

---

## Success Metrics

- Reduced confusion about processing vs signal generation
- Increased usage of summary-first workflow
- Fewer failed signal generations
- Better completion rates for full processing
- Cleaner Inngest execution logs
