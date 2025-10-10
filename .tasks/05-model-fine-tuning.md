# Model Fine-Tuning Implementation

## Priority
**MEDIUM** - Strategic improvement for long-term quality

## Problem
Usman suggested:
> "Noel should work with their team to fine-tune the model using:
> - Saved chunks (good examples)
> - Unsafe chunks (bad examples)  
> - New data that's still making mistakes"

Currently the system learns from user behavior via quality scoring, but doesn't fine-tune the actual models. Fine-tuning would improve signal quality and reduce false positives.

## Current State
- Quality scoring learns preferences (semantic + quality features)
- No actual model fine-tuning
- No training data collection pipeline
- No feedback loop for model improvement

## Acceptance Criteria
- [ ] Collect training data from user actions
- [ ] Create training dataset (saved vs skipped chunks)
- [ ] Fine-tune embedding model for better similarity
- [ ] Fine-tune Claude for better signal extraction
- [ ] A/B test fine-tuned vs base models
- [ ] Automated retraining pipeline
- [ ] Quality metrics tracking

## Fine-Tuning Options

### Option 1: Fine-Tune Embedding Model (Recommended First)
**What:** Create custom embeddings that understand "good signal" vs "bad signal"
**How:** 
- Use saved chunks as positive examples
- Use skipped chunks as negative examples
- Train a custom embedding model
- Contrastive learning: maximize distance between saved/skipped

**Provider Options:**
- OpenAI fine-tuning for `text-embedding-3-small`
- Cohere fine-tuning for embeddings
- Self-hosted sentence-transformers fine-tuning

### Option 2: Fine-Tune LLM for Signal Extraction
**What:** Train Claude/GPT to extract better signals
**How:**
- Collect (chunk, signal quality) pairs
- Fine-tune to predict signal quality
- Use for pre-filtering before user sees

**Provider:** Anthropic Claude fine-tuning (when available)

### Option 3: Both (Long-term)
Use fine-tuned embeddings + fine-tuned LLM for best results

## Implementation Plan

### Phase 1: Data Collection Pipeline

**1. Create Training Data Schema**
**File:** `/src/server/db/schema/training.ts` (NEW)
```typescript
export const trainingDataPoint = pgTable('training_data_point', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  chunkId: text('chunk_id').references(() => transcriptChunk.id),
  chunkContent: text('chunk_content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  
  // User feedback
  userAction: text('user_action'), // 'saved' | 'skipped' | 'snipped'
  actionedAt: timestamp('actioned_at'),
  
  // Quality metrics
  relevanceScore: real('relevance_score'),
  qualityScore: real('quality_score'),
  
  // Context
  episodeTitle: text('episode_title'),
  podcastTitle: text('podcast_title'),
  speakerName: text('speaker_name'),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow(),
  usedForTraining: boolean('used_for_training').default(false),
  trainingSetVersion: text('training_set_version'),
});
```

**2. Collect Data on User Actions**
**File:** `/src/server/trpc/routers/signals.ts`

Modify `action` endpoint:
```typescript
action: protectedProcedure
  .input(z.object({ 
    signalId: z.string(),
    action: z.enum(['saved', 'skipped']),
  }))
  .mutation(async ({ ctx, input }) => {
    // Existing logic...
    
    // NEW: Collect training data
    await collectTrainingDataPoint({
      userId: ctx.user.userId,
      signalId: input.signalId,
      action: input.action,
    });
  })
```

**3. Training Data Export Function**
**File:** `/src/server/lib/training-data.ts` (NEW)
```typescript
export async function exportTrainingDataset(userId: string) {
  const positiveExamples = await db
    .select()
    .from(trainingDataPoint)
    .where(and(
      eq(trainingDataPoint.userId, userId),
      eq(trainingDataPoint.userAction, 'saved')
    ));
    
  const negativeExamples = await db
    .select()
    .from(trainingDataPoint)
    .where(and(
      eq(trainingDataPoint.userId, userId),
      eq(trainingDataPoint.userAction, 'skipped')
    ));
    
  return {
    positive: positiveExamples,
    negative: negativeExamples,
    format: 'jsonl', // for OpenAI/Anthropic
  };
}
```

### Phase 2: Fine-Tune Embedding Model

**1. Prepare Training Data**
```typescript
// Format for contrastive learning
const trainingPairs = [];

for (const saved of positiveExamples) {
  for (const skipped of negativeExamples) {
    trainingPairs.push({
      anchor: saved.chunkContent,
      positive: getRandomSaved(),
      negative: skipped.chunkContent,
    });
  }
}
```

**2. Fine-Tune with OpenAI**
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create fine-tuning job
const fineTune = await openai.fineTuning.jobs.create({
  training_file: uploadedFileId,
  model: 'text-embedding-3-small',
  hyperparameters: {
    n_epochs: 3,
  }
});

// Monitor training
const status = await openai.fineTuning.jobs.retrieve(fineTune.id);
```

**3. Use Fine-Tuned Model**
```typescript
// Update embedding.ts to use fine-tuned model
const modelId = process.env.FINE_TUNED_EMBEDDING_MODEL || 'text-embedding-3-small';
```

### Phase 3: Fine-Tune LLM (Future)

**1. Prepare Prompt/Completion Pairs**
```typescript
const trainingData = positiveExamples.map(ex => ({
  messages: [
    {
      role: 'system',
      content: 'Extract key insights from podcast chunks.'
    },
    {
      role: 'user', 
      content: `Chunk: ${ex.chunkContent}\n\nIs this a high-quality signal?`
    },
    {
      role: 'assistant',
      content: 'Yes, this is valuable because...'
    }
  ]
}));
```

**2. Fine-Tune Claude (when available)**
```typescript
// Anthropic fine-tuning API (coming soon)
// Use saved chunks as positive examples
// Use skipped chunks as negative examples
```

### Phase 4: A/B Testing

**1. Create Model Variants**
```typescript
export const MODEL_VARIANTS = {
  base: 'text-embedding-3-small',
  fineTuned: process.env.FINE_TUNED_MODEL_ID,
} as const;

type Variant = keyof typeof MODEL_VARIANTS;
```

**2. Assign Users to Variants**
```typescript
function getModelVariant(userId: string): Variant {
  const hash = simpleHash(userId);
  return hash % 2 === 0 ? 'base' : 'fineTuned';
}
```

**3. Track Performance**
```typescript
// Log which model was used
await db.insert(modelPerformanceLog).values({
  userId,
  signalId,
  modelVariant,
  userAction,
  relevanceScore,
});

// Analyze results
const baseAccuracy = calculateAccuracy('base');
const fineTunedAccuracy = calculateAccuracy('fineTuned');
```

## Automated Retraining Pipeline

**File:** `/src/inngest/functions/model-retraining.ts` (NEW)
```typescript
export const retrainEmbeddingModel = inngest.createFunction(
  { id: 'model-retraining', cron: '0 0 * * 0' }, // Weekly
  async ({ step }) => {
    // 1. Collect last week's training data
    const data = await step.run('collect-data', async () => {
      return await exportTrainingDataset('all-users');
    });
    
    // 2. Check if enough new data (min 100 examples)
    if (data.positive.length < 100) return;
    
    // 3. Trigger fine-tuning job
    await step.run('start-fine-tuning', async () => {
      return await startFineTuningJob(data);
    });
    
    // 4. Monitor completion
    await step.waitForEvent('fine-tuning-complete', {
      timeout: '24h'
    });
    
    // 5. Deploy new model
    await step.run('deploy-model', async () => {
      await updateModelVersion();
    });
  }
);
```

## Quality Metrics to Track

```typescript
type ModelMetrics = {
  // Accuracy metrics
  precision: number;      // % of suggested signals that user saves
  recall: number;         // % of saved signals that were suggested
  f1Score: number;        // Harmonic mean of precision/recall
  
  // User satisfaction
  saveRate: number;       // % signals saved vs total shown
  skipRate: number;       // % signals skipped
  snipRate: number;       // % signals turned into flashcards
  
  // Distribution metrics
  scoreDistribution: {
    veryLow: number;
    low: number;
    mid: number;
    high: number;
    veryHigh: number;
  };
  
  // Business metrics
  userEngagement: number; // Daily active signal reviewers
  timeToProcess: number;  // Avg time to clear pending signals
};
```

## Cost Estimation

### OpenAI Fine-Tuning Costs
- Training: ~$0.008 per 1K tokens
- Usage: ~$0.012 per 1K tokens (1.5x base price)
- For 10K training examples: ~$80 one-time
- Monthly usage: ~$20-40 (same volume, slightly higher rate)

### Anthropic Fine-Tuning Costs (when available)
- TBD - likely similar to OpenAI

## Files to Create
- `/src/server/db/schema/training.ts` - Training data schema
- `/src/server/lib/training-data.ts` - Data collection/export
- `/src/server/lib/fine-tuning.ts` - Fine-tuning logic
- `/src/inngest/functions/model-retraining.ts` - Automated retraining
- `/src/server/lib/model-metrics.ts` - Performance tracking

## Files to Modify
- `/src/server/trpc/routers/signals.ts` - Collect training data on actions
- `/src/lib/embedding.ts` - Support fine-tuned models
- `/src/server/lib/quality-scoring.ts` - Track model performance

## Testing Strategy
- [ ] Collect 1000+ training examples before fine-tuning
- [ ] A/B test base vs fine-tuned (50/50 split)
- [ ] Monitor save rate improvement
- [ ] Track false positive reduction
- [ ] User feedback surveys

## Success Criteria
- [ ] Save rate improves by 20%+ with fine-tuned model
- [ ] False positive rate decreases by 30%+
- [ ] User satisfaction increases (survey)
- [ ] Signal quality score improves
- [ ] Automated retraining runs successfully

## Rollout Plan

### Week 1-2: Data Collection
- Deploy training data collection
- Collect 1000+ examples
- Validate data quality

### Week 3-4: First Fine-Tuning
- Prepare training dataset
- Run fine-tuning job
- Test fine-tuned model

### Week 5-6: A/B Testing
- Deploy to 50% of users
- Monitor metrics
- Collect feedback

### Week 7-8: Full Rollout
- Deploy to 100% if successful
- Set up automated retraining
- Document improvements

## Notes from Usman
> "Fine-tuning needed - Noel should work with their team to fine-tune the model using saved chunks (good examples), unsafe chunks (bad examples), and new data that's still making mistakes."

This is a strategic investment in long-term quality. Start with embedding fine-tuning (simpler, faster results), then move to LLM fine-tuning.
