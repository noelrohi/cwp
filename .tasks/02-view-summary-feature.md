# View Summary Feature for Episodes

## Priority
**HIGH** - Major feature request from Usman

## Problem
Users have 467+ unprocessed episodes and no way to quickly decide which ones are worth processing. Need a "view summary" button that shows:
- Quick overview of each episode
- Key takeaways, examples, and lessons in bite-sized form
- Available even for unprocessed episodes
- Helps users decide whether to process an episode or not

## Current State
- No summary generation exists
- Episodes require full processing before any content preview
- Users must process everything to see what's valuable
- No way to triage 467 pending episodes efficiently

## Acceptance Criteria
- [ ] "View Summary" button on episode cards (dashboard & podcast pages)
- [ ] Generate summary WITHOUT full processing (no chunking/signals)
- [ ] Summary shows: key takeaways, examples, lessons
- [ ] Works on unprocessed episodes (only needs transcript)
- [ ] Fast generation (<30 seconds per episode)
- [ ] Summary cached for future views
- [ ] Mobile-friendly summary display

## Implementation Steps

### 1. Add tRPC Endpoint
**File:** `/src/server/trpc/routers/episodes.ts`
```typescript
generateSummary: protectedProcedure
  .input(z.object({ episodeId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // 1. Get episode with transcript
    // 2. If no transcript, fetch it (don't chunk)
    // 3. Generate summary using AI
    // 4. Cache summary in episode table
    // 5. Return summary
  })
```

### 2. Update Episode Schema
**File:** `/src/server/db/schema/podcast.ts`
Add columns:
- `summaryGenerated` (boolean)
- `summary` (text) - JSON with { keyTakeaways, examples, lessons }
- `summaryGeneratedAt` (timestamp)

### 3. Create Summary Generation Logic
**File:** `/src/server/lib/episode-summary.ts`
```typescript
export async function generateEpisodeSummary(episode) {
  // Use Claude Opus 4.1 (per Usman's request)
  // Prompt: Extract key takeaways, practical examples, lessons
  // Format: Bite-sized bullet points
  // Return structured JSON
}
```

### 4. Add UI Components
**File:** `/src/app/(app)/episode/[id]/page.tsx`
- Add "View Summary" button next to "Process Episode"
- Create summary dialog/modal
- Show loading state during generation
- Display formatted summary (bullets, highlights)

**File:** `/src/app/(app)/dashboard/page.tsx`
- Add summary preview on episode cards
- "Quick view" icon/button
- Tooltip with summary preview

### 5. Prompt Engineering
Use high-quality prompt for summary generation:
```
Extract from this podcast transcript:

1. KEY TAKEAWAYS (3-5 bullet points)
   - Main insights or conclusions
   - Actionable advice
   
2. PRACTICAL EXAMPLES (2-3 bullet points)
   - Real-world examples mentioned
   - Case studies or stories
   
3. LESSONS LEARNED (2-3 bullet points)
   - What the audience should remember
   - Skills or knowledge gained

Be concise. Each point should be 1-2 sentences max.
Focus on what's most valuable for learning and retention.
```

## Model Configuration
- Use **Claude Opus 4.1** (NOT free models)
- Usman specifically requested better models for summaries
- Budget: ~2000 tokens per summary (reasonable cost)

## UI/UX Design
```
┌─────────────────────────────────────┐
│  Episode: "AI Safety with Yoshua"  │
│  ⚡ View Summary                    │
└─────────────────────────────────────┘

Dialog:
┌──────────────────────────────────────────┐
│  📝 Episode Summary                      │
│                                          │
│  🎯 KEY TAKEAWAYS                        │
│  • AI alignment requires mathematical    │
│    frameworks, not just heuristics       │
│  • Current models lack true reasoning    │
│  • Safety work must happen pre-AGI       │
│                                          │
│  💡 PRACTICAL EXAMPLES                   │
│  • Chess AI: Solved via search trees     │
│  • LLMs: Pattern matching ≠ reasoning    │
│                                          │
│  📚 LESSONS LEARNED                      │
│  • Don't anthropomorphize AI systems     │
│  • Verify reasoning, don't assume it     │
│                                          │
│  [Process Full Episode]  [Close]         │
└──────────────────────────────────────────┘
```

## Files to Modify
- `/src/server/db/schema/podcast.ts` - Add summary columns
- `/src/server/trpc/routers/episodes.ts` - Add generateSummary endpoint
- `/src/server/lib/episode-summary.ts` - NEW FILE - Summary logic
- `/src/app/(app)/episode/[id]/page.tsx` - Add View Summary button
- `/src/app/(app)/dashboard/page.tsx` - Add summary preview
- `/src/components/episode-summary-dialog.tsx` - NEW FILE - Summary modal

## Testing
- [x] Test with various episode lengths (30min, 2hr, 4hr)
- [x] Verify summary quality (are key points captured?)
- [x] Test on episodes with/without transcripts
- [x] Mobile responsiveness
- [x] Loading states and error handling

## Future Enhancements
- Regenerate summary if episode description updated
- User feedback on summary quality ("Was this helpful?")
- Summary includes timestamps for jumping to key moments
- Multi-language support

## Notes from Usman
> "I want to see a quick overview of each episode - key takeaways, examples, lessons in bite-sized form. This helps me decide whether to process it or not. Should be available even for unprocessed episodes."

This is THE feature that solves the 467 unprocessed episodes problem.
