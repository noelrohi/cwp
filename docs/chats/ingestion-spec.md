Great call. Drizzle + pgvector is a clean fit. Here’s a drop-in plan (schema + queries) that mirrors the earlier spec but uses Drizzle ORM with Postgres vector search and Postgres FTS for hybrid retrieval.

# 1) Enable pgvector + FTS bits

* Create the extension in a migration (Drizzle doesn’t auto-create):

  ````sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ``` :contentReference[oaicite:0]{index=0}
  ````
* Use HNSW or IVFFlat indexes on your `vector(...)` columns for speed; HNSW generally has better recall/speed trade-off. ([GitHub][1])

# 2) Drizzle schema (episodes + chunks + QA)

```ts
// schema.ts
import { pgTable, text, timestamp, integer, serial, vector, numeric, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const episode = pgTable("episode", {
  episodeId: text("episode_id").primaryKey(),
  series: text("series"),
  title: text("title").notNull(),
  guest: text("guest"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  language: text("language"),
  durationSec: integer("duration_sec"),
  audioUrl: text("audio_url"),
  transcriptUrl: text("transcript_url"),
});

export const transcriptChunk = pgTable(
  "transcript_chunk",
  {
    chunkId: text("chunk_id").primaryKey(),
    episodeId: text("episode_id").references(() => episode.episodeId, { onDelete: "cascade" }),
    startSec: numeric("start_sec"),
    endSec: numeric("end_sec"),
    text: text("text").notNull(),
    // vector of your embed size (e.g., 1536 or 3072)
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (t) => [
    // Vector ANN index (HNSW + cosine)
    index("embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    // Full-text search GIN index over generated tsvector (no native tsvector type in Drizzle yet)
    index("text_fts_idx").using("gin", sql`to_tsvector('english', ${t.text})`),
  ]
);

export const qaQuery = pgTable("qa_query", {
  queryId: text("query_id").primaryKey(),
  userId: text("user_id"),
  mode: text("mode"),    // 'global' | 'episode'
  episodeId: text("episode_id"),
  queryText: text("query_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const qaAnswer = pgTable("qa_answer", {
  answerId: text("answer_id").primaryKey(),
  queryId: text("query_id").references(() => qaQuery.queryId, { onDelete: "cascade" }),
  answerText: text("answer_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const qaCitation = pgTable("qa_citation", {
  answerId: text("answer_id").references(() => qaAnswer.answerId, { onDelete: "cascade" }),
  chunkId: text("chunk_id").references(() => transcriptChunk.chunkId),
  startSec: numeric("start_sec"),
  endSec: numeric("end_sec"),
  rank: integer("rank"),
});

export const qaFeedback = pgTable("qa_feedback", {
  feedbackId: serial("feedback_id").primaryKey(),
  queryId: text("query_id").references(() => qaQuery.queryId, { onDelete: "cascade" }),
  signal: text("signal"), // 'helpful' | 'unhelpful' | 'better_clip'
  altChunkId: text("alt_chunk_id").references(() => transcriptChunk.chunkId),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

* Drizzle’s vector type + index usage above follows their guide (note you still create the extension yourself). ([Drizzle ORM][2])
* FTS: Drizzle doesn’t have a native `tsvector` column yet, so you index `to_tsvector(...)` with `sql`` and query with `to\_tsquery`/`plainto\_tsquery\`. ([Drizzle ORM][3])

# 3) Ingestion (chunk → embed → insert)

* Chunk to \~120–200 tokens, compute embeddings, then:

```ts
await db.insert(transcriptChunk).values({
  chunkId, episodeId, startSec, endSec, text,
  embedding: embeddingArray, // number[]
});
```

* Drizzle’s vector guide uses OpenAI embeddings in examples; swap in whatever model you prefer. ([Drizzle ORM][2])

# 4) Hybrid retrieval (vector + FTS) with Drizzle

## 4a) Vector candidates (cosine)

Drizzle exposes `cosineDistance(col, vec)`. For index usage, avoid wrapping it as `1 - (...)` in `ORDER BY`—pgvector’s planner uses the distance operator in ASC order. If you need the index reliably, issue raw SQL with the `<=>` operator. ([GitHub][1])

```ts
import { sql, desc } from "drizzle-orm";
import { transcriptChunk } from "./schema";

// Using raw operator for best index use:
const vecParam = sql.raw(`array[${queryVec.join(",")}]`); // or parameterize properly
const byVector = await db.execute(sql`
  SELECT chunk_id, episode_id, start_sec, end_sec, text,
         (embedding <=> ${vecParam}) AS dist
  FROM transcript_chunk
  ORDER BY embedding <=> ${vecParam} ASC
  LIMIT 200
`);
```

(If you accept potential planner behavior, Drizzle’s helper works too and is shown in their docs, but note index caveats.) ([Drizzle ORM][2])

## 4b) Keyword/FTS candidates

```ts
import { sql } from "drizzle-orm";
const q = 'your keywords'; // or `plainto_tsquery('english', q)`
const byText = await db.execute(sql`
  SELECT chunk_id, episode_id, start_sec, end_sec, text,
         ts_rank_cd(to_tsvector('english', text), to_tsquery('english', ${q})) AS kw_rank
  FROM transcript_chunk
  WHERE to_tsvector('english', text) @@ to_tsquery('english', ${q})
  ORDER BY kw_rank DESC
  LIMIT 200
`);
```

* Drizzle FTS patterns and `ts_rank(_cd)` usage are straight from their guide; Postgres docs describe ranking operators. ([Drizzle ORM][3])

## 4c) Merge + score

* Union the two candidate sets in app code, normalize `1 - dist` to similarity, z-score or min-max both `sim` and `kw_rank`, then take top \~12 for the LLM. (Same loop as before.)

# 5) Indexes to use (cheat-sheet)

* Vector ANN:

  ```sql
  -- HNSW (cosine)
  CREATE INDEX IF NOT EXISTS embedding_hnsw_idx
    ON transcript_chunk USING hnsw (embedding vector_cosine_ops);
  ```

  HNSW usually outperforms IVFFlat at query time; IVFFlat builds faster and uses less memory. Tune `SET hnsw.ef_search` or `SET ivfflat.probes` per query. ([GitHub][1])
* FTS GIN:

  ```sql
  CREATE INDEX IF NOT EXISTS text_fts_idx
    ON transcript_chunk USING gin (to_tsvector('english', text));
  ```

  (Patterns from Drizzle FTS guide.) ([Drizzle ORM][3])

# 6) Gotchas specific to Drizzle + pgvector

* **Extension creation**: run `CREATE EXTENSION vector;` in a custom migration; Drizzle won’t do it for you. ([Drizzle ORM][2])
* **ORDER BY for index**: pgvector requires `ORDER BY embedding <op> $vec ASC LIMIT n` (no wrapping expressions) to guarantee index usage. If you build similarity as `1 - cosineDistance(...)`, the planner can skip the index; prefer the raw `<=>` operator. ([GitHub][1])
* **Dimensions**: stick to a fixed `vector(n)` per table for simpler indexing; mixed dimensions need expression/partial indexes. ([GitHub][1])

# 7) Bonus: starter + references

* Drizzle’s official **Vector similarity** guide (schema, HNSW index, querying). ([Drizzle ORM][2])
* Drizzle’s **Postgres full-text search** guide (tsvector/tsquery/ranking with Drizzle). ([Drizzle ORM][3])
* pgvector README: distance operators, HNSW/IVFFlat tuning, index rules. ([GitHub][1])
* Vercel’s Next.js + Drizzle + pgvector starter if you want a working scaffold. ([Vercel][4])

If you want, I can adapt the earlier SQL to Drizzle migrations (including generated chunks + eval tables) and wire up a hybrid retrieval function that returns top-k with `(episode_id @ mm:ss–mm:ss)`—just say which embedding model size you’re targeting.

[1]: https://github.com/pgvector/pgvector "GitHub - pgvector/pgvector: Open-source vector similarity search for Postgres"
[2]: https://orm.drizzle.team/docs/guides/vector-similarity-search "Drizzle ORM - Vector similarity search with pgvector extension"
[3]: https://orm.drizzle.team/docs/guides/postgresql-full-text-search "Drizzle ORM - PostgreSQL full-text search"
[4]: https://vercel.com/templates/next.js/postgres-pgvector?utm_source=chatgpt.com "Vercel Postgres pgvector Starter"
