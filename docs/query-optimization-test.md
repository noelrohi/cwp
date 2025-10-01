# Testing the Episode Query Optimization

## Manual Testing Steps

### 1. Before Testing
Record the current performance in Neon dashboard:
- Navigate to Neon console → Query History
- Find the episode query (search for `episode_id = $3`)
- Note the execution time (should be ~615ms before optimization)

### 2. Test the Optimized Query
1. Start the dev server: `pnpm dev`
2. Navigate to any episode page: `/episode/[id]`
3. Open Network tab in DevTools
4. Look for the tRPC request to `episodes.get`
5. Check the response payload size (should be much smaller now)

### 3. Verify Functionality
Ensure the following still works on the episode detail page:
- ✅ Episode metadata displays correctly
- ✅ Podcast information shows up
- ✅ Speaker names appear (from speakerMapping)
- ✅ "View Transcript" button works (separate fetch)
- ✅ Signals load and display properly
- ✅ Process/Reprocess buttons work

### 4. Check Neon Performance
After optimization:
- Go back to Neon → Query History
- Find the same episode query
- Execution time should now be **~80-150ms** (70-80% improvement)

## Expected Results

### Response Size Comparison
- **Before**: ~500KB - 2MB (with all chunks and embeddings)
- **After**: ~5-20KB (episode + podcast + speakerMapping only)

### Query Time Comparison
- **Before**: ~615ms
- **After**: ~80-150ms

### SQL Query Changes
The optimized query should no longer have the large lateral join for `transcript_chunk`:
```sql
-- Should NOT see this anymore:
left join lateral (
  select coalesce(json_agg(...), '[]'::json) as "data" 
  from "transcript_chunk" 
  where "episode_id" = "episode"."id"
) "episode_transcriptChunks"
```

## Monitoring
- Watch for any errors in production logs
- Monitor response times in Neon dashboard
- Check if users report any missing data on episode pages

## Rollback Plan
If issues arise, revert the change in `src/server/trpc/routers/episodes.ts`:
```ts
// Rollback: restore transcriptChunks if needed
with: {
  podcast: true,
  transcriptChunks: true,  // re-add this line
  speakerMapping: true,
}
```
