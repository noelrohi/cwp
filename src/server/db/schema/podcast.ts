import { relations } from "drizzle-orm";
import {
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
    userId: text("user_id"),
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

export const episode = pgTable("episode", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().unique(),
  podcastId: text("podcast_id").references(() => podcast.id, {
    onDelete: "cascade",
  }),
  series: text("series"),
  title: text("title").notNull(),
  guest: text("guest"),
  hostName: text("host_name"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  language: text("language"),
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
});

export const podcastRelations = relations(podcast, ({ many }) => ({
  episodes: many(episode),
}));

export const transcriptChunk = pgTable("transcript_chunk", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .references(() => episode.id, { onDelete: "cascade" })
    .notNull(),
  speaker: text("speaker"),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }), // OpenAI text-embedding-3-small dimensions
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const episodeRelations = relations(episode, ({ one, many }) => ({
  podcast: one(podcast, {
    fields: [episode.podcastId],
    references: [podcast.id],
  }),
  transcriptChunks: many(transcriptChunk),
}));

export const savedChunk = pgTable("saved_chunk", {
  id: text("id").primaryKey(),
  chunkId: text("chunk_id")
    .references(() => transcriptChunk.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const userCentroid = pgTable("user_centroid", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  centroidEmbedding: vector("centroid_embedding", { dimensions: 1536 }),
  savedCount: integer("saved_count").default(0).notNull(),
  skippedCount: integer("skipped_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const transcriptChunkRelations = relations(
  transcriptChunk,
  ({ one }) => ({
    episode: one(episode, {
      fields: [transcriptChunk.episodeId],
      references: [episode.id],
    }),
  }),
);

export const savedChunkRelations = relations(savedChunk, ({ one }) => ({
  chunk: one(transcriptChunk, {
    fields: [savedChunk.chunkId],
    references: [transcriptChunk.id],
  }),
}));

export const userCentroidRelations = relations(userCentroid, ({ one }) => ({
  user: one(savedChunk, {
    fields: [userCentroid.userId],
    references: [savedChunk.userId],
  }),
}));
