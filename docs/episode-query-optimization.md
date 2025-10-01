# Episode Query Performance Optimization

## Problem
The `episodes.get` tRPC endpoint was taking **615ms** in Neon (serverless Postgres) due to over-fetching data that wasn't being used.

### Original Query
```ts
const episodeData = await ctx.db.query.episode.findFirst({
  where: and(eq(episode.id, input.episodeId)),
  with: {
    podcast: true,
    transcriptChunks: true,  // ❌ Loading 100-500+ chunks with 1536-dim embeddings
    speakerMapping: true,
  },
});
```

### Issues Identified
1. **Loading unused data**: `transcriptChunks` were loaded but never used on the episode detail page
2. **Heavy embeddings**: Each chunk contains a 1536-dimension vector (embeddings), transferred over the network
3. **Lateral join overhead**: Drizzle was using lateral joins to fetch related data, adding query complexity

### Analysis
Looking at `/src/app/(app)/episode/[id]/page.tsx`:
- The page never accesses `episode.data.transcriptChunks`
- Transcript is fetched separately via `fetchTranscript(transcriptUrl)` (line 208-219)
- Only `speakerMapping.speakerMappings` is used (line 699-701)

## Solution

### Optimized Query
```ts
const episodeData = await ctx.db.query.episode.findFirst({
  where: and(eq(episode.id, input.episodeId)),
  with: {
    podcast: true,
    // Only load speakerMapping - transcriptChunks are not used on the episode page
    // (transcript is fetched separately via transcriptUrl)
    speakerMapping: {
      columns: {
        speakerMappings: true,
        confidence: true,
      },
    },
  },
});
```

### Changes Made
1. ✅ Removed `transcriptChunks` from the query (not used)
2. ✅ Selected only needed columns from `speakerMapping` (`speakerMappings`, `confidence`)
3. ✅ Added comment explaining why transcriptChunks are excluded

## Expected Impact
- **Before**: ~615ms (loading all chunks with embeddings)
- **After**: ~80-150ms (70-80% reduction)

## Notes for Future
- If transcript chunks are needed in the future, create a separate paginated endpoint
- Never load embeddings unless absolutely necessary for the use case
- Always exclude embeddings using `columns: { embedding: false }` when fetching chunks for display

## Verified
- ✅ TypeScript compilation passes
- ✅ Only one usage of `episodes.get` endpoint (episode detail page)
- ✅ No breaking changes (page doesn't use the removed data)
