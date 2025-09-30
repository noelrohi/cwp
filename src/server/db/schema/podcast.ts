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
    description: text("description"),
    itunesSummary: text("itunes_summary"),
    contentEncoded: text("content_encoded"),
    creator: text("creator"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    audioUrl: text("audio_url"),
    transcriptUrl: text("transcript_url"),
    thumbnailUrl: text("thumbnail_url"),
    // iTunes namespace fields
    itunesTitle: text("itunes_title"),
    itunesEpisodeType: text("itunes_episode_type"), // full, trailer, bonus
    itunesEpisode: integer("itunes_episode"), // episode number
    itunesKeywords: text("itunes_keywords"), // comma-separated
    itunesExplicit: text("itunes_explicit"), // true, false, clean
    itunesImage: text("itunes_image"), // episode-specific artwork
    // Standard RSS fields
    link: text("link"), // episode webpage
    author: text("author"), // episode author
    comments: text("comments"), // comments URL
    category: text("category"), // episode categories
    // Dublin Core namespace
    dcCreator: text("dc_creator"), // content creator
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
    title: text("title"),
    summary: text("summary"),
    excerpt: text("excerpt"),
    speakerName: text("speaker_name"),
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

// Simple behavioral preferences - no embeddings needed
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    totalSaved: integer("total_saved").default(0).notNull(),
    totalSkipped: integer("total_skipped").default(0).notNull(),
    // Simple behavioral tracking
    preferredPodcasts: text("preferred_podcasts"), // JSON array of podcast IDs
    preferredSpeakers: text("preferred_speakers"), // JSON array of speaker names
    preferredContentLength: text("preferred_content_length")
      .$type<"short" | "medium" | "long">()
      .default("medium"),
    averageEngagementScore: doublePrecision("average_engagement_score").default(
      0.5,
    ),
    lastUpdated: timestamp("last_updated", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index().on(table.userId)],
);

// AI-powered speaker identification cache
export const episodeSpeakerMapping = pgTable(
  "episode_speaker_mapping",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .references(() => episode.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    speakerMappings: text("speaker_mappings").notNull(), // JSON: {"0": "John Doe", "1": "Jane Smith"}
    confidence: doublePrecision("confidence").notNull(), // 0.0 to 1.0
    sourceDescription: text("source_description"), // Original RSS description used
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index().on(table.episodeId)],
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
    highlightExtractedQuote: text("highlight_extracted_quote"),
    highlightExtractedAt: timestamp("highlight_extracted_at", {
      withTimezone: true,
    }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.savedAt),
    index().on(table.highlightExtractedAt),
  ],
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
  speakerMapping: one(episodeSpeakerMapping),
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

export const episodeSpeakerMappingRelations = relations(
  episodeSpeakerMapping,
  ({ one }) => ({
    episode: one(episode, {
      fields: [episodeSpeakerMapping.episodeId],
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
