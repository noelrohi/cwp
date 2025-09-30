# Debug Panel

## Overview

The Debug Panel (`/debug`) provides real-time visibility into the signal scoring algorithm and model training progress. Only accessible to admin users.

## Features

### 1. Overview Tab
- **Total Signals**: Count of all signals generated
- **Save Rate**: Percentage of presented signals that were saved
- **Learning Phase**: Current training phase (Random Exploration vs Embedding Learning)
- **Training Data**: Number of saved chunks with embeddings
- **Regenerate Signals**: Manual trigger to regenerate signals immediately

### 2. Score Distribution Tab
Shows histogram of confidence scores across all pending signals:
- **Expected Behavior**:
  - **Phase 1 (< 10 saves)**: Random distribution
    - ~20% Low (< 30%)
    - ~60% Medium (30-70%)
    - ~20% High (> 70%)
  - **Phase 2 (≥ 10 saves)**: Embedding-based learning
    - Initially bell-curved around 50%
    - Gradually shifts toward extremes as system learns
    - After 100+ saves: More signals at extremes (< 30% or > 70%)

### 3. Training Data Tab
- **Recent Saved Signals**: Last 10 chunks saved by user (positive training examples)
- **Recent Skipped Signals**: Last 10 chunks skipped by user (negative feedback)
- Shows the actual content and confidence scores

## Two-Phase Algorithm

### Phase 1: Random Exploration (< 10 saves)
```typescript
relevanceScore = Math.random() // 0.0 - 1.0
```
- **Purpose**: Avoid cold-start bias
- **User Action**: Save what you like, skip what you don't
- **System Learning**: Builds training dataset

### Phase 2: Embedding Learning (≥ 10 saves)
```typescript
1. Fetch embeddings of all saved chunks
2. Calculate centroid (average embedding vector)
3. Score each chunk by cosine similarity to centroid
4. relevanceScore = (similarity + 1) / 2 // Normalize to 0-1
```
- **Purpose**: Personalize based on semantic similarity
- **User Action**: Continue saving/skipping to refine centroid
- **System Learning**: Centroid updates with each save/skip

## Monitoring Score Distribution

### Healthy Distribution (Phase 1)
```
0-10%:    ██ (2-5 signals)
10-20%:   ███ (3-7 signals)
20-30%:   ████ (4-8 signals)
30-40%:   █████ (5-9 signals)
40-50%:   ██████ (6-10 signals)
50-60%:   ██████ (6-10 signals)
60-70%:   █████ (5-9 signals)
70-80%:   ████ (4-8 signals)
80-90%:   ███ (3-7 signals)
90-100%:  ██ (2-5 signals)
```

### Unhealthy Distribution (Bug)
```
0-10%:    (0 signals)
10-20%:   (0 signals)
20-30%:   (0 signals)
...
80-90%:   (0 signals)
90-100%:  ██████████████ (ALL 30 signals)  ⚠️ Problem!
```

## Debugging Workflows

### Issue: All scores at 90%
1. Check **Overview Tab** → Learning Phase
2. If Phase 2, check **Training Data** → Saved chunks with embeddings
3. If 0 embeddings, check database:
   ```sql
   SELECT COUNT(*) 
   FROM transcript_chunk 
   WHERE embedding IS NOT NULL;
   ```
4. If embeddings exist, check `scoreChunksForRelevance()` function

### Issue: System not learning
1. Check **Overview Tab** → Training Data count
2. Verify saves/skips are updating `user_preferences.total_saved`
3. Check Inngest logs for `signal/actioned` events
4. Verify `updateUserPreferences` function is running

### Issue: Wrong distribution shape
1. Check **Score Distribution Tab**
2. Compare against expected distribution for current phase
3. Use **Training Data Tab** to see actual saved content
4. Check if saved chunks are semantically similar (should have similar confidence scores)

## Triggering Regeneration

Click **Regenerate Signals** button to manually trigger the pipeline for your user:
1. Fetches latest episodes
2. Generates new chunks with embeddings
3. Scores chunks using current algorithm
4. Stores top 30 as daily signals

**Note**: This only regenerates for the current user, not all users.

## API Endpoints

All endpoints are in `/src/server/trpc/routers/signals.ts`:

- `debug`: Get training phase, total saves/skips, embeddings count
- `scoreDistribution`: Get histogram of confidence scores
- `recentSamples`: Get last 10 saved and skipped signals
- `regenerateForUser`: Manually trigger signal generation

## Related Files

- `/src/inngest/functions/daily-intelligence-pipeline.ts` - Scoring algorithm
- `/src/inngest/functions/continuous-learning.ts` - Handles save/skip actions
- `/src/server/trpc/routers/signals.ts` - Debug API endpoints
- `/src/app/(app)/debug/page.tsx` - Debug panel UI