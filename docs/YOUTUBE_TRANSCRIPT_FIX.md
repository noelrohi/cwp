# YouTube Transcript Word Splitting Fix

## Problem Summary

Episode `oBqNMRt9fzIfjnVD2vW7M` ("Harvard Dropout: Hard Work Is Dead!") failed signal generation with error:
```
Episode must be processed with embeddings before generating signals
```

## Root Cause

The YouTube transcript fetcher (`src/server/lib/youtube-transcript.ts`) was treating entire **sentence-level segments** as single "words":

### Before Fix:
```typescript
const word = {
  word: segment.text,  // ← segment.text = "Today's guest built a $120 million company..."
  start: startSec,
  end: endSec,
};
```

This resulted in:
- **1,181 "words"** (actually phrases/sentences)
- Each "word" contained **10-50 actual words**
- Chunks had 4,773 to 11,780 actual words each
- Embedding API failed: **"maximum context length is 8192 tokens, however you requested 13720 tokens"**

### Why It Happened:
1. YouTube provides transcripts as **sentence-level segments**, not word-level
2. We were passing each segment as a single "word" object
3. Chunking algorithm counted "words" (phrases), not actual words
4. `currentCount` reached only 1,181, never hitting the 800-word limit
5. Chunks grew to 11,000+ actual words
6. Embedding model rejected them (token limit exceeded)

## The Fix

### 1. Fixed YouTube Transcript Fetcher
**File**: `src/server/lib/youtube-transcript.ts:106-126`

Split each YouTube segment into individual words:
```typescript
// Split segment text into individual words
const words = segment.text.trim().split(/\s+/);
const durationPerWord = words.length > 0 ? (endSec - startSec) / words.length : 0;

// Create individual word objects for proper chunking
const wordObjects = words.map((wordText, wordIdx) => ({
  word: wordText,  // ← Now a single word like "Today's"
  start: startSec + (wordIdx * durationPerWord),
  end: startSec + ((wordIdx + 1) * durationPerWord),
  confidence: 1.0,
  punctuated_word: wordText,
  speaker: 0,
}));

// Add all word objects to utterance
currentUtterance.words!.push(...wordObjects);
```

### 2. Fixed Chunking Hard Limit
**File**: `src/server/lib/transcript-processing.ts:570-573`

Changed from `maxTokens * 1.1` to `maxTokens` with forced keep:
```typescript
} else if (currentCount >= maxTokens) {
  // Hard limit at maxTokens - MUST break to prevent embedding failures
  shouldBreak = true;
  forceKeep = true;  // NEW: Always keep chunk even without perfect ending
}
```

### 3. Re-fetched Broken Transcripts
**Script**: `scripts/refetch-youtube-transcript.ts`

Created script to:
- Re-fetch transcript from YouTube with fixed word splitting
- Upload new transcript to Vercel Blob
- Update episode record with new transcript URL

## Results

### Before Fix:
- 3 chunks
- Word counts: 4,773 to 11,780 words per chunk
- Embedding generation: ❌ Failed
- Signal generation: ❌ Blocked

### After Fix:
- 44 chunks  
- Word counts: 195 to 727 words per chunk
- Embedding generation: ✅ Success (3 seconds)
- Signal generation: ✅ Ready

## Impact on Existing Episodes

All YouTube-sourced episodes processed before this fix may have:
- ❌ Broken chunks (too large)
- ❌ Missing embeddings
- ❌ Unable to generate signals

### How to Fix Affected Episodes:

1. **Identify affected episodes:**
```sql
SELECT id, title 
FROM episode 
WHERE transcript_source = 'youtube'
AND status = 'processed'
AND signals_generated_at IS NULL;
```

2. **Re-fetch and reprocess:**
```bash
# For each affected episode, run:
pnpm tsx scripts/refetch-youtube-transcript.ts
pnpm tsx scripts/fix-chunks-and-embeddings.ts
```

Or trigger reprocessing from the UI using the "Reprocess Episode" button.

## Prevention

The fix ensures:
- ✅ YouTube transcripts are properly word-split
- ✅ Chunks never exceed 800 words (hard limit enforced)
- ✅ All chunks fit within embedding model token limits (8,192 tokens)
- ✅ Future YouTube episodes will process correctly

## Files Changed
- `src/server/lib/youtube-transcript.ts` - Fixed word splitting
- `src/server/lib/transcript-processing.ts` - Fixed hard limit enforcement
- `scripts/refetch-youtube-transcript.ts` - Created re-fetch script
- `scripts/fix-chunks-and-embeddings.ts` - Created repair script
- `scripts/debug-episode-embeddings.ts` - Created diagnostic script
- `scripts/debug-transcript-structure.ts` - Created analysis script
