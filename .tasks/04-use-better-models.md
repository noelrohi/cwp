# Use Better Models (Claude Opus 4.1)

## Priority
**HIGH** - Usman specifically requested this

## Problem
Currently using free models (`x-ai/grok-4-fast:free`) for critical operations like:
- Speaker identification
- Episode summaries (when implemented)
- Signal generation

Usman said:
> "Use better models (like Opus 4.1) for generating summaries rather than free models."

Free models produce lower quality results, affecting signal quality and user experience.

## Current State
**Speaker Identification:**
- Using: `x-ai/grok-4-fast:free`
- Location: `/src/server/lib/speaker-identification.ts` line 50

**Other AI Operations:**
- No Claude usage found in codebase
- No Opus 4 or premium models in use

## Acceptance Criteria
- [ ] Replace free models with Claude Opus 4.1 (or latest)
- [ ] Use for speaker identification
- [ ] Use for episode summaries
- [ ] Use for any AI-generated content shown to users
- [ ] Keep free models for development/testing only
- [ ] Add environment variable for model selection
- [ ] Monitor costs and token usage

## Implementation Steps

### 1. Install Anthropic SDK
```bash
pnpm add @anthropic-ai/sdk
```

### 2. Add Environment Variables
**File:** `.env.example` and `.env.local`
```bash
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# Model Selection
AI_MODEL_SPEAKER_IDENTIFICATION=claude-opus-4-20250514
AI_MODEL_SUMMARY=claude-opus-4-20250514
AI_MODEL_FALLBACK=x-ai/grok-4-fast:free  # For dev/testing
```

### 3. Update Speaker Identification
**File:** `/src/server/lib/speaker-identification.ts`

**Current (line 48-50):**
```typescript
const result = await generateText({
  model: openrouter("x-ai/grok-4-fast:free"),
  system: `You are an expert at identifying podcast speakers...`
});
```

**New:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await anthropic.messages.create({
  model: process.env.AI_MODEL_SPEAKER_IDENTIFICATION || 'claude-opus-4-20250514',
  max_tokens: 1024,
  system: `You are an expert at identifying podcast speakers...`,
  messages: [
    { role: 'user', content: /* existing prompt */ }
  ]
});
```

### 4. Create Shared Model Config
**File:** `/src/server/lib/ai-models.ts` (NEW)
```typescript
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const AI_MODELS = {
  speakerIdentification: process.env.AI_MODEL_SPEAKER_IDENTIFICATION || 'claude-opus-4-20250514',
  summary: process.env.AI_MODEL_SUMMARY || 'claude-opus-4-20250514',
  fallback: process.env.AI_MODEL_FALLBACK || 'x-ai/grok-4-fast:free',
} as const;

export async function generateWithClaude({
  system,
  prompt,
  model = AI_MODELS.summary,
  maxTokens = 2000,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' 
    ? response.content[0].text 
    : '';
}
```

### 5. Update Episode Summary (When Implemented)
**File:** `/src/server/lib/episode-summary.ts`
```typescript
import { generateWithClaude, AI_MODELS } from './ai-models';

export async function generateEpisodeSummary(transcript: string) {
  const summary = await generateWithClaude({
    model: AI_MODELS.summary,
    system: 'You are an expert at extracting key insights from podcasts.',
    prompt: `Extract from this transcript:
    
1. KEY TAKEAWAYS (3-5 bullet points)
2. PRACTICAL EXAMPLES (2-3 bullet points)  
3. LESSONS LEARNED (2-3 bullet points)

Transcript:
${transcript}`,
    maxTokens: 2000,
  });

  return parseMarkdownSummary(summary);
}
```

### 6. Cost Optimization Strategies
```typescript
// Cache summaries aggressively
// Use streaming for long content
// Batch requests where possible
// Set reasonable max_tokens limits
// Monitor usage with logging
```

## Model Selection Rationale

### Claude Opus 4.1 (Recommended)
**Pros:**
- Highest quality outputs
- Best reasoning capabilities
- Excellent at summarization
- Strong instruction following

**Cons:**
- Higher cost (~$15 per 1M input tokens)
- Slower than Haiku

**Use For:**
- Episode summaries (user-facing)
- Speaker identification (accuracy critical)
- Any AI content shown to users

### Claude Sonnet 3.7 (Alternative)
**Pros:**
- Good balance of quality/cost
- Faster than Opus
- Still high quality

**Cons:**
- Slightly lower quality than Opus

**Use For:**
- Development/staging environments
- High-volume operations

### Keep Free Models For:
- Development environment
- Testing
- Non-critical operations
- Fallback when quota exceeded

## Cost Estimation

### Current (Free Models)
- Cost: $0
- Quality: Low

### With Claude Opus 4.1
**Speaker Identification:**
- ~500 tokens per episode
- ~$0.0075 per episode
- For 467 episodes: ~$3.50

**Episode Summaries:**
- ~2000 tokens per episode  
- ~$0.03 per episode
- For 467 episodes: ~$14

**Total Initial Cost:** ~$20 for backfill
**Ongoing:** ~$5-10/month for new episodes

This is reasonable for the quality improvement.

## Files to Modify
- `/src/server/lib/speaker-identification.ts` - Switch to Claude
- `/src/server/lib/ai-models.ts` - NEW FILE - Shared config
- `/src/server/lib/episode-summary.ts` - NEW FILE - Use Claude
- `.env.example` - Add Anthropic API key
- `package.json` - Add @anthropic-ai/sdk

## Environment Variables Checklist
- [ ] Add `ANTHROPIC_API_KEY` to `.env.local`
- [ ] Add `ANTHROPIC_API_KEY` to production environment
- [ ] Add model selection variables
- [ ] Update `.env.example` with all new vars

## Testing
- [ ] Test speaker identification with Claude
- [ ] Compare quality: free model vs Claude
- [ ] Verify API key configuration
- [ ] Test error handling (rate limits, invalid key)
- [ ] Monitor token usage and costs
- [ ] Test fallback to free models if needed

## Rollout Plan

### Phase 1: Development
1. Add Anthropic SDK
2. Configure environment variables
3. Update speaker identification
4. Test quality improvements

### Phase 2: Staging
1. Deploy to staging
2. Process 10-20 episodes
3. Compare results with free models
4. Verify costs are acceptable

### Phase 3: Production
1. Deploy to production
2. Enable for new episodes
3. Optional: Reprocess existing episodes
4. Monitor costs and quality

## Success Metrics
- Speaker identification accuracy >90% (vs ~60% with free models)
- Episode summaries coherent and useful
- User satisfaction with signal quality
- Cost stays under $20/month

## Notes from Usman
> "Use better models (like Opus 4.1) for generating summaries rather than free models."

Quality matters more than cost for this application.
