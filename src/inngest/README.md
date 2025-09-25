# Daily Intelligence Pipeline

This directory contains the Inngest functions that implement the Daily Intelligence System as specified in `sequence.md`.

## Core Functions

### Daily Intelligence Pipeline (`dailyIntelligencePipeline`)
- **Schedule**: Every day at 2:00 AM
- **Purpose**: Processes new podcast episodes and generates personalized signals
- **Steps**:
  1. Fetch new episodes with `status: "pending"`
  2. Generate transcripts using Deepgram
  3. Chunk transcripts (400-800 words, speaker turns)
  4. Generate embeddings for all chunks
  5. Score and create daily signals for each user

### Episode Processing (`processEpisode`)
- **Trigger**: `episode/imported` event
- **Purpose**: Process individual episodes as they're imported
- **Use**: For real-time processing when users add new podcasts

### Continuous Learning Functions

#### User Preferences Update (`updateUserPreferences`)
- **Trigger**: `signal/actioned` event (when user saves/skips)
- **Purpose**: Update user's preference centroid based on feedback
- **Learning**: Uses weighted centroid updates with decreasing learning rate

#### Weekly Optimization (`weeklyPreferencesOptimization`)
- **Schedule**: Every Sunday at 3:00 AM
- **Purpose**: Recompute all user centroids from historical data
- **Benefits**: Corrects drift and ensures optimal personalization

#### Monthly Cleanup (`monthlyCleanup`)
- **Schedule**: 1st of every month at 4:00 AM
- **Purpose**: Delete old signals (90+ days) to keep database lean

## Configuration

All settings are defined in `config.ts` following the "set once, forget" principle from `sequence.md`:

```typescript
const CHUNK_SETTINGS = {
  minWords: 400,
  maxWords: 800,
  useSpeakerTurns: true,
};

const PIPELINE_SETTINGS = {
  runTime: '02:00',
  maxDailySignals: 30,
  minConfidenceScore: 0.7,
};
```

## Database Schema

The pipeline uses these main tables:
- `episode`: Podcast episodes with processing status
- `transcript_chunk`: Chunked transcript content with embeddings
- `daily_signal`: Daily personalized signals for users
- `user_preferences`: User centroid embeddings for personalization
- `saved_chunk`: User-saved content for training

## Learning Algorithm

1. **Initial State**: Users start with zero centroid (neutral)
2. **Positive Feedback**: Move centroid toward saved content
3. **Negative Feedback**: Move centroid away from skipped content
4. **Learning Rate**: Decreases as user provides more feedback
5. **Weekly Reset**: Recompute centroids from all historical data

This system becomes more accurate over time as users save/skip signals, creating a personalized intelligence feed.