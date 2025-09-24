import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export const episodeRelations = relations(episode, ({ one }) => ({
  podcast: one(podcast, {
    fields: [episode.podcastId],
    references: [podcast.id],
  }),
}));
