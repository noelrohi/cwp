# Simplified Daily Intelligence Pipeline

A much simpler implementation following the exact sequence from `sequence.md`:

## Daily Intelligence Pipeline (2:00 AM)

**Simple 5-step sequence:**

1. **Get all users** - Find users who have podcasts
2. **Get user's podcast list** - For each user, get their subscribed podcasts  
3. **Process last 24 hours published episodes** - Find new episodes from their podcasts
4. **Process transcripts** - Generate transcripts and chunk them (400-800 words, speaker turns)
5. **Generate signals** - Score chunks, store top 30 for daily review at 8:00 AM

## Core Workflow

```
Review → Save/Skip → Model improves → Better signals tomorrow
```

## What This Pipeline Does

- **At 2:00 AM**: Processes new episodes and generates personalized signals
- **At 8:00 AM**: Users see their daily signals (up to 30 per day)
- **Continuous Learning**: Save/skip actions improve future recommendations
- **Background Optimization**: Weekly recomputation of user preferences

## Key Principles

- ✅ **Automated daily pipeline** - No manual intervention needed
- ✅ **Simple sequence** - Direct path from users to signals  
- ✅ **Consistent chunking** - Always 400-800 words with speaker turns
- ✅ **Background learning** - Model improves from user feedback
- ✅ **No complex configuration** - Settings are "set once, forget"

## Database Flow

```
Users → Podcasts → Episodes → Transcript Chunks → Daily Signals
```

This is a **signal finder**, not a transcript analysis tool. The focus is on finding relevant content for daily review, not deep transcript analysis.

## Configuration (Hidden)

```typescript
const CHUNK_SETTINGS = {
  minWords: 400,
  maxWords: 800, 
  useSpeakerTurns: true,
};

const PIPELINE_SETTINGS = {
  maxDailySignals: 30,
  minConfidenceScore: 0.7,
};
```

All complexity is hidden. Users just see their daily signals at 8:00 AM and choose to save or skip them.