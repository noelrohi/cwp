# Next Steps: Ship RAG to Your Boss 🚀

## ✅ What's Done

- [x] RAG router with 4 search endpoints (`/src/server/trpc/routers/rag.ts`)
- [x] Postgres pgvector integration (already had it!)
- [x] Type-safe tRPC API
- [x] Clean Drizzle `cosineDistance` helper (no raw SQL!)
- [x] Documentation organized in `/docs/rag/` (see README)
- [x] Removed Chroma (cleaned up)

📚 **Full documentation**: See `/docs/rag/README.md` for all guides

## 🎯 This Week: Ship MVP

### Day 1: Test the RAG Endpoints (2 hours)

Create a quick test script:

```bash
# Create test file
cat > /Users/rohi/hov/cwp/scripts/test-rag-search.ts << 'EOF'
import { createCaller } from "@/server/trpc/root";
import { db } from "@/server/db";

async function testRAG() {
  // Get a real user ID from your database
  const user = await db.query.user.findFirst();
  if (!user) {
    console.log("No users found. Create a user first.");
    return;
  }

  const trpc = createCaller({ user: { id: user.id } });

  console.log("Testing RAG search...\n");

  const queries = [
    "artificial intelligence",
    "machine learning",
    "transformers",
  ];

  for (const query of queries) {
    console.log(`\n━━━ Query: "${query}" ━━━`);
    
    const results = await trpc.rag.searchSaved({ query, limit: 3 });
    
    if (results.length === 0) {
      console.log("❌ No results found. User might not have saved content with embeddings.");
    } else {
      results.forEach((r, i) => {
        console.log(`\n[${i + 1}] Similarity: ${r.similarity?.toFixed(3) || 'N/A'}`);
        console.log(`    ${r.citation}`);
        console.log(`    ${r.content.slice(0, 100)}...`);
      });
    }
  }
}

testRAG().catch(console.error);
EOF

# Run it
pnpm exec tsx scripts/test-rag-search.ts
```

**Expected Output:**
- If you get results → ✅ RAG is working!
- If no results → Check that user has saved chunks with embeddings

### Day 2: Build Simple Search UI (4 hours)

Create a search page:

```bash
# 1. Create the page
cat > /Users/rohi/hov/cwp/src/app/(app)/search/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useTRPC } from "@/server/trpc/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SearchPage() {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");

  const { data: results, isLoading } = trpc.rag.searchSaved.useQuery(
    { query, limit: 10 },
    { enabled: query.length > 2 }
  );

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Search Your Saved Content</h1>
      
      <Input
        type="search"
        placeholder="What are you looking for?"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6"
      />

      {isLoading && <p>Searching...</p>}

      {results && results.length === 0 && query.length > 2 && (
        <p className="text-muted-foreground">No results found</p>
      )}

      <div className="space-y-4">
        {results?.map((result) => (
          <Card key={result.chunkId}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{result.citation}</CardTitle>
                <Badge variant="secondary">
                  {((result.similarity ?? 0) * 100).toFixed(0)}% match
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{result.content}</p>
              {result.speaker && (
                <p className="text-xs text-muted-foreground mt-2">
                  Speaker: {result.speaker}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
EOF

echo "✅ Search page created at /app/(app)/search/page.tsx"
```

### Day 3: Demo to Your Boss (1 hour)

**Prepare:**
1. Open the search page: `http://localhost:3000/search`
2. Test with these queries:
   - "What did they say about [topic your boss cares about]?"
   - "[Specific concept from your podcasts]"
   - "[Name of a speaker] and [topic]"

**Show your boss:**
- ✅ Semantic search works (finds related content, not just keywords)
- ✅ Searches only their saved content
- ✅ Fast results (< 1 second)
- ✅ Rich context (episode, podcast, timestamp)

**Key talking points:**
- "This is RAG using our existing Postgres database"
- "Searches across all your saved podcast moments"
- "No external services needed - keeps data in-house"
- "Ready to add chat interface on top of this"

## 🚀 Next Week: Add Chat (If Boss Approves)

### Option 1: Simple Chat (Recommended First)

```typescript
// /app/(app)/chat/page.tsx
"use client";

import { useState } from "react";
import { useTRPC } from "@/server/trpc/client";

export default function ChatPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const trpc = useTRPC();

  const handleAsk = async () => {
    // Get context from RAG
    const { context, sources } = await trpc.rag.getContext.query({
      query,
      limit: 5
    });

    // Send to OpenAI (create this endpoint)
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ query, context })
    });

    const data = await response.json();
    setAnswer(data.answer);
  };

  return (
    <div>
      <input 
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask about your podcasts..."
      />
      <button onClick={handleAsk}>Ask</button>
      
      {answer && <div>{answer}</div>}
    </div>
  );
}
```

### Option 2: Agent-Driven Chat (Advanced)

Follow `/docs/AGENT_RAG_IMPLEMENTATION_PLAN.md` for:
- Multi-hop reasoning
- Dynamic tool selection
- Query expansion
- Streaming responses

## 📊 Success Metrics

Track these to prove it's working:

1. **Search Quality**
   - Are results relevant? (Ask users)
   - Average similarity score > 0.6?

2. **Performance**
   - Search latency < 200ms?
   - No user complaints about speed?

3. **Usage**
   - How many searches per day?
   - Which queries are most common?

4. **Engagement**
   - Do users click on results?
   - Do they save more content after searching?

## 🐛 Troubleshooting

### "No results found"
**Cause:** User has no saved chunks with embeddings

**Fix:**
```sql
-- Check embedding coverage
SELECT 
  COUNT(*) as total_saved,
  COUNT(tc.embedding) as saved_with_embeddings
FROM daily_signal ds
JOIN transcript_chunk tc ON ds.chunk_id = tc.id
WHERE ds.user_action = 'saved' 
  AND ds.user_id = 'YOUR_USER_ID';
```

If `saved_with_embeddings` is 0, embeddings weren't generated during episode processing.

### "Search is slow"
**Cause:** No HNSW index or inefficient query

**Fix:**
```sql
-- Verify HNSW index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'transcript_chunk' 
  AND indexdef LIKE '%hnsw%';

-- If missing, create it:
CREATE INDEX ON transcript_chunk 
USING hnsw (embedding vector_cosine_ops);
```

### "Results not relevant"
**Cause:** Query mismatch or poor embeddings

**Fix:**
- Try different query phrasings
- Check similarity scores (should be > 0.5 for good matches)
- Verify embeddings were generated with same model (text-embedding-3-small)

## 📝 Quick Commands

```bash
# Test RAG search
pnpm exec tsx scripts/test-rag-search.ts

# Start dev server
pnpm dev

# Open search page
open http://localhost:3000/search

# Check embeddings in DB
psql $DATABASE_URL -c "SELECT COUNT(*) FROM transcript_chunk WHERE embedding IS NOT NULL;"

# Run linter
pnpm lint

# Type check
pnpm typecheck
```

## 🎯 The Goal

**This week:** Demo working semantic search to your boss

**Next week:** Add chat interface (if boss wants it)

**Following week:** Agent-driven RAG (if basic chat isn't enough)

## 💡 Remember

- **Start simple:** Search UI first, chat later
- **Measure everything:** Latency, quality, usage
- **Ship fast, iterate:** Don't wait for perfection
- **Postgres is enough:** Don't add Chroma unless proven needed

---

You're ready to ship! 🚢

Need help with any step? Just ask.
