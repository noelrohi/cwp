import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

export const episodeStatusEnum = pgEnum("episode_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);

export const podcast = pgTable(
  "podcast",
  {
    id: text("id").primaryKey(),
    podcastId: text("podcast_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    feedUrl: text("feed_url"),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index().on(table.userId), index().on(table.podcastId)],
);

export const episode = pgTable(
  "episode",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id").notNull().unique(),
    podcastId: text("podcast_id").references(() => podcast.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    audioUrl: text("audio_url"),
    transcriptUrl: text("transcript_url"),
    thumbnailUrl: text("thumbnail_url"),
    status: episodeStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index().on(table.userId), index().on(table.status)],
);

export const transcriptChunk = pgTable(
  "transcript_chunk",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .references(() => episode.id, { onDelete: "cascade" })
      .notNull(),
    speaker: text("speaker"),
    content: text("content").notNull(),
    startTimeSec: integer("start_time_sec"),
    endTimeSec: integer("end_time_sec"),
    wordCount: integer("word_count"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.episodeId),
    index().using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

// Core feedback loop - this is what trains your model
export const dailySignal = pgTable(
  "daily_signal",
  {
    id: text("id").primaryKey(),
    chunkId: text("chunk_id")
      .references(() => transcriptChunk.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull(),
    signalDate: timestamp("signal_date", { withTimezone: true }).notNull(),
    relevanceScore: doublePrecision("relevance_score").notNull(), // 0.0 to 1.0
    userAction: text("user_action"), // "saved", "skipped", null (pending)
    presentedAt: timestamp("presented_at", { withTimezone: true }),
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.userId, table.signalDate),
    index().on(table.userAction),
    index().on(table.relevanceScore),
  ],
);

// Your personalization engine
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    centroidEmbedding: vector("centroid_embedding", { dimensions: 1536 }),
    totalSaved: integer("total_saved").default(0).notNull(),
    totalSkipped: integer("total_skipped").default(0).notNull(),
    lastUpdated: timestamp("last_updated", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.userId),
    index().using("hnsw", table.centroidEmbedding.op("vector_cosine_ops")),
  ],
);

// Optional: for saved items you want to reference later
export const savedChunk = pgTable(
  "saved_chunk",
  {
    id: text("id").primaryKey(),
    chunkId: text("chunk_id")
      .references(() => transcriptChunk.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull(),
    tags: text("tags"), // comma-separated, user-defined
    notes: text("notes"),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index().on(table.userId), index().on(table.savedAt)],
);

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
}));

export const transcriptChunkRelations = relations(
  transcriptChunk,
  ({ one, many }) => ({
    episode: one(episode, {
      fields: [transcriptChunk.episodeId],
      references: [episode.id],
    }),
    dailySignals: many(dailySignal),
    savedChunks: many(savedChunk),
  }),
);

export const dailySignalRelations = relations(dailySignal, ({ one }) => ({
  chunk: one(transcriptChunk, {
    fields: [dailySignal.chunkId],
    references: [transcriptChunk.id],
  }),
}));

export const savedChunkRelations = relations(savedChunk, ({ one }) => ({
  chunk: one(transcriptChunk, {
    fields: [savedChunk.chunkId],
    references: [transcriptChunk.id],
  }),
}));
