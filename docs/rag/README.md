# RAG Documentation

Complete documentation for the RAG (Retrieval-Augmented Generation) system built with Postgres pgvector.

## Quick Start

1. **[RAG_SETUP_COMPLETE.md](./RAG_SETUP_COMPLETE.md)** - Start here! 
   - Current architecture overview
   - Available endpoints
   - Usage examples
   - What's working now

## Implementation Guides

2. **[RAG_IMPLEMENTATION.md](./RAG_IMPLEMENTATION.md)**
   - Detailed implementation guide
   - Performance benchmarks
   - Testing strategies
   - Optimization tips

3. **[drizzle-cosine-distance.md](./drizzle-cosine-distance.md)**
   - How to use Drizzle's `cosineDistance` helper
   - Clean vector search patterns
   - Examples and best practices

## Architecture & Decision Making

4. **[karpathy-rag-recommendation.md](./karpathy-rag-recommendation.md)**
   - Why Postgres > Chroma for this use case
   - First-principles analysis
   - When you'd actually need an external vector DB

5. **[agent-rag-architecture.md](./agent-rag-architecture.md)**
   - "Bottom-right quadrant" RAG explained
   - Agent-driven context assembly
   - Multi-hop reasoning patterns
   - Why this is about orchestration, not storage

## Roadmap

6. **[AGENT_RAG_IMPLEMENTATION_PLAN.md](./AGENT_RAG_IMPLEMENTATION_PLAN.md)**
   - 3-week implementation plan
   - Week 1: Foundation with Postgres
   - Week 2: Advanced features (agents, chat)
   - Week 3: Optimization & decision point

## File Organization

```
docs/rag/
├── README.md                              # This file
├── RAG_SETUP_COMPLETE.md                  # Current state (START HERE)
├── RAG_IMPLEMENTATION.md                  # Implementation guide
├── drizzle-cosine-distance.md             # Vector search with Drizzle
├── karpathy-rag-recommendation.md         # Architecture decisions
├── agent-rag-architecture.md              # Agent-driven RAG patterns
└── AGENT_RAG_IMPLEMENTATION_PLAN.md       # Roadmap
```

## Related Documentation

- **[../NEXT_STEPS.md](../NEXT_STEPS.md)** - This week's action plan
- **[../context/signal-validation.llm.txt](../context/signal-validation.llm.txt)** - Signal processing details

## Quick Reference

### Key Endpoints

```typescript
// Search saved content
trpc.rag.searchSaved.query({ query: "AI safety", limit: 10 })

// Search all episodes
trpc.rag.searchAll.query({ query: "transformers", podcastIds: [...] })

// Hybrid search
trpc.rag.searchHybrid.query({ query: "ML", minRelevanceScore: 0.5 })

// Get LLM context
trpc.rag.getContext.query({ query: "deep learning", limit: 5 })
```

### Key Files in Codebase

- **Router**: `/src/server/trpc/routers/rag.ts`
- **Schema**: `/src/server/db/schema/podcast.ts` (transcriptChunk table)
- **Embeddings**: `/src/lib/embedding.ts` (OpenAI text-embedding-3-small)

## Architecture Summary

```
User Query
    ↓
Generate OpenAI Embedding (1536 dims)
    ↓
Postgres Vector Search (pgvector + HNSW index)
    ↓
Rich JOINs (chunks + episodes + podcasts + user signals)
    ↓
Return Results with Citations
```

**No external vector database needed.** Everything in Postgres.

## Next Steps

1. **Today**: Read `RAG_SETUP_COMPLETE.md`
2. **This Week**: Follow `../NEXT_STEPS.md` to build search UI
3. **Next Week**: Decide on agent layer (see `AGENT_RAG_IMPLEMENTATION_PLAN.md`)

---

Questions? Start with `RAG_SETUP_COMPLETE.md` - it has everything you need to get going.
