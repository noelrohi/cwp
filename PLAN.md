# plan.md — Full Fidelity Intelligence System (CWP)

> Build a production-grade, citation-faithful podcast intelligence layer that turns \~50/day transcripts into actionable, traceable insights. Optimized for Next.js 15 (App Router), React 19, Tailwind + shadcn/ui, TRPC + React Query, Zod, and Biome. This doc is the developer plan you can implement end‑to‑end.

---

## 0) Dev Environment & Commands

* **Node**: 20 LTS
* **Package Manager**: `pnpm`
* **Lint/Format**: Biome
* **Commands**:

  * `pnpm lint` — Biome linter/checker
  * `pnpm format` — Biome formatter
* **Tests**: none configured (confirm need). If added, use Vitest + React Testing Library; wire under `pnpm test`.

**Repo structure (top‑level):**

```
/app                    # Next.js 15 (App Router)
  /api                  # route handlers; thin wrappers around tRPC when needed
  /(marketing)          # public pages
  /(app)                # authenticated app shell
/components/ui          # shadcn/ui primitives & wrappers (no Card component)
/components/features    # feature-level components
/styles                 # Tailwind, shadcn tokens (globals.css)
/server                 # server-only modules (db, trpc router, jobs)
  /db                   # ORM + schema
  /trpc                 # tRPC router
  /ingest               # ingestion pipeline workers
  /search               # embeddings, vector index
  /jobs                 # background queues
/lib                    # shared utils (zod, types, fetchers)
/scripts                # one-off scripts, migrations bootstrap
```

**Path alias**: `@/` → `./src/` or repo root depending on layout. Example import: `import { db } from '@/server/db'`

---

## 1) Principles & Non‑Negotiables

1. **Fidelity-first**: every claim traces to episode → timestamp → transcript → audio.
2. **Layered UX**: Email (L1) → Explore (L2) → Deep Dive (L3) → Research Mode (L4).
3. **Deterministic packaging**: don’t hallucinate; pull exact quotes with offsets and provide context windows.
4. **Zero hardcoded colors**: use shadcn tokens from `./src/globals.css` only.
5. **No shadcn Card**: build surfacing components from primitives.
6. **Type Safety end‑to‑end**: TypeScript, Zod, explicit types, `type` imports for type‑only.
7. **Data fetching**: tRPC + React Query; server-only modules under `/server`.

---

## 2) Data Model (DB + Types)

**DB choice**: PostgreSQL (primary), Redis (queues/cache), S3-compatible blob (audio clips & raw transcripts). ORM: Drizzle or Prisma; pick one (here we show **Drizzle** for schema-in-code + SQL clarity).

### 2.1 Tables

```ts
// /server/db/schema.ts (Drizzle)
import { pgTable, serial, text, varchar, integer, boolean, timestamp, jsonb, index, numeric } from 'drizzle-orm/pg-core';

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  source: varchar('source', { length: 64 }).notNull(), // e.g., 'Invest Like the Best'
  episodeCode: varchar('episode_code', { length: 64 }), // e.g., 'EP 284'
  title: text('title').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  audioUrl: text('audio_url'),
  durationSec: integer('duration_sec'),
  rawTranscriptKey: text('raw_transcript_key').notNull(), // s3 key
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const transcriptChunks = pgTable('transcript_chunks', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id').notNull().references(() => episodes.id),
  idx: integer('idx').notNull(),
  text: text('text').notNull(),
  startSec: integer('start_sec').notNull(),
  endSec: integer('end_sec').notNull(),
  embedding: jsonb('embedding'), // stored if small; otherwise vector store
});

export const quotes = pgTable('quotes', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id').notNull().references(() => episodes.id),
  speaker: varchar('speaker', { length: 128 }),
  text: text('text').notNull(),
  startSec: integer('start_sec').notNull(),
  endSec: integer('end_sec').notNull(),
  contextBefore: text('context_before'),
  contextAfter: text('context_after'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).default('0.90'),
});

export const patterns = pgTable('patterns', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(), // e.g., 'Professional Services Consolidation'
  synthesis: text('synthesis').notNull(),
  consensusLevel: varchar('consensus_level', { length: 32 }).notNull(), // CONSENSUS | DISAGREEMENT | MIXED
  confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }),
  windowEnd: timestamp('window_end', { withTimezone: true }),
});

export const patternEvidence = pgTable('pattern_evidence', {
  id: serial('id').primaryKey(),
  patternId: integer('pattern_id').notNull().references(() => patterns.id),
  quoteId: integer('quote_id').notNull().references(() => quotes.id),
});

export const engagements = pgTable('engagements', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  patternId: integer('pattern_id').references(() => patterns.id),
  action: varchar('action', { length: 32 }).notNull(), // CLICK | SAVE | IGNORE | SHARE
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  patternId: integer('pattern_id').references(() => patterns.id),
  userId: varchar('user_id', { length: 64 }).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

### 2.2 TypeScript domain types

```ts
// /lib/types.ts
export type ConsensusLevel = 'CONSENSUS' | 'DISAGREEMENT' | 'MIXED';

export interface EvidenceQuote {
  id: number;
  episodeId: number;
  speaker?: string;
  text: string;
  startSec: number;
  endSec: number;
  contextBefore?: string;
  contextAfter?: string;
  confidence: number; // 0..1
}

export interface Pattern {
  id: number;
  title: string;
  synthesis: string;
  consensusLevel: ConsensusLevel;
  confidence: number; // 0..1
  evidenceIds: number[];
  episodeIds: number[];
  windowStart?: string;
  windowEnd?: string;
}
```

---

## 3) Vector/Search Architecture

* **Embedding**: store per-chunk + per-quote embeddings.
* **Index**: use pgvector (Postgres extension) or external (Pinecone/Weaviate). Start with **pgvector** for simplicity.
* **Search modes**:

  1. **Transcript Search**: semantic + keyword hybrid over `transcript_chunks`.
  2. **Quote Drill‑down**: semantic search scoped to `quotes` with exact timestamps.
  3. **Question Answering**: RAG over selected chunks → quotes (return citations only; never fabricate).

---

## 4) Pipelines (Day 1 → Day 2)

### 4.1 Ingestion (Hour 0–2)

1. Fetch new episodes (RSS/APIs or provided sources).
2. Store metadata in `episodes` + raw transcript to S3.
3. **Chunking**: `size=500, overlap=100` tokens → derive `startSec/endSec` from timestamps.
4. Create embeddings for chunks; persist to pgvector.

### 4.2 Extraction (Hour 0–2)

* Detect speakers, entities, claims, metrics per chunk (OpenAI function calls or local model). Store surfaced **quotes** with context windows (prev/next \~30s).

### 4.3 Pattern Detection (Hour 2–4)

* Group claims by topic; compute frequency across episodes/day.
* Mark as **hot** if mentioned by ≥3 sources in window.

### 4.4 Convergence/Divergence (Hour 4–5)

* Compute similarity among claims; heuristic thresholds:

  * avg cosine ≥ 0.8 → CONSENSUS
  * variance ≥ 0.5 → DISAGREEMENT
  * else MIXED

### 4.5 Relevance Filter (Hour 5–6)

* Rule/learned filter for Framebreak‑relevant tags.
* Rank top 5 patterns/day.

### 4.6 Packaging (Hour 6–7)

* Synthesize concise headline & bullets.
* Select top 3 quotes with links to audio timestamps.
* Compute confidence (coverage × agreement × quote confidence).

### 4.7 Personalization (Hour 7–8)

* Re-rank by user’s recent questions, saved insights, active missions.
* Store **engagements** to power learning loop.

**Workers**: Node workers using BullMQ (Redis). Queues: `ingest`, `extract`, `pattern`, `package`, `email`.

---

## 5) API Surface (tRPC)

```ts
// /server/trpc/router.ts
import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from './trpc-core';

export const appRouter = createTRPCRouter({
  getPatterns: publicProcedure
    .input(z.object({ q: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      // hybrid search over patterns/quotes
      return ctx.services.patterns.search(input);
    }),

  getPatternById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => ctx.services.patterns.getById(input.id)),

  getTranscriptSearch: publicProcedure
    .input(z.object({ query: z.string().min(1), episodeIds: z.array(z.number()).optional() }))
    .query(({ ctx, input }) => ctx.services.search.transcripts(input)),

  getQuotesForPattern: publicProcedure
    .input(z.object({ patternId: z.number() }))
    .query(({ ctx, input }) => ctx.services.patterns.getQuotes(input.patternId)),

  getDeepDive: publicProcedure
    .input(z.object({ patternId: z.number() }))
    .query(({ ctx, input }) => ctx.services.patterns.deepDive(input.patternId)),

  saveEngagement: protectedProcedure
    .input(z.object({ patternId: z.number(), action: z.enum(['CLICK','SAVE','IGNORE','SHARE']), meta: z.record(z.any()).optional() }))
    .mutation(({ ctx, input }) => ctx.services.engagements.record(ctx.user.id, input)),
});

export type AppRouter = typeof appRouter;
```

**React Query usage** (CWP guideline compliant):

```tsx
// /components/features/patterns/pattern-list.tsx
import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/server/trpc/client';

export function PatternList() {
  const patternsQuery = useQuery(trpc.getPatterns.queryOptions({ limit: 20 }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {patternsQuery.data?.map((p) => (
        <a key={p.id} href={`/patterns/${p.id}`} className="rounded-2xl shadow p-4 bg-background">
          <div className="text-sm opacity-70">{p.consensusLevel}</div>
          <h3 className="text-lg font-semibold mt-1">{p.title}</h3>
          <p className="mt-2 text-sm leading-relaxed">{p.synthesis}</p>
        </a>
      ))}
    </div>
  );
}
```

---

## 6) UX Surfaces

### 6.1 Level 1 — Email Digest

* Subject: `3 podcasts converged on consulting's future`
* Body: PATTERN + 3 best quotes + CTA buttons:

  * `[Explore This Pattern]` → `/patterns/:id`
  * `[Listen to Clips]` → audio player with stitched 5‑min supercut
  * `[See Full Transcript]` → transcript page filtered to quotes

**Email generation**: server job reads top‑ranked patterns; renders MJML → HTML; links include UTM + patternId.

### 6.2 Level 2 — Explore Page `/patterns/:id`

* Sections:

  * **Consensus view** (badges + quick bullets)
  * **Contrarian** block with counter‑evidence
  * **Data View** (numbers, tables, sources)
  * **Your Exploration Options** (buttons): Data, Clips, Transcripts, Q\&A, Playbook, Peers
* All claims rendered with inline **citations** (episode, timestamp). Hover reveals context; click opens audio at `startSec`.

### 6.3 Level 3 — Deep Dive

* **Transcript search** with semantic + keyword.
* Results list: quote excerpt, speaker, `mm:ss`, actions: **See context**, **Play**, **Save**.
* Right rail: **Questions** (suggested prompts). Clicking runs tRPC `getTranscriptSearch` with structured filters.

### 6.4 Level 4 — Research Mode

* Full transcripts side‑by‑side; cross‑reference episodes; build a **custom playbook** (drag quotes → editor). Export to Markdown/PDF.

---

## 7) Evidence & Citation Fidelity

* Every UI claim has a `data-cite` pointing to a **quoteId**.
* Tooltip shows: episode title, `EP code`, `mm:ss`–`mm:ss`, speaker, and **“open 30s before”**.
* Deep links: `/episodes/:id?at=MM:SS` start the audio player at `startSec`.
* **No orphan synthesis**: if a synthesis sentence lacks ≥1 quoteId, highlight it as **needs citation** in dev mode.

---

## 8) Audio Clip Pipeline

* On quote selection, generate per‑quote audio snippet (`startSec-1s` → `endSec+1s`). Store in S3 as `audio/clips/{episodeId}/{quoteId}.mp3`.
* Supercut worker concatenates selected clips; store `audio/supercuts/{patternId}/{version}.mp3`.

---

## 9) Security & Privacy

* Auth: NextAuth (or custom) with JWT session; protected procedures use `protectedProcedure`.
* PII: store minimal user metadata; engagements keyed by `userId`.
* S3 URLs: signed, time‑limited.
* Rate limiting: middleware on tRPC (IP + user token bucket).
* Audit trail: log when syntheses are generated/edited.

---

## 10) Styling & UI Rules

* Tailwind + shadcn/ui primitives (`Button`, `Badge`, `Dialog`, `Tabs`, etc.).
* **Never** hardcode hex colors; use design tokens from `globals.css`.
* **Do not** use shadcn `Card`. Build `Panel` wrapper:

```tsx
// /components/ui/panel.tsx
import type { ComponentProps } from 'react';

export function Panel(props: ComponentProps<'div'>) {
  const { className, ...rest } = props;
  return (
    <div className={`rounded-2xl shadow p-4 bg-background ${className ?? ''}`} {...rest} />
  );
}
```

---

## 11) Forms & Validation

* Use **React Hook Form** + **ZodResolver**.
* All user inputs (search, comments) validated via Zod before hitting services.

---

## 12) Services Layer (Server‑only)

```ts
// /server/services/patterns.ts
import type { Pattern } from '@/lib/types';

export const patternsService = {
  async search({ q, limit }: { q?: string; limit: number }): Promise<Pattern[]> {
    // hybrid search: text + vector; return minimal fields for list
    return [];
  },
  async getById(id: number) {
    // join: pattern + evidence + episodes metadata
  },
  async getQuotes(patternId: number) {
    // quotes joined with episodes for timestamps/audio
  },
  async deepDive(patternId: number) {
    // pattern, all_evidence, transcripts subset, exploration options
  },
};
```

---

## 13) Email/Notification System

* Job: `email:daily-digest`
* Inputs: top 3 patterns/user after personalization.
* Render: MJML → HTML; track opens/clicks.
* Unsubscribe per user; respect timezone windows.

---

## 14) Observability

* Logs: pino on server; client analytics minimal (click/save/ignore events).
* Metrics: queue depths, job latencies, ingestion throughput, search p95.
* Feature flags: allow disabling Experimental Supercut.

---

## 15) Failure Modes & Guardrails

* **No transcript** → hide audio controls; show “Transcript pending”.
* **Low confidence quote** (<0.6) → not eligible for evidence by default.
* **Missing citations** → synthesis components render dev‑warning.
* **Vector store down** → fallback to keyword search.

---

## 16) API Example — React Query + tRPC (CWP‑aligned)

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { trpc } from '@/server/trpc/client';

export function TranscriptSearch({ query }: { query: string }) {
  const searchQuery = useQuery(trpc.getTranscriptSearch.queryOptions({ query }));
  const save = useMutation(trpc.saveEngagement.mutationOptions());

  return (
    <div>
      {searchQuery.data?.results.map((r) => (
        <div key={r.quoteId} className="py-2">
          <p className="text-sm">{r.text}</p>
          <button
            onClick={() => save.mutate({ patternId: r.patternId, action: 'CLICK' })}
            className="underline"
          >
            Play @ {r.mmss}
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 17) Roadmap & Milestones

**M0 — Skeleton (1–2 days)**

* Bootstrap Next.js 15, React 19, Tailwind, shadcn tokens, Biome.
* Drizzle setup; pgvector extension enabled.
* tRPC scaffold; `getPatterns` dummy data.

**M1 — Ingestion & Search (3–5 days)**

* Episode + transcript ingestion; chunking; embeddings stored.
* Transcript search (hybrid) endpoint.
* Basic Explore page with citations from `quotes`.

**M2 — Patterning (4–6 days)**

* Extraction job (quotes, entities, claims).
* Frequency + convergence analysis; persist `patterns` + `patternEvidence`.
* Explore L2 page complete; email digest first draft.

**M3 — Deep Dive & Clips (5–7 days)**

* Transcript search UX; context windows; audio clip generation; supercut.
* Personalization re‑rank and engagements tracking.

**M4 — Hardening (ongoing)**

* Rate limits, observability, backfills, dataset QA tools.

Acceptance criteria per milestone in the next section.

---

## 18) Acceptance Criteria (Key Features)

* **Citations**: Every synthesis bullet shows ≥1 clickable citation; opens audio at correct timestamp ±1s.
* **Transcript Search**: Query returns relevant quotes in < 500ms p95 for 100k chunks.
* **Supercut**: 5‑minute stitched audio plays on web and via email deep link.
* **Personalization**: Click/save events persist; next day’s ranking changed for that user.
* **No hardcoded colors**: CI check rejects hex color strings.
* **No shadcn Card**: lint rule or code search passes.

---

## 19) Email Copy (L1) — Example

```
Subject: 3 podcasts converged on consulting's future

PATTERN DETECTED: Professional Services Consolidation

• “We’re buying every sub-$50M specialist firm we can find” — Blackstone Pres. [EP 284, 23:45]
• “The age of the generalist consultant is over” — Ram Charan [EP 167, 41:22]
• “EY’s consulting sale signals the great unbundling” — Scott Galloway [Thu, 18:30]

[Explore This Pattern]  [Listen to Clips]  [See Full Transcript]
```

---

## 20) Configuration & Env

```
DATABASE_URL=
REDIS_URL=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
OPENAI_API_KEY=
EMAIL_SMTP_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

---

## 21) Methodology Disclosure

* “Source: Synthesis of …” blocks list the episodes/time ranges used.
* Contrarian sections must include at least one quote + margin data where available.
* All computed multiples shown with ranges + data source note.

---

## 22) Future Enhancements

* Active learning loop to improve claim extraction thresholds.
* Peer discussion summarization (structured with quotes only).
* Editor to assemble **Playbooks** with live citations.

---

## 23) Open Questions

* Tests scope (unit vs e2e)?
* Which host: Vercel (Edge/audio limits) vs container on Fly/Render?
* Data retention window for raw audio?

---

## 24) Done Checklist (Definition of Done)

* Biome passes (`pnpm lint`, `pnpm format`).
* No hex colors detected; only tokens used.
* tRPC + React Query wired; example page loads patterns from DB.
* Ingestion processed at least 5 episodes; search returns quotes with accurate timestamps.
* Explore page shows consensus + contrarian + citations; audio starts at timestamp.
* Email digest sent to test user and links resolve to Explore/Deep Dive.

---

**Appendix A — Minimal Citation Render**

```tsx
export function Cite({ quoteId }: { quoteId: number }) {
  // server component fetch
  // render link → /episodes/:id?at=MM:SS
  return (
    <a href={`#`} className="underline">[source]</a>
  );
}
```

**Appendix B — Chunking Heuristic**

* Target \~500 tokens, 100 overlap.
* Respect speaker turns; never split mid‑timestamp if available.

---

> Ship M0 this week; M1 starts once ingestion runs end‑to‑end on a sample batch. Keep fidelity checks on by default in dev.
