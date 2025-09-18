Awesome — here’s a practical starter map you can follow without touching graph databases or RL. Ship the MVP, learn fast, and keep doors open to a graph later.

North Star (scope you can deliver fast)

User asks a question → you fetch the best transcript chunks (global or single-episode) → LLM writes an answer with time-coded citations → user clicks “helpful / unhelpful / better clip?” → you log that as training data.

1) Minimal stack (boring, reliable)

API: Next.js 15 with App Router (TypeScript)

DB: Postgres + pgvector (hybrid search: BM25 + vectors) via Drizzle ORM

Queue: Background jobs with Next.js (for ingestion jobs)

Storage: Local filesystem or S3 (audio/transcripts if needed)

Embeddings: any strong text-embedding model (e.g., text-embedding-3-large or open bge-large)

Re-ranker (optional v1.1): small cross-encoder (cross-encoder/ms-marco-MiniLM-L-6-v2)

LLM: ChatGPT or Claude for answer drafting (keep provider swappable) via AI SDK

You do not need a graph DB or RL for v1. You’ll log labels for later.

2) Data model (Drizzle schema)

Use normal tables; you can export to RDF later. Define schema in TypeScript:

```typescript
// src/db/schema/podcast.ts
import { pgTable, text, integer, numeric, vector, timestamp, bigserial, primaryKey } from 'drizzle-orm/pg-core';

export const episode = pgTable('episode', {
  episodeId: text('episode_id').primaryKey(),
  series: text('series'),
  title: text('title'),
  guest: text('guest'),
  publishedAt: timestamp('published_at').defaultNow(),
  language: text('language'),
  durationSec: integer('duration_sec')
});

export const transcriptChunk = pgTable('transcript_chunk', {
  chunkId: text('chunk_id').primaryKey(),
  episodeId: text('episode_id').references(() => episode.episodeId),
  startSec: numeric('start_sec'),  // 2050.0
  endSec: numeric('end_sec'),      // 2120.0
  text: text('text'),
  embedding: vector('embedding', { dimensions: 1536 })  // pgvector dim; adjust to your model
});

// queries, answers, citations
export const qaQuery = pgTable('qa_query', {
  queryId: text('query_id').primaryKey(),
  userId: text('user_id'),
  mode: text('mode').$type<'global' | 'episode'>(),
  episodeId: text('episode_id'),
  queryText: text('query_text'),
  createdAt: timestamp('created_at').defaultNow()
});

export const qaAnswer = pgTable('qa_answer', {
  answerId: text('answer_id').primaryKey(),
  queryId: text('query_id').references(() => qaQuery.queryId),
  answerText: text('answer_text'),
  createdAt: timestamp('created_at').defaultNow()
});

export const qaCitation = pgTable('qa_citation', {
  answerId: text('answer_id').references(() => qaAnswer.answerId),
  chunkId: text('chunk_id').references(() => transcriptChunk.chunkId),
  startSec: numeric('start_sec'),
  endSec: numeric('end_sec'),
  rank: integer('rank')
}, (table) => ({
  pk: primaryKey({ columns: [table.answerId, table.chunkId] })
}));

// user feedback = labels
export const qaFeedback = pgTable('qa_feedback', {
  feedbackId: bigserial('feedback_id', { mode: 'number' }).primaryKey(),
  queryId: text('query_id').references(() => qaQuery.queryId),
  signal: text('signal').$type<'helpful' | 'unhelpful' | 'better_clip'>(),
  altChunkId: text('alt_chunk_id').references(() => transcriptChunk.chunkId),
  createdAt: timestamp('created_at').defaultNow()
});
```

3) Ingestion pipeline (simple & robust)

Parse transcript → normalize speaker text (optional).

Chunking: slide a 120–200 token window; store start_sec/end_sec.

Compute embedding using AI SDK or OpenAI client.

Insert into transcript_chunk via Drizzle.

TypeScript pseudo:

```typescript
// scripts/ingest-episode.ts
import { db } from '@/db';
import { episode, transcriptChunk } from '@/db/schema/podcast';
import { embed } from '@/lib/embeddings';

function chunkTranscript(segments: Array<{start: number, end: number, text: string}>, maxTokens = 200, stride = 120) {
  // segments: [{start, end, text}, ...] from ASR/publisher
  // stitch text while tracking time; produce overlapping windows
  // ...
}

async function ingestEpisode(epMeta: any, segments: any[]) {
  await db.insert(episode).values(epMeta).onConflictDoUpdate({
    target: episode.episodeId,
    set: epMeta
  });
  
  const chunks = chunkTranscript(segments);
  for (const c of chunks) {
    const embedding = await embed(c.text);  // vector via AI SDK
    await db.insert(transcriptChunk).values({
      ...c,
      embedding
    });
  }
}
```

4) Retrieval (global vs. single-episode)

Global mode: search all chunks.

Episode mode: filter by episode_id.

Hybrid search: combine text search with vector similarity using Drizzle queries and pgvector.

TypeScript sketch:

```typescript
// lib/retrieval.ts
import { db } from '@/db';
import { transcriptChunk } from '@/db/schema/podcast';
import { sql, eq, and } from 'drizzle-orm';
import { embed } from '@/lib/embeddings';

async function retrieveChunks(query: string, episodeId?: string, limit = 12) {
  const queryEmbedding = await embed(query);
  
  // Vector similarity search
  const vectorResults = await db
    .select({
      chunkId: transcriptChunk.chunkId,
      episodeId: transcriptChunk.episodeId,
      startSec: transcriptChunk.startSec,
      endSec: transcriptChunk.endSec,
      text: transcriptChunk.text,
      similarity: sql`1 - (${transcriptChunk.embedding} <=> ${queryEmbedding})`
    })
    .from(transcriptChunk)
    .where(episodeId ? eq(transcriptChunk.episodeId, episodeId) : undefined)
    .orderBy(sql`${transcriptChunk.embedding} <=> ${queryEmbedding}`)
    .limit(200);

  // For v1: just use vector search
  // v1.1: add text search with ts_rank and combine scores
  
  return vectorResults.slice(0, limit);
}
```


v1: skip re-ranker. v1.1: feed top 12 to a cross-encoder for better ordering.

5) Answer assembly (LLM with receipts)

Pass top chunks + query to LLM with a strict system prompt:

Answer concisely.

Only use provided context.

Cite 2–3 chunks with episode_id and timecodes.

Prompt skeleton:

System: You are a podcast-learning assistant. Use ONLY the supplied chunks.
Cite 2–3 sources as: [episode_id @ mm:ss–mm:ss]. If uncertain, say so.

User question: "{q}"

Context (chunk_id: episode_id start–end):
1) {text}
...


Post-process the model’s chosen chunks → map chunk_ids → (episode_id, start_sec, end_sec) and store in qa_citation.

6) API endpoints (minimal)

```typescript
// app/api/qa/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';

const qaSchema = z.object({
  query: z.string(),
  mode: z.enum(['global', 'episode']),
  episode_id: z.string().optional()
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, mode, episode_id } = qaSchema.parse(body);
  
  // Implementation using retrieveChunks and LLM
  return Response.json({
    answer: "...",
    citations: [{ episode_id: "...", start: 2050, end: 2120 }]
  });
}
```

```typescript
// app/api/feedback/route.ts  
const feedbackSchema = z.object({
  query_id: z.string(),
  signal: z.enum(['helpful', 'unhelpful', 'better_clip']),
  alt_clip: z.string().optional()
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validated = feedbackSchema.parse(body);
  
  // Store feedback in qaFeedback table
  return Response.json({ success: true });
}
```

7) Frontend must-haves (React components)

```typescript
// components/qa-interface.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function QAInterface() {
  const [mode, setMode] = useState<'global' | 'episode'>('global');
  
  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button 
          variant={mode === 'global' ? 'default' : 'outline'}
          onClick={() => setMode('global')}
        >
          Global Search
        </Button>
        <Button 
          variant={mode === 'episode' ? 'default' : 'outline'}
          onClick={() => setMode('episode')}
        >
          This Episode
        </Button>
      </div>
      
      {/* Answer display with citations */}
      {/* One-tap feedback buttons */}
      {/* Episode contributors */}
    </div>
  );
}
```

Mode toggle: Global ↔ This episode.

Show answer + 2–3 receipts (click → deep link ?t=2050).

One-tap feedback: Helpful / Unhelpful / Better clip?

(Optional) Show which episodes contributed.

8) Evaluation (keep it tiny but real)

Online metric: Helpful rate = helpful / (helpful + unhelpful).

Offline sanity set: 15–30 seed questions with hand-picked correct chunks; run nightly and track Recall@5.

9) Retraining without RL (later, still simple)

You don’t need RL. Use supervised improvements:

Retriever: train a bi-encoder on (query, positive_chunk, hard_negatives) mined from:

helpful answers’ cited chunks = positives

retrieved-but-not-cited chunks = hard negatives

Re-ranker: fine-tune a cross-encoder on the same data.

Faithfulness classifier (optional v1.2): train a small classifier to predict if an answer uses evidence correctly, using user “unhelpful” and editor labels.

10) Roadmap you can execute (2 weeks)

Week 1

Day 1–2: Setup Drizzle + pgvector + ingestion script; embed & index 10–20 episodes.

Day 3: /api/qa endpoint (global mode), vector retrieval with Drizzle.

Day 4: LLM answering with AI SDK + citations formatting.

Day 5: Basic React UI with shadcn/ui, show receipts; /api/feedback endpoint.

Day 6–7: Episode mode filter; small offline eval set; deploy to Vercel.

Week 2

Add text+vector hybrid search; improve prompts to reduce hallucinations.

Add “better clip?” → lets user submit a replacement chunk (store as label).

Add tRPC endpoints and simple admin dashboard (queries, helpful rate, top episodes).

Optional: cross-encoder re-ranker for quality bump.

11) How to keep graph optional (future-proof)

When you’re ready:

Write a tiny exporter that emits RDF from Postgres:

episode → schema:PodcastEpisode

each chunk → oa:Annotation with target start_sec/end_sec

citations → prov:wasDerivedFrom

You can keep all app logic in Postgres and only use the graph for analytics/search later.

12) Gotchas (read this once)

Chunk size: too long → noisy; too short → brittle. Start ~120–200 tokens overlap stride ~60–120.

Prompt creep: keep it strict; never allow the model to browse.

Citations: always show at least 2; if only one is strong, duplicate with a nearby chunk covering the same span.

Logging: never skip logging query/answer/feedback; this is your dataset.

Latency: embed the query once per request; cache frequent queries (LRU).

Multilingual: normalize language per episode; use multilingual embeddings if needed.

13) What to hand me if you want me to code next

5–10 episode transcripts (JSON: {start,end,text})

Your preferred embedding & LLM providers

A Postgres URL (with pgvector extension enabled)

TL;DR for you

Use Postgres + pgvector; no graph DB, no RL.

Build one retrieval→answer→feedback loop with strict citations.

Log everything; that’s your future training data.

Add a re-ranker later; export to RDF when you actually need a graph.

This roadmap aligns with your Next.js + Drizzle + tRPC stack, leveraging TypeScript throughout for type safety and developer experience.
