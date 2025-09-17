import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Core entities
export const category = pgTable("category", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull().unique(),
  categoryName: text("category_name").notNull(),
  categoryDisplayName: text("category_display_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const podcast = pgTable("podcast", {
  id: text("id").primaryKey(),
  podcastId: text("podcast_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  websiteUrl: text("website_url"),
  rssUrl: text("rss_url"),
  language: text("language"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const person = pgTable("person", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio"),
  imageUrl: text("image_url"),
  websiteUrl: text("website_url"),
  twitterHandle: text("twitter_handle"),
  linkedinUrl: text("linkedin_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const company = pgTable("company", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  websiteUrl: text("website_url"),
  industry: text("industry"),
  founded: integer("founded"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const book = pgTable("book", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  isbn: text("isbn"),
  publishedYear: integer("published_year"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  amazonUrl: text("amazon_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const topic = pgTable("topic", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const quote = pgTable("quote", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  context: text("context"),
  timestamp: integer("timestamp"), // Timestamp in episode
  speakerId: text("speaker_id").references(() => person.id),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const episode = pgTable("episode", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().unique(),
  episodeGuid: text("episode_guid").notNull(),
  episodeTitle: text("episode_title").notNull(),
  episodeUrl: text("episode_url").notNull(),
  episodeAudioUrl: text("episode_audio_url").notNull(),
  episodeImageUrl: text("episode_image_url"),
  episodeDuration: integer("episode_duration").notNull(),
  episodeWordCount: integer("episode_word_count").notNull(),
  episodeHasGuests: boolean("episode_has_guests"),
  episodeHasSponsors: boolean("episode_has_sponsors"),
  episodeFullyProcessed: boolean("episode_fully_processed"),
  episodeTranscript: text("episode_transcript"),
  episodeDescription: text("episode_description"),
  episodePermalink: text("episode_permalink"),
  podcastId: text("podcast_id").notNull(), // Remove FK constraint for now
  postedAt: timestamp("posted_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Junction tables for many-to-many relationships
export const episodeCategory = pgTable("episode_category", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => category.categoryId),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const episodePerson = pgTable("episode_person", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  personId: text("person_id")
    .notNull()
    .references(() => person.id),
  role: text("role").notNull(), // 'host', 'guest', 'co-host'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const episodeCompany = pgTable("episode_company", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  companyId: text("company_id")
    .notNull()
    .references(() => company.id),
  mentionType: text("mention_type"), // 'sponsor', 'mentioned', 'featured'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const episodeBook = pgTable("episode_book", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  bookId: text("book_id")
    .notNull()
    .references(() => book.id),
  mentionContext: text("mention_context"), // Context of how the book was mentioned
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const episodeTopic = pgTable("episode_topic", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  topicId: text("topic_id")
    .notNull()
    .references(() => topic.id),
  relevanceScore: real("relevance_score"), // 0.0-1.0 score of how relevant the topic is
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const podcastHost = pgTable("podcast_host", {
  id: text("id").primaryKey(),
  podcastId: text("podcast_id").notNull(), // Remove FK constraint for now
  personId: text("person_id")
    .notNull()
    .references(() => person.id),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const episodeSegment = pgTable("episode_segment", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  segmentId: integer("segment_id").notNull(), // Original segment ID from API
  seek: integer("seek").notNull(),
  startTime: real("start_time").notNull(), // Start time in seconds
  endTime: real("end_time").notNull(), // End time in seconds
  text: text("text").notNull(), // Segment text content
  temperature: real("temperature"),
  avgLogprob: real("avg_logprob"),
  compressionRatio: real("compression_ratio"),
  noSpeechProb: real("no_speech_prob"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const episodeWordTimestamp = pgTable("episode_word_timestamp", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episode.id, { onDelete: "cascade" }),
  segmentId: text("segment_id").references(() => episodeSegment.id, {
    onDelete: "cascade",
  }), // Link to segment
  word: text("word").notNull(),
  startTime: real("start_time").notNull(), // Start time in seconds
  endTime: real("end_time").notNull(), // End time in seconds
  confidence: real("confidence"), // Confidence score 0.0-1.0
  wordIndex: integer("word_index").notNull(), // Order of word in transcript
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
