# Agent RAG Implementation Plan

## Goal
Build "bottom-right quadrant" RAG: **Powerful retrieval + Agent-driven context**

Using: Postgres pgvector + Vercel AI SDK + tRPC

## Week 1: Foundation (Using Postgres)

### Day 1-2: Extend RAG Router

Add these endpoints to `/src/server/trpc/routers/rag.ts`:

```typescript
// 1. Temporal context (get chunks before/after a moment)
getTemporalContext: protectedProcedure
  .input(z.object({
    chunkId: z.string(),
    windowSeconds: z.number().default(60)
  }))
  .query(async ({ ctx, input }) => {
    // Find the target chunk
    const targetChunk = await ctx.db.query.transcriptChunk.findFirst({
      where: eq(transcriptChunk.id, input.chunkId)
    });
    
    // Get chunks in time window
    return ctx.db.query.transcriptChunk.findMany({
      where: and(
        eq(transcriptChunk.episodeId, targetChunk.episodeId),
        sql`${transcriptChunk.startTimeSec} BETWEEN 
            ${targetChunk.startTimeSec - input.windowSeconds} AND 
            ${targetChunk.endTimeSec + input.windowSeconds}`
      ),
      orderBy: asc(transcriptChunk.startTimeSec)
    });
  }),

// 2. Keyword search (full-text)
searchKeyword: protectedProcedure
  .input(z.object({
    query: z.string(),
    limit: z.number().default(20)
  }))
  .query(async ({ ctx, input }) => {
    // Use Postgres tsvector for keyword search
    return ctx.db
      .select(/* ... */)
      .from(transcriptChunk)
      .where(
        sql`to_tsvector('english', ${transcriptChunk.content}) @@ 
            plainto_tsquery('english', ${input.query})`
      )
      .limit(input.limit);
  }),

// 3. Filtered search (metadata + semantic)
searchFiltered: protectedProcedure
  .input(z.object({
    query: z.string(),
    filters: z.object({
      podcastIds: z.array(z.string()).optional(),
      speaker: z.string().optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }),
    limit: z.number().default(10)
  }))
  .query(async ({ ctx, input }) => {
    const queryEmbedding = await generateEmbedding(input.query);
    const conditions = [/* build WHERE clause from filters */];
    
    return ctx.db
      .select(/* ... */)
      .where(and(...conditions))
      .orderBy(sql`embedding <=> ${queryEmbedding}`)
      .limit(input.limit);
  }),
```

### Day 3-4: Build Agent Endpoint

Create `/src/app/api/agent/search/route.ts`:

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createCaller } from '@/server/trpc/root';
import { createTRPCContext } from '@/server/trpc/context';

export async function POST(request: Request) {
  const { query, userId } = await request.json();
  
  // Create tRPC caller for this user
  const ctx = await createTRPCContext({ req: request, userId });
  const trpc = createCaller(ctx);
  
  const result = await generateText({
    model: openai('gpt-4-turbo'),
    system: `You are a research assistant. Use available tools to find 
             information in the user's saved podcast content. Think step by step:
             1. What information do I need?
             2. Which search tool is best?
             3. Do I need more context?
             4. Should I search again with different terms?`,
    prompt: query,
    tools: {
      semantic_search: tool({
        description: 'Search for conceptually similar content (best for topics/themes)',
        parameters: z.object({
          query: z.string().describe('The search query'),
          limit: z.number().default(10)
        }),
        execute: async ({ query, limit }) => {
          const results = await trpc.rag.searchSaved({ query, limit });
          return results.map(r => ({
            content: r.content,
            source: r.citation,
            similarity: r.similarity
          }));
        }
      }),
      
      keyword_search: tool({
        description: 'Search for exact keywords/phrases (best for specific terms)',
        parameters: z.object({
          query: z.string().describe('Keywords to search for'),
          limit: z.number().default(10)
        }),
        execute: async ({ query, limit }) => {
          return await trpc.rag.searchKeyword({ query, limit });
        }
      }),
      
      filter_by_podcast: tool({
        description: 'Search within specific podcast(s)',
        parameters: z.object({
          podcastIds: z.array(z.string()),
          query: z.string()
        }),
        execute: async ({ podcastIds, query }) => {
          return await trpc.rag.searchFiltered({ 
            query, 
            filters: { podcastIds } 
          });
        }
      }),
      
      get_context: tool({
        description: 'Get full conversation around a specific result (use when you need more context)',
        parameters: z.object({
          chunkId: z.string(),
          windowSeconds: z.number().default(60)
        }),
        execute: async ({ chunkId, windowSeconds }) => {
          return await trpc.rag.getTemporalContext({ chunkId, windowSeconds });
        }
      })
    },
    maxSteps: 10, // Allow multi-hop reasoning
  });
  
  return Response.json({
    answer: result.text,
    steps: result.steps,
    toolCalls: result.toolCalls
  });
}
```

### Day 5: Test Agent Behavior

Create test queries to verify agent uses tools correctly:

```typescript
// scripts/test-agent.ts
const testQueries = [
  {
    query: "What did Andrew Ng say about transformers?",
    expectedTools: ["filter_by_podcast", "semantic_search"]
  },
  {
    query: "Find the exact quote about 'attention is all you need'",
    expectedTools: ["keyword_search", "get_context"]
  },
  {
    query: "Compare what different guests said about AGI timelines",
    expectedTools: ["semantic_search", "semantic_search"] // multiple calls
  }
];

for (const test of testQueries) {
  console.log(`\nTesting: ${test.query}`);
  const result = await fetch('/api/agent/search', {
    method: 'POST',
    body: JSON.stringify({ query: test.query, userId: 'test-user' })
  });
  
  const data = await result.json();
  console.log(`Tools used: ${data.toolCalls.map(t => t.toolName)}`);
  console.log(`Answer: ${data.answer.slice(0, 200)}...`);
}
```

## Week 2: Advanced Features

### Day 1-2: Add Query Expansion

Agent automatically expands queries:

```typescript
// In agent system prompt
system: `Before searching, consider:
- Synonyms (AGI → "artificial general intelligence", "superintelligence")
- Acronyms (ML → "machine learning")
- Related terms (transformers → "attention mechanism", "BERT", "GPT")

Use multiple searches with expanded terms, then combine results.`
```

### Day 3: Add Re-ranking

Combine semantic + keyword + metadata scores:

```typescript
searchMultiModal: protectedProcedure
  .input(z.object({
    query: z.string(),
    weights: z.object({
      semantic: z.number().default(0.6),
      keyword: z.number().default(0.2),
      metadata: z.number().default(0.2)
    })
  }))
  .query(async ({ ctx, input }) => {
    // Run searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      /* semantic search */,
      /* keyword search */
    ]);
    
    // Merge and re-rank
    const merged = mergeAndRerank(
      semanticResults, 
      keywordResults, 
      input.weights
    );
    
    return merged;
  })
```

### Day 4-5: Build Chat UI

Create `/src/app/(app)/chat/page.tsx`:

```typescript
"use client";

import { useState } from 'react';
import { useChat } from 'ai/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/agent/chat', // streaming endpoint
  });
  
  return (
    <div className="flex flex-col h-screen">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className="inline-block p-3 rounded-lg bg-muted">
              {m.content}
              
              {/* Show sources/citations */}
              {m.toolInvocations?.map((tool) => (
                <div key={tool.toolCallId} className="mt-2 text-xs">
                  <strong>{tool.toolName}:</strong> {tool.args.query}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about your podcasts..."
          className="w-full p-2 border rounded"
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
```

## Week 3: Optimization & Monitoring

### Day 1-2: Add Caching

Cache frequent queries in Redis:

```typescript
// In agent search route
const cacheKey = `agent:${hash(query)}:${userId}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return Response.json(JSON.parse(cached));
}

// ... run agent search ...

await redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1 hour
```

### Day 3: Add Analytics

Track agent behavior:

```typescript
// After agent completes
await analytics.track({
  event: 'agent_search',
  userId,
  properties: {
    query,
    toolsUsed: result.toolCalls.map(t => t.toolName),
    numSteps: result.steps.length,
    latency: Date.now() - startTime,
    satisfied: userFeedback // collect this in UI
  }
});
```

### Day 4-5: Performance Tuning

Optimize based on metrics:

```sql
-- Find slow queries
SELECT query, AVG(latency_ms) as avg_latency
FROM agent_searches
GROUP BY query
HAVING AVG(latency_ms) > 500
ORDER BY avg_latency DESC;

-- Most used tools
SELECT tool_name, COUNT(*) as usage_count
FROM agent_tool_calls
GROUP BY tool_name
ORDER BY usage_count DESC;
```

## Decision Point: Do We Need Chroma?

After Week 3, evaluate:

### Metrics to Check

1. **Latency**
   - P50 < 1s? ✅ Postgres is fine
   - P95 > 3s? ❌ Consider optimization or Chroma

2. **Quality**
   - User satisfaction > 80%? ✅ Keep Postgres
   - Users complain about irrelevant results? ❌ Investigate

3. **Scale**
   - Handling current load? ✅ No change needed
   - Database CPU > 80%? ❌ Optimize queries or add Chroma

4. **Development Velocity**
   - Easy to add new search strategies? ✅ Postgres working
   - Fighting with SQL? ❌ Consider simpler vector DB

### If Postgres Passes All Tests

**Ship it.** You have agent-driven RAG with:
- ✅ Dynamic context assembly
- ✅ Multi-hop reasoning
- ✅ Multiple search strategies
- ✅ Single source of truth
- ✅ Rich metadata integration

### If You Still Want Chroma

Then do **parallel testing**:

```typescript
// Run both simultaneously, compare
const [postgresResults, chromaResults] = await Promise.all([
  searchWithPostgres(query),
  searchWithChroma(query)
]);

// A/B test which gives better results
logComparison({ postgresResults, chromaResults, userPreference });
```

After 2 weeks of A/B testing, pick the winner.

## Summary

**Week 1:** Build agent RAG with Postgres  
**Week 2:** Add advanced features (re-ranking, chat UI)  
**Week 3:** Optimize and measure  
**Decision:** Evaluate if Chroma needed based on real data

**Prediction:** Postgres will be good enough, and you'll ship faster by not adding Chroma.

---

*"Can you overfit on a single batch? If not, there's a bug."*  
*Translation: Get basic agent RAG working with Postgres first, THEN optimize.*
