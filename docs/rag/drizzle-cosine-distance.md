# Using Drizzle's cosineDistance for Vector Search

## The Clean Way (What We Use Now)

Drizzle ORM provides a built-in `cosineDistance` helper for pgvector similarity search:

```typescript
import { cosineDistance, desc, sql } from 'drizzle-orm';
import { generateEmbedding } from '@/lib/embedding';
import { transcriptChunk } from '@/server/db/schema';

const findSimilarChunks = async (query: string) => {
  const queryEmbedding = await generateEmbedding(query);
  
  // Calculate similarity using Drizzle's helper
  const similarity = sql<number>`1 - ${cosineDistance(transcriptChunk.embedding, queryEmbedding)}`;
  
  const results = await db
    .select({
      content: transcriptChunk.content,
      similarity,
    })
    .from(transcriptChunk)
    .where(sql`${transcriptChunk.embedding} IS NOT NULL`)
    .orderBy(desc(similarity))
    .limit(10);
  
  return results;
};
```

## Benefits Over Raw SQL

### Before (Raw SQL)
```typescript
// ❌ Error-prone, hard to read
similarity: sql<number>`1 - (${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)})::float`,

// ❌ Manual operator syntax
.orderBy(sql`${transcriptChunk.embedding} <=> ${JSON.stringify(queryEmbedding)}`)
```

### After (Drizzle Helper)
```typescript
// ✅ Type-safe, readable
const similarity = sql<number>`1 - ${cosineDistance(transcriptChunk.embedding, queryEmbedding)}`;

// ✅ Clean ordering
.orderBy(desc(similarity))
```

## Why This Is Better

1. **Type Safety**
   - Drizzle validates the embedding column type
   - TypeScript catches mismatched dimensions

2. **Readability**
   - Clear semantic meaning: `cosineDistance(a, b)`
   - No manual operator syntax (`<=>`)

3. **Maintainability**
   - Drizzle handles SQL generation
   - Works across different vector extensions

4. **Performance**
   - Drizzle optimizes the query
   - Uses proper pgvector operators

## Advanced: Filter Before Vector Search

```typescript
// Combine filters with similarity search
const similarity = sql<number>`1 - ${cosineDistance(transcriptChunk.embedding, queryEmbedding)}`;

const results = await db
  .select({ content: transcriptChunk.content, similarity })
  .from(transcriptChunk)
  .where(
    and(
      gt(similarity, 0.5), // Only results > 50% similar
      sql`${transcriptChunk.embedding} IS NOT NULL`
    )
  )
  .orderBy(desc(similarity))
  .limit(10);
```

## How It Works Under the Hood

```typescript
cosineDistance(col, embedding)
// Generates: col <=> '[0.1, 0.2, ...]'::vector

1 - cosineDistance(col, embedding)
// Generates: 1 - (col <=> '[0.1, 0.2, ...]'::vector)
// Returns: similarity score (0 to 1, higher = more similar)
```

## Why `1 - cosineDistance`?

- **cosineDistance**: Returns distance (0 = identical, 2 = opposite)
- **1 - cosineDistance**: Converts to similarity (1 = identical, 0 = unrelated)
- We want **higher scores for better matches**, so we use similarity

## Complete Example from Our RAG Router

```typescript
export const ragRouter = createTRPCRouter({
  searchSaved: protectedProcedure
    .input(z.object({
      query: z.string(),
      limit: z.number().default(10)
    }))
    .query(async ({ ctx, input }) => {
      const queryEmbedding = await generateEmbedding(input.query);
      
      // Calculate similarity using Drizzle's helper
      const similarity = sql<number>`1 - ${cosineDistance(
        transcriptChunk.embedding, 
        queryEmbedding
      )}`;
      
      const results = await ctx.db
        .select({
          chunkId: transcriptChunk.id,
          content: transcriptChunk.content,
          similarity, // Include in results
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(
          and(
            eq(dailySignal.userId, ctx.user.id),
            eq(dailySignal.userAction, "saved"),
            sql`${transcriptChunk.embedding} IS NOT NULL`
          )
        )
        .orderBy(desc(similarity)) // Order by similarity DESC
        .limit(input.limit);
      
      return results;
    })
});
```

## Comparison with Other Distance Metrics

```typescript
import { 
  cosineDistance,  // Angular similarity (0-2)
  l2Distance,      // Euclidean distance
  maxInnerProduct  // Dot product (for normalized vectors)
} from 'drizzle-orm';

// Cosine similarity (best for semantic search)
const cosineSim = sql<number>`1 - ${cosineDistance(col, embedding)}`;

// L2 distance (Euclidean)
const l2Sim = sql<number>`1 / (1 + ${l2Distance(col, embedding)})`;

// Inner product (if vectors are normalized)
const innerProd = sql<number>`${maxInnerProduct(col, embedding)}`;
```

**For RAG/semantic search:** Use `cosineDistance` (what we're doing)

## Performance Notes

- Drizzle uses pgvector's native `<=>` operator (fast)
- HNSW index automatically applies
- No performance penalty vs raw SQL
- Cleaner code = easier optimization later

## Migration from Raw SQL

If you have existing raw SQL vector queries:

```typescript
// Old way
.orderBy(sql`embedding <=> ${JSON.stringify(embedding)}`)

// New way
.orderBy(desc(sql<number>`1 - ${cosineDistance(table.embedding, embedding)}`))
```

Just replace the raw SQL with `cosineDistance` helper!

---

**Bottom line:** Use `cosineDistance` for cleaner, safer, more maintainable vector search code. ✅
