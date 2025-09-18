import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

// Simplified "Learn with Podcast" schema
// Minimal episode + transcript chunks + QA with citations and feedback

export const podcast = pgTable("podcast", {
  id: text("id").primaryKey(),
  podcastId: text("podcast_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const episode = pgTable("episode", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().unique(),
  podcastId: text("podcast_id").references(() => podcast.id),
  series: text("series"),
  title: text("title").notNull(),
  guest: text("guest"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  language: text("language"),
  durationSec: integer("duration_sec"),
  audioUrl: text("audio_url"),
  transcriptUrl: text("transcript_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Starter questions for each episode (onboarding chips / prompts)
export const starterQuestion = pgTable("starter_question", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  rank: integer("rank"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const transcriptChunk = pgTable(
  "transcript_chunk",
  {
    chunkId: text("chunk_id").primaryKey(),
    episodeId: text("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    startSec: numeric("start_sec"),
    endSec: numeric("end_sec"),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    // Vector HNSW index for cosine distance
    index("embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    // FTS index over generated tsvector from text
    index("text_fts_idx").using("gin", sql`to_tsvector('english', ${t.text})`),
  ],
);

export const qaQuery = pgTable("qa_query", {
  queryId: text("query_id").primaryKey(),
  userId: text("user_id"),
  mode: text("mode").$type<"global" | "episode">(),
  episodeId: text("episode_id"),
  queryText: text("query_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const qaAnswer = pgTable("qa_answer", {
  answerId: text("answer_id").primaryKey(),
  queryId: text("query_id").references(() => qaQuery.queryId, {
    onDelete: "cascade",
  }),
  answerText: text("answer_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const qaCitation = pgTable(
  "qa_citation",
  {
    answerId: text("answer_id")
      .notNull()
      .references(() => qaAnswer.answerId, {
        onDelete: "cascade",
      }),
    chunkId: text("chunk_id")
      .notNull()
      .references(() => transcriptChunk.chunkId),
    startSec: numeric("start_sec"),
    endSec: numeric("end_sec"),
    rank: integer("rank"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.answerId, t.chunkId] }),
  }),
);

export const qaFeedback = pgTable("qa_feedback", {
  feedbackId: integer("feedback_id").primaryKey().generatedAlwaysAsIdentity(),
  queryId: text("query_id").references(() => qaQuery.queryId, {
    onDelete: "cascade",
  }),
  signal: text("signal").$type<"helpful" | "unhelpful" | "better_clip">(),
  altChunkId: text("alt_chunk_id").references(() => transcriptChunk.chunkId),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Relations
export const podcastRelations = relations(podcast, ({ many }) => ({
  episodes: many(episode),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  podcast: one(podcast, {
    fields: [episode.podcastId],
    references: [podcast.id],
  }),
  transcriptChunks: many(transcriptChunk),
  starterQuestions: many(starterQuestion),
}));

export const starterQuestionRelations = relations(
  starterQuestion,
  ({ one }) => ({
    episode: one(episode, {
      fields: [starterQuestion.episodeId],
      references: [episode.id],
    }),
  }),
);

export const transcriptChunkRelations = relations(
  transcriptChunk,
  ({ one }) => ({
    episode: one(episode, {
      fields: [transcriptChunk.episodeId],
      references: [episode.id],
    }),
  }),
);
