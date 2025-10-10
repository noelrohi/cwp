# Use Usman's Articles as Training Data

## Priority
**MEDIUM** - Strategic improvement, "golden standard" data

## Problem
Usman suggested:
> "Use Usman's articles - Feed Usman's past newsletters/articles into the system, snip them entirely, and hide them from the UI as high-value training data (the 'golden standard')."

Currently the system has no "ground truth" examples of high-quality content. Usman's own writing represents the gold standard for what he finds valuable, making it perfect training data.

## Current State
- No article ingestion for training purposes
- No way to mark content as "ground truth" / gold standard
- No hidden training data functionality
- Quality learning relies only on user saves/snips

## Acceptance Criteria
- [ ] Import Usman's newsletters/articles automatically
- [ ] Process articles into chunks
- [ ] Mark chunks as "gold standard" training data
- [ ] Hide from UI (don't show as signals)
- [ ] Use for quality profile learning
- [ ] Use for model fine-tuning (task #5)
- [ ] Automatic updates when new articles published

## Implementation Plan

### Phase 1: Article Import System

**1. Create Gold Standard Schema**
**File:** `/src/server/db/schema/training.ts`
```typescript
export const goldStandardContent = pgTable('gold_standard_content', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(), // 'newsletter' | 'article' | 'essay'
  sourceUrl: text('source_url').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  author: text('author').notNull(), // 'usman'
  publishedAt: timestamp('published_at'),
  
  // Processing
  processed: boolean('processed').default(false),
  chunkCount: integer('chunk_count').default(0),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const goldStandardChunk = pgTable('gold_standard_chunk', {
  id: text('id').primaryKey(),
  contentId: text('content_id').references(() => goldStandardContent.id),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  wordCount: integer('word_count').notNull(),
  
  // Quality markers
  isGoldStandard: boolean('is_gold_standard').default(true),
  qualityScore: real('quality_score').default(1.0), // Always 1.0 for gold standard
  
  createdAt: timestamp('created_at').defaultNow(),
});
```

**2. Article Sources Configuration**
**File:** `/src/server/lib/article-sources.ts` (NEW)
```typescript
export const USMAN_SOURCES = {
  substack: {
    url: 'https://usman.substack.com',
    rss: 'https://usman.substack.com/feed',
    type: 'newsletter' as const,
  },
  blog: {
    url: 'https://usmanyousaf.com',
    rss: 'https://usmanyousaf.com/feed',
    type: 'article' as const,
  },
  // Add other sources as needed
} as const;

export async function fetchUsmanArticles() {
  const articles = [];
  
  for (const source of Object.values(USMAN_SOURCES)) {
    const rssContent = await fetch(source.rss).then(r => r.text());
    const parsed = parseRSS(rssContent);
    
    articles.push(...parsed.items.map(item => ({
      sourceType: source.type,
      sourceUrl: item.link,
      title: item.title,
      content: item.content || item.description,
      publishedAt: new Date(item.pubDate),
    })));
  }
  
  return articles;
}
```

**3. Article Import Function**
**File:** `/src/server/lib/gold-standard-import.ts` (NEW)
```typescript
export async function importGoldStandardArticles() {
  const articles = await fetchUsmanArticles();
  
  for (const article of articles) {
    // Check if already imported
    const existing = await db.query.goldStandardContent.findFirst({
      where: eq(goldStandardContent.sourceUrl, article.sourceUrl)
    });
    
    if (existing) continue;
    
    // Import article
    const articleId = randomUUID();
    await db.insert(goldStandardContent).values({
      id: articleId,
      ...article,
      author: 'usman',
    });
    
    // Process into chunks
    await processGoldStandardArticle(articleId);
  }
}

async function processGoldStandardArticle(articleId: string) {
  const article = await db.query.goldStandardContent.findFirst({
    where: eq(goldStandardContent.id, articleId)
  });
  
  if (!article) return;
  
  // Clean and chunk content (same logic as regular articles)
  const chunks = await chunkArticleContent({
    content: article.content,
    minTokens: 150,
    maxTokens: 400,
  });
  
  // Generate embeddings
  const chunksWithEmbeddings = await Promise.all(
    chunks.map(async (chunk) => ({
      id: randomUUID(),
      contentId: articleId,
      content: chunk.content,
      embedding: await generateEmbedding(chunk.content),
      wordCount: chunk.wordCount,
      isGoldStandard: true,
      qualityScore: 1.0, // Perfect quality by definition
    }))
  );
  
  // Insert chunks
  await db.insert(goldStandardChunk).values(chunksWithEmbeddings);
  
  // Mark article as processed
  await db
    .update(goldStandardContent)
    .set({ 
      processed: true,
      chunkCount: chunks.length,
    })
    .where(eq(goldStandardContent.id, articleId));
}
```

### Phase 2: Use Gold Standard for Quality Learning

**1. Update Quality Profile Learning**
**File:** `/src/server/lib/quality-scoring.ts`

Modify `learnUserQualityProfile()`:
```typescript
export async function learnUserQualityProfile(userId: string) {
  // Get user's snips (existing logic)
  const snips = await getSnips(userId);
  
  // Get user's saves (existing logic)
  const saves = await getSaves(userId);
  
  // NEW: Get gold standard chunks (Usman's articles)
  const goldStandard = await db
    .select({ content: goldStandardChunk.content })
    .from(goldStandardChunk)
    .where(eq(goldStandardChunk.isGoldStandard, true))
    .limit(100);
  
  // Use gold standard as additional high-quality examples
  const allHighQuality = [
    ...snips,
    ...saves,
    ...goldStandard, // Add gold standard
  ];
  
  // Learn quality features (existing logic)
  const qualityFeatures = allHighQuality.map(c => 
    extractQualityFeatures(c.content)
  );
  
  // ... rest of existing logic
}
```

**2. Boost Similarity to Gold Standard**
```typescript
export async function scoreChunkQuality(
  content: string,
  profile: QualityProfile | null,
  userId: string
): Promise<number> {
  // Existing quality score
  const baseQuality = profile 
    ? scoreQuality(extractQualityFeatures(content), profile.preferences)
    : 0.5;
  
  // NEW: Check similarity to gold standard
  const chunkEmbedding = await generateEmbedding(content);
  const goldStandardEmbeddings = await getGoldStandardEmbeddings();
  
  const goldSimilarity = Math.max(
    ...goldStandardEmbeddings.map(goldEmbed => 
      cosineSimilarity(chunkEmbedding, goldEmbed)
    )
  );
  
  // Boost if similar to gold standard
  const goldBoost = goldSimilarity > 0.8 ? 1.2 : 1.0;
  
  return baseQuality * goldBoost;
}
```

### Phase 3: Automated Updates

**1. Scheduled Import Job**
**File:** `/src/inngest/functions/gold-standard-sync.ts` (NEW)
```typescript
export const syncGoldStandardContent = inngest.createFunction(
  { 
    id: 'gold-standard-sync',
    cron: '0 0 * * *' // Daily at midnight
  },
  async ({ step }) => {
    await step.run('import-articles', async () => {
      return await importGoldStandardArticles();
    });
    
    await step.run('update-quality-profiles', async () => {
      // Regenerate quality profiles for all users
      // to include new gold standard data
      const users = await db.select({ userId: userPreferences.userId })
        .from(userPreferences);
      
      for (const user of users) {
        await learnUserQualityProfile(user.userId);
      }
    });
  }
);
```

**2. Manual Import Trigger**
**File:** `/src/server/trpc/routers/admin.ts`
```typescript
importGoldStandard: adminProcedure
  .mutation(async ({ ctx }) => {
    const result = await importGoldStandardArticles();
    
    return {
      imported: result.length,
      processed: result.filter(r => r.processed).length,
    };
  })
```

### Phase 4: Hide from UI

**1. Filter Gold Standard from Signals**
**File:** `/src/server/trpc/routers/signals.ts`

Ensure gold standard chunks never create signals:
```typescript
// In signal generation logic
const chunks = await db
  .select()
  .from(transcriptChunk)
  .where(
    and(
      eq(transcriptChunk.episodeId, episodeId),
      // Exclude gold standard chunks
      not(exists(
        db.select()
          .from(goldStandardChunk)
          .where(eq(goldStandardChunk.id, transcriptChunk.id))
      ))
    )
  );
```

**2. Admin View (Optional)**
**File:** `/src/app/(app)/admin/gold-standard/page.tsx` (NEW)
```tsx
export default function GoldStandardPage() {
  const goldStandard = trpc.admin.listGoldStandard.useQuery();
  
  return (
    <div>
      <h1>Gold Standard Training Data</h1>
      <p>Usman's articles used for quality learning</p>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Chunks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {goldStandard.data?.map(item => (
            <TableRow key={item.id}>
              <TableCell>{item.title}</TableCell>
              <TableCell>{item.sourceType}</TableCell>
              <TableCell>{formatDate(item.publishedAt)}</TableCell>
              <TableCell>{item.chunkCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

## Integration with Fine-Tuning (Task #5)

Gold standard chunks can be used for model fine-tuning:
```typescript
// Export gold standard for fine-tuning
export async function exportGoldStandardForTraining() {
  const goldChunks = await db
    .select()
    .from(goldStandardChunk)
    .where(eq(goldStandardChunk.isGoldStandard, true));
  
  return goldChunks.map(chunk => ({
    text: chunk.content,
    label: 'high_quality',
    quality_score: 1.0,
    is_gold_standard: true,
  }));
}
```

## RSS Feed Parser
```typescript
import Parser from 'rss-parser';

const parser = new Parser();

async function parseRSS(url: string) {
  const feed = await parser.parseURL(url);
  return feed;
}
```

## Files to Create
- `/src/server/db/schema/gold-standard.ts` - Gold standard schema
- `/src/server/lib/article-sources.ts` - Article source config
- `/src/server/lib/gold-standard-import.ts` - Import logic
- `/src/inngest/functions/gold-standard-sync.ts` - Automated sync
- `/src/app/(app)/admin/gold-standard/page.tsx` - Admin UI
- `/src/server/trpc/routers/admin.ts` - Admin endpoints

## Files to Modify
- `/src/server/lib/quality-scoring.ts` - Use gold standard for learning
- `/src/server/trpc/routers/signals.ts` - Filter gold standard from signals

## Dependencies to Install
```bash
pnpm add rss-parser
```

## Testing
- [ ] Import test article from URL
- [ ] Verify chunking works correctly
- [ ] Check embeddings are generated
- [ ] Verify gold standard boosts quality scores
- [ ] Test daily sync job
- [ ] Confirm content hidden from UI
- [ ] Admin view shows correct data

## Success Metrics
- [ ] All Usman articles imported and processed
- [ ] Quality profile learning includes gold standard
- [ ] Signals similar to Usman's writing get higher scores
- [ ] No gold standard content shown to users
- [ ] Automated updates work daily

## Rollout Plan

### Week 1: Development
1. Create schema and import logic
2. Test with 5-10 articles
3. Verify quality boost works

### Week 2: Import Backlog
1. Import all Usman's historical articles
2. Process into chunks
3. Generate embeddings

### Week 3: Quality Integration
1. Update quality learning to use gold standard
2. Regenerate all user quality profiles
3. Monitor signal quality improvement

### Week 4: Automation
1. Deploy daily sync job
2. Set up monitoring/alerts
3. Document for team

## Notes from Usman
> "Feed Usman's past newsletters/articles into the system, snip them entirely, and hide them from the UI as high-value training data (the 'golden standard')."

This creates a baseline of "perfect quality" that the system learns from. Combined with fine-tuning (task #5), this provides both immediate quality boost and long-term model improvement.
