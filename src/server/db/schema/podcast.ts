import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const episodeStatusEnum = pgEnum("episode_status", [
  "pending",
  "processing",
  "processed",
  "failed",
  "retrying",
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
    youtubePlaylistId: text("youtube_playlist_id"),
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
    transcriptSource: text("transcript_source"), // "youtube" | "deepgram" | null
    thumbnailUrl: text("thumbnail_url"),
    youtubeVideoId: text("youtube_video_id"),
    youtubeVideoUrl: text("youtube_video_url"),
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
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0).notNull(),
    lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
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
    index().on(table.status),
    index().on(table.podcastId),
  ],
);

// Articles/blog posts that users want to process
export const article = pgTable(
  "article",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    feedId: text("feed_id").references(() => articleFeed.id, {
      onDelete: "set null",
    }),
    url: text("url"),
    title: text("title").notNull(),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    siteName: text("site_name"),
    excerpt: text("excerpt"),
    rawContent: text("raw_content"),
    source: text("source").default("rss").notNull(),
    emailFrom: text("email_from"),
    readwiseId: text("readwise_id"),
    status: episodeStatusEnum("status").default("pending").notNull(),
    errorMessage: text("error_message"),
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
    index().on(table.status),
    index().on(table.feedId),
    index().on(table.source),
    index().on(table.readwiseId),
  ],
);

export const transcriptChunk = pgTable(
  "transcript_chunk",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .references(() => episode.id, {
        onDelete: "cascade",
      })
      .default(sql`NULL`),
    articleId: text("article_id")
      .references(() => article.id, {
        onDelete: "cascade",
      })
      .default(sql`NULL`),
    speaker: text("speaker").default(sql`NULL`),
    content: text("content").notNull(),
    startTimeSec: integer("start_time_sec").default(sql`NULL`),
    endTimeSec: integer("end_time_sec").default(sql`NULL`),
    wordCount: integer("word_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.episodeId),
    index().on(table.articleId),
    check(
      "chunk_source_check",
      sql`(
        (episode_id IS NOT NULL AND article_id IS NULL) OR
        (episode_id IS NULL AND article_id IS NOT NULL) OR
        (episode_id IS NULL AND article_id IS NULL)
      )`,
    ),
  ],
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

export const episodeSummary = pgTable(
  "episode_summary",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .references(() => episode.id, { onDelete: "cascade" })
      .unique(),
    articleId: text("article_id")
      .references(() => article.id, { onDelete: "cascade" })
      .unique(),
    markdownContent: text("markdown_content").notNull(),
    summaryGeneratedAt: timestamp("summary_generated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.episodeId),
    index().on(table.articleId),
    check(
      "summary_source_check",
      sql`(
        (episode_id IS NOT NULL AND article_id IS NULL) OR
        (episode_id IS NULL AND article_id IS NOT NULL)
      )`,
    ),
  ],
);

export const articleFeed = pgTable(
  "article_feed",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    feedUrl: text("feed_url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    metadata: text("metadata"),
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
    unique().on(table.userId, table.feedUrl),
  ],
);

export const favorite = pgTable(
  "favorite",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    episodeId: text("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    articleId: text("article_id").references(() => article.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.episodeId),
    index().on(table.articleId),
    unique().on(table.userId, table.episodeId),
    unique().on(table.userId, table.articleId),
    check(
      "favorite_source_check",
      sql`(
        (episode_id IS NOT NULL AND article_id IS NULL) OR
        (episode_id IS NULL AND article_id IS NOT NULL)
      )`,
    ),
  ],
);

// Export settings per user - tracks last export timestamp for incremental exports
export const userExportSettings = pgTable(
  "user_export_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    lastExportedAt: timestamp("last_exported_at", { withTimezone: true }),
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
  summary: one(episodeSummary),
}));

export const transcriptChunkRelations = relations(
  transcriptChunk,
  ({ one }) => ({
    episode: one(episode, {
      fields: [transcriptChunk.episodeId],
      references: [episode.id],
    }),
    article: one(article, {
      fields: [transcriptChunk.articleId],
      references: [article.id],
    }),
  }),
);

export const episodeSpeakerMappingRelations = relations(
  episodeSpeakerMapping,
  ({ one }) => ({
    episode: one(episode, {
      fields: [episodeSpeakerMapping.episodeId],
      references: [episode.id],
    }),
  }),
);

export const episodeSummaryRelations = relations(episodeSummary, ({ one }) => ({
  episode: one(episode, {
    fields: [episodeSummary.episodeId],
    references: [episode.id],
  }),
  article: one(article, {
    fields: [episodeSummary.articleId],
    references: [article.id],
  }),
}));

export const articleRelations = relations(article, ({ one, many }) => ({
  transcriptChunks: many(transcriptChunk),
  feed: one(articleFeed, {
    fields: [article.feedId],
    references: [articleFeed.id],
  }),
  summary: one(episodeSummary),
}));

export const articleFeedRelations = relations(articleFeed, ({ many }) => ({
  articles: many(article),
}));

export const favoriteRelations = relations(favorite, ({ one }) => ({
  episode: one(episode, {
    fields: [favorite.episodeId],
    references: [episode.id],
  }),
  article: one(article, {
    fields: [favorite.articleId],
    references: [article.id],
  }),
}));
