import { relations } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

export type PatternEntityJson = {
  label: string;
  category: string;
  confidence?: number | null;
};

export type PatternClaimJson = {
  quote: string;
  speaker?: string | null;
  timestamp?: number | null;
  confidence?: number | null;
};

export type PatternMetadataJson = Record<string, unknown> | null;

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
  },
  (table) => [index().on(table.userId)],
);

export const patternStatusEnum = pgEnum("pattern_status", [
  "pending",
  "completed",
  "failed",
]);

export const patternEvidenceTypeEnum = pgEnum("pattern_evidence_type", [
  "entity",
  "claim",
]);

export const pattern = pgTable(
  "pattern",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    episodeId: text("episode_id").references(() => episode.id, {
      onDelete: "set null",
    }),
    patternDate: date("pattern_date").notNull(),
    status: patternStatusEnum("status").default("pending").notNull(),
    title: text("title").notNull(),
    synthesis: text("synthesis").notNull(),
    entities: jsonb("entities").$type<PatternEntityJson[] | null>(),
    claims: jsonb("claims").$type<PatternClaimJson[] | null>(),
    metadata: jsonb("metadata").$type<PatternMetadataJson>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.patternDate),
    index().on(table.episodeId),
  ],
);

export const patternEvidence = pgTable(
  "pattern_evidence",
  {
    id: text("id").primaryKey(),
    patternId: text("pattern_id")
      .references(() => pattern.id, { onDelete: "cascade" })
      .notNull(),
    episodeId: text("episode_id")
      .references(() => episode.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull(),
    speaker: text("speaker"),
    content: text("content").notNull(),
    evidenceType: patternEvidenceTypeEnum("evidence_type")
      .default("entity")
      .notNull(),
    entityLabel: text("entity_label"),
    entityCategory: text("entity_category"),
    confidence: doublePrecision("confidence"),
    showAtSec: integer("show_at_sec"),
    endAtSec: integer("end_at_sec"),
    episodeTitle: text("episode_title"),
    podcastTitle: text("podcast_title"),
    podcastSeries: text("podcast_series"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index().on(table.patternId),
    index().on(table.episodeId),
    index().on(table.userId),
  ],
);

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
  evidences: many(patternEvidence),
  patterns: many(pattern),
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

export const patternRelations = relations(pattern, ({ one, many }) => ({
  evidences: many(patternEvidence),
  episode: one(episode, {
    fields: [pattern.episodeId],
    references: [episode.id],
  }),
}));

export const patternEvidenceRelations = relations(
  patternEvidence,
  ({ one }) => ({
    pattern: one(pattern, {
      fields: [patternEvidence.patternId],
      references: [pattern.id],
    }),
    episode: one(episode, {
      fields: [patternEvidence.episodeId],
      references: [episode.id],
    }),
  }),
);
