import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./auth";
import { article, episode } from "./podcast";

// Meta Signals - curated content cards for framebreak.com
export const metaSignalStatusEnum = pgEnum("meta_signal_status", [
  "draft",
  "ready",
  "published",
]);

export const metaSignalMediaTypeEnum = pgEnum("meta_signal_media_type", [
  "text",
  "image",
  "carousel",
  "video",
  "clip",
]);

export const metaSignal = pgTable(
  "meta_signal",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    episodeId: text("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    articleId: text("article_id").references(() => article.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Content - LLM-generated, user-editable
    title: text("title"),
    summary: text("summary"),
    manualNotes: text("manual_notes"),

    // Media support for Twitter-like feed
    mediaType: metaSignalMediaTypeEnum("media_type").default("text").notNull(),
    mediaUrls: jsonb("media_urls").$type<string[]>(), // Array of media URLs
    mediaMetadata: jsonb("media_metadata").$type<{
      thumbnails?: string[];
      durations?: number[];
      altTexts?: string[];
    }>(),

    // Video clip support
    clipUrl: text("clip_url"), // Vercel Blob URL for generated clip
    clipThumbnailUrl: text("clip_thumbnail_url"), // Thumbnail for clip
    timestampStart: doublePrecision("timestamp_start"), // Clip start time in seconds
    timestampEnd: doublePrecision("timestamp_end"), // Clip end time in seconds

    // Publishing
    status: metaSignalStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedToFeed: integer("published_to_feed").default(0).notNull(), // boolean as int

    // Engagement metrics (for future)
    viewCount: integer("view_count").default(0).notNull(),
    likeCount: integer("like_count").default(0).notNull(),

    // Provenance - track which LLM/prompt generated this
    llmModel: text("llm_model"),
    llmPromptVersion: text("llm_prompt_version"),

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
    index().on(table.episodeId),
    index().on(table.articleId),
    index().on(table.status),
    index().on(table.publishedAt),
    check(
      "meta_signal_source_check",
      sql`(
        (episode_id IS NOT NULL AND article_id IS NULL) OR
        (episode_id IS NULL AND article_id IS NOT NULL)
      )`,
    ),
  ],
);

// Note: metaSignalQuote table removed - clips are self-contained and don't need quote references

// User likes for meta signals (Twitter-like engagement)
export const metaSignalLike = pgTable(
  "meta_signal_like",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    metaSignalId: text("meta_signal_id")
      .notNull()
      .references(() => metaSignal.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.metaSignalId),
    unique().on(table.userId, table.metaSignalId),
  ],
);

// Relations
export const metaSignalRelations = relations(metaSignal, ({ one, many }) => ({
  episode: one(episode, {
    fields: [metaSignal.episodeId],
    references: [episode.id],
  }),
  article: one(article, {
    fields: [metaSignal.articleId],
    references: [article.id],
  }),
  likes: many(metaSignalLike),
}));

export const metaSignalLikeRelations = relations(metaSignalLike, ({ one }) => ({
  user: one(user, {
    fields: [metaSignalLike.userId],
    references: [user.id],
  }),
  metaSignal: one(metaSignal, {
    fields: [metaSignalLike.metaSignalId],
    references: [metaSignal.id],
  }),
}));
