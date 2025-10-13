# Article Processing with Inngest

## Overview

Article processing has been migrated from inline Next.js `after()` calls to Inngest background jobs for better reliability, observability, and retry logic.

## Architecture

### Flow Diagram

```
User Action (TRPC)
    ↓
Send Inngest Event
    ↓ (immediate response)
User sees "Processing..."
    ↓
Inngest Worker Picks Up Event
    ↓
Step 1: Extract Content (Jina AI)
    ↓
Step 2: Chunk Content
    ↓
Step 3: Generate Embeddings (OpenAI)
    ↓
Step 4: Mark as "Processed"
    ↓
User clicks "Generate Signals" (manual)
    ↓
Inngest signal generation job runs
    ↓
UI Polls & Auto-Refreshes
```

## Inngest Functions

### 1. `processArticle`
**Event**: `article/process.requested`

**Payload**:
```typescript
{
  articleId: string;
  userId: string;
  url: string;
}
```

**Steps**:
1. **Mark Processing**: Update article status to "processing"
2. **Extract Content**: Fetch from Jina AI, validate, update metadata
3. **Chunk & Embed**: Split into semantic chunks, generate embeddings
4. **Mark Processed**: Update status to "processed" (signals are generated manually from the UI)

**Error Handling**:
- Each step has try/catch
- Failures update article status to "failed" with error message
- Automatic retries (2 attempts)

---

### 2. `reprocessArticle`
**Event**: `article/reprocess.requested`

**Payload**:
```typescript
{
  articleId: string;
  userId: string;
  url: string;
}
```

**Steps**:
1. **Cleanup**: Delete all existing chunks and signals (in transaction)
2. **Invoke Process**: Calls `processArticle` function via `step.invoke()`

**Use Case**: User wants to completely reprocess article (e.g., Jina AI improved, settings changed)

---

### 3. `regenerateArticleSignals`
**Event**: `article/signals.regenerate`

**Payload**:
```typescript
{
  articleId: string;
  userId: string;
}
```

**Steps**:
1. **Verify Chunks**: Ensure article has been processed
2. **Regenerate**: Delete pending signals, regenerate based on current preferences

**Use Case**: User's preferences changed, want new signals without reprocessing content

---

## Manual Signal Generation

Signal generation now runs on-demand so users stay in control of when new insights arrive. Both articles and episodes share the same Inngest event with a richer payload for finer control.

### Event: `app/daily-intelligence.user.generate-signals`

```typescript
{
  pipelineRunId: string;
  userId: string;
  episodeId?: string; // Required for podcast episodes
  maxSignals?: number; // Defaults to 30 when omitted
  regenerate?: boolean; // Include previously scored chunks when true
}
```

- **Articles** trigger `article/signals.generate` from the UI. When that finishes, the Inngest job sets `signalsGeneratedAt` on the article.
- **Episodes** trigger `app/daily-intelligence.user.generate-signals`. The same event is used for both initial generation and regeneration by toggling the `regenerate` flag.
- The UI now shows status badges (Pending, Processing, Processed, Failed) and inline progress messages for processing, summary generation, and signal generation.
- The "Generate Signals" button only appears once processing is complete, ensuring the action does exactly what it says—no hidden reprocessing work.

### Episode Flow

1. `episodes.generateSignals` validates that the episode is processed and dispatches the Inngest event with `{ maxSignals, regenerate: false }`.
2. `episodes.regenerateSignals` reuses the same event but forces regeneration with `{ regenerate: true }`.
3. `app/daily-intelligence.user.generate-signals` calls the hybrid scoring pipeline with the `maxSignals` override and updates `signalsGeneratedAt` once finished.

### Article Flow

1. `articles.generateSignals` ensures the article is processed and sends `article/signals.generate`.
2. The Inngest handler validates chunks, scores them, stores signals, and stamps `signalsGeneratedAt`.
3. `articles.regenerateSignals` keeps using `article/signals.regenerate` to rescore existing chunks without reprocessing content.

## TRPC Endpoints

### `articles.process`
Creates a new article and triggers processing.

```typescript
trpc.articles.process.mutate({ url: "https://..." })
// Returns: { success: true, articleId: "..." }
```

**Flow**:
1. Check if article exists
2. Create article record (status: "pending")
3. Send `article/process.requested` event
4. Return immediately

---

### `articles.processArticle`
Processes an existing article.

```typescript
trpc.articles.processArticle.mutate({ articleId: "..." })
// Returns: { success: true, status: "processing" }
```

**Validations**:
- Article exists
- Not already processed
- Not currently processing

---

### `articles.reprocessArticle`
Reprocesses article from scratch.

```typescript
trpc.articles.reprocessArticle.mutate({ articleId: "..." })
// Returns: { success: true, status: "processing" }
```

**Warning**: Deletes all chunks and signals (including saved ones)

---

### `articles.regenerateSignals`
Regenerates signals without reprocessing.

```typescript
trpc.articles.regenerateSignals.mutate({ articleId: "..." })
// Returns: { success: true }
```

**Preserves**: Saved and skipped signals (only deletes pending)

---

## UI Polling

### Real-time Status Updates

The UI uses intelligent polling to track processing progress:

```typescript
// Lightweight status polling
const articleStatus = useQuery({
  ...trpc.articles.getStatus.queryOptions({ id: articleId }),
  refetchInterval: (query) => {
    const status = query.state.data?.status;
    return status === "processing" ? 2000 : false;
  },
  enabled: article.data?.status === "processing",
});
```

**Behavior**:
- Polls every **2 seconds** while `status === "processing"`
- Fetches only status fields (lightweight query)
- Stops automatically when processing completes
- Triggers full refetch + toast notification on completion

---

## Benefits of Inngest

### vs. `after()` (Previous Implementation)

| Feature | `after()` | Inngest |
|---------|-----------|---------|
| **Max Duration** | Serverless timeout (10-30s) | Unlimited |
| **Retries** | Manual | Automatic (2 retries) |
| **Observability** | Console logs | Full dashboard |
| **Step Isolation** | None | Each step atomic |
| **Progress Tracking** | None | Step-by-step visibility |
| **Error Handling** | Manual | Built-in |
| **Cost** | Serverless compute | Background worker |

### Performance

**Before (inline processing)**:
- User waits 5-10 seconds
- Serverless function stays alive
- Risk of timeout on large articles

**After (Inngest)**:
- User waits ~100ms (event send)
- Inngest worker handles processing
- No timeout risk
- Better cost efficiency

---

## Development

### Local Testing

1. Start Inngest Dev Server:
```bash
npx inngest-cli@latest dev
```

2. Start Next.js:
```bash
pnpm dev
```

3. Trigger an event:
```typescript
// In your code or dev tools
await inngest.send({
  name: "article/process.requested",
  data: {
    articleId: "test-123",
    userId: "user-456",
    url: "https://example.com/article"
  }
});
```

4. View execution in Inngest Dashboard: `http://localhost:8288`

---

### Monitoring Production

1. Go to Inngest Cloud Dashboard
2. View function runs, errors, retries
3. Replay failed events
4. View step-by-step execution timeline

---

## Error Scenarios

### 1. Jina AI Fails
- **Step**: Extract Content
- **Result**: Article status → "failed", error message saved
- **Recovery**: User can retry manually, or auto-retry after fix

### 2. OpenAI Embedding Fails
- **Step**: Chunk & Embed
- **Result**: Article status → "failed", chunks may be partially created
- **Recovery**: Reprocess to clean up and retry

### 3. Database Transaction Fails
- **Step**: Any
- **Result**: Transaction rolls back, consistent state maintained
- **Recovery**: Automatic retry (Inngest)

---

## Future Improvements

### Batch Processing
When user parses a feed with 30 new articles:
```typescript
// Current: User manually processes each
// Future: Batch event
await inngest.send({
  name: "article/batch.process",
  data: {
    articleIds: [...],
    userId: "..."
  }
});
```

### Progress Updates
Use Inngest's `step.sendEvent()` to send progress:
```typescript
await step.sendEvent("article-progress", {
  articleId,
  progress: 0.5,
  stage: "embedding"
});
```

UI subscribes to progress events for real-time % bar.

### Priority Queue
Priority processing for user-initiated vs. automated:
```typescript
await inngest.send({
  name: "article/process.requested",
  data: { ... },
  ts: Date.now() + (priority === "high" ? 0 : 60000) // Delay low-priority
});
```

---

## Troubleshooting

### Article Stuck in "Processing"

**Cause**: Inngest function failed and exhausted retries

**Solution**:
1. Check Inngest dashboard for error
2. Fix underlying issue (e.g., API key)
3. Manually trigger reprocess:
```typescript
trpc.articles.reprocessArticle.mutate({ articleId: "..." })
```

### Processing Takes Too Long

**Cause**: Large article (50+ chunks) or rate limiting

**Solution**:
- Check embedding generation logs
- Adjust `BATCH_SIZE` in `chunkArticleContent`
- Add more delay between batches if rate-limited

### Signals Not Appearing

**Cause**: Signal generation failed silently

**Solution**:
1. Check Inngest dashboard for "generate-signals" step
2. Verify user has `userPreferences` record
3. Check `transcriptChunk` has embeddings
4. Run regenerate signals:
```typescript
trpc.articles.regenerateSignals.mutate({ articleId: "..." })
```

---

## API Reference

### Event Schemas

```typescript
// article/process.requested
{
  name: "article/process.requested",
  data: {
    articleId: string,
    userId: string,
    url: string,
  }
}

// article/reprocess.requested
{
  name: "article/reprocess.requested",
  data: {
    articleId: string,
    userId: string,
    url: string,
  }
}

// article/signals.regenerate
{
  name: "article/signals.regenerate",
  data: {
    articleId: string,
    userId: string,
  }
}
```

### Database States

```typescript
type ArticleStatus = 
  | "pending"      // Created, not yet processed
  | "processing"   // Currently in Inngest pipeline
  | "processed"    // Successfully completed
  | "failed"       // Processing failed (see errorMessage)
```

---

## Checklist: Adding New Processing Step

1. Add step to Inngest function:
```typescript
const newStep = await step.run("step-name", async () => {
  // Your logic
  return { result: "..." };
});
```

2. Add error handling:
```typescript
try {
  // Step logic
} catch (error) {
  await db.update(article).set({ 
    status: "failed",
    errorMessage: error.message 
  });
  throw error; // Let Inngest handle retry
}
```

3. Update UI polling if needed
4. Test in Inngest dev dashboard
5. Deploy and monitor

---

## Summary

Article processing now uses Inngest for:
- ✅ **Reliability**: Automatic retries, step isolation
- ✅ **Observability**: Full execution visibility
- ✅ **Performance**: No serverless timeouts
- ✅ **Cost**: Efficient background processing
- ✅ **UX**: Instant response + real-time status updates

All article operations (process, reprocess, regenerate signals) are handled asynchronously with proper error handling and user feedback.
