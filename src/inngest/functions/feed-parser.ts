import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { db } from "@/server/db";
import { article, articleFeed, episode, podcast } from "@/server/db/schema";
import { inngest } from "../client";

// Circuit breaker settings
const FEED_FAILURE_THRESHOLD = 3;
const FEED_COOLDOWN_HOURS = 24;
const failedFeeds = new Map<string, { count: number; lastFailed: Date }>();

// Event types - Podcasts
const REFRESH_PODCAST_FEED_EVENT = "app/feed-parser.podcast.refresh" as const;
const BULK_REFRESH_FEEDS_EVENT = "app/feed-parser.bulk.refresh" as const;

// Event types - Articles
const REFRESH_ARTICLE_FEED_EVENT = "app/feed-parser.article.refresh" as const;
const BULK_REFRESH_ARTICLE_FEEDS_EVENT =
  "app/feed-parser.article-bulk.refresh" as const;

type RefreshPodcastFeedEvent = {
  podcastId: string;
};

type RefreshArticleFeedEvent = {
  feedId: string;
};

type BulkRefreshFeedsEvent = {
  userId?: string; // Optional: refresh only feeds for a specific user
};

/**
 * Refresh a single podcast feed
 * Triggered when: user adds podcast, manual refresh, or as part of bulk refresh
 */
export const refreshPodcastFeed = inngest.createFunction(
  {
    id: "refresh-podcast-feed",
    retries: 3,
  },
  { event: REFRESH_PODCAST_FEED_EVENT },
  async ({ event, step, logger }) => {
    const { podcastId } = event.data as RefreshPodcastFeedEvent;

    logger.info(`Refreshing feed for podcast ${podcastId}`);

    const podcastRecord = await step.run("fetch-podcast", async () => {
      return await db.query.podcast.findFirst({
        where: eq(podcast.id, podcastId),
        columns: {
          id: true,
          userId: true,
          feedUrl: true,
          title: true,
        },
      });
    });

    if (!podcastRecord) {
      logger.error(`Podcast ${podcastId} not found`);
      return { status: "missing" } as const;
    }

    if (!podcastRecord.feedUrl) {
      logger.error(`Podcast ${podcastId} has no feed URL`);
      return { status: "no-feed-url" } as const;
    }

    // Check circuit breaker
    const failureInfo = failedFeeds.get(podcastRecord.feedUrl);
    if (failureInfo && failureInfo.count >= FEED_FAILURE_THRESHOLD) {
      const hoursSinceLastFailure =
        (Date.now() - failureInfo.lastFailed.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastFailure < FEED_COOLDOWN_HOURS) {
        logger.info(
          `Podcast ${podcastId} feed in cooldown for ${FEED_COOLDOWN_HOURS - hoursSinceLastFailure} more hours`,
        );
        return {
          status: "cooldown",
          remainingHours: FEED_COOLDOWN_HOURS - hoursSinceLastFailure,
        } as const;
      } else {
        // Reset failure count after cooldown
        failedFeeds.delete(podcastRecord.feedUrl);
      }
    }

    try {
      const episodesUpserted = await step.run("parse-feed", async () => {
        return await parseFeedAndUpsertEpisodes(podcastRecord);
      });

      // Reset failure count on success
      failedFeeds.delete(podcastRecord.feedUrl);

      logger.info(
        `Successfully refreshed podcast ${podcastRecord.title}: ${episodesUpserted} episodes upserted`,
      );

      return {
        status: "success",
        episodesUpserted,
      } as const;
    } catch (error) {
      // Track feed failure for circuit breaker
      const current = failedFeeds.get(podcastRecord.feedUrl) || {
        count: 0,
        lastFailed: new Date(),
      };
      failedFeeds.set(podcastRecord.feedUrl, {
        count: current.count + 1,
        lastFailed: new Date(),
      });

      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to refresh podcast ${podcastRecord.title}`, {
        error: err.message,
        podcastId: podcastRecord.id,
        feedUrl: podcastRecord.feedUrl,
        failureCount: failedFeeds.get(podcastRecord.feedUrl)?.count || 1,
      });

      throw err;
    }
  },
);

/**
 * Bulk refresh all podcast feeds (or feeds for a specific user)
 * Triggered by: daily cron at 2 AM UTC, or manually via event
 */
export const bulkRefreshFeeds = inngest.createFunction(
  {
    id: "bulk-refresh-feeds",
    concurrency: 5, // Process 5 feeds simultaneously
  },
  [
    { cron: "0 2 * * *" }, // Run daily at 2 AM UTC
    { event: BULK_REFRESH_FEEDS_EVENT },
  ],
  async ({ event, step, logger }) => {
    const { userId } = (event.data || {}) as BulkRefreshFeedsEvent;
    const pipelineRunId = randomUUID();

    logger.info(
      `Bulk refreshing feeds${userId ? ` for user ${userId}` : " for all users"} (run=${pipelineRunId})`,
    );

    const podcasts = await step.run("fetch-podcasts", async () => {
      return await db
        .select({
          id: podcast.id,
          userId: podcast.userId,
          feedUrl: podcast.feedUrl,
          title: podcast.title,
        })
        .from(podcast)
        .where(
          userId
            ? sql`${podcast.userId} = ${userId} AND ${podcast.feedUrl} IS NOT NULL AND ${podcast.feedUrl} != ''`
            : sql`${podcast.feedUrl} IS NOT NULL AND ${podcast.feedUrl} != ''`,
        );
    });

    if (podcasts.length === 0) {
      logger.info("No podcasts with feed URLs found");
      return {
        pipelineRunId,
        podcastsDispatched: 0,
      };
    }

    // Dispatch individual refresh events for each podcast
    await step.sendEvent(
      "dispatch-feed-refreshes",
      podcasts.map((p) => ({
        name: REFRESH_PODCAST_FEED_EVENT,
        data: {
          podcastId: p.id,
        } satisfies RefreshPodcastFeedEvent,
      })),
    );

    logger.info(
      `Pipeline run ${pipelineRunId}: dispatched ${podcasts.length} podcast feeds for refresh`,
    );

    return {
      pipelineRunId,
      podcastsDispatched: podcasts.length,
    };
  },
);

async function parseFeedAndUpsertEpisodes(podcastRecord: {
  id: string;
  userId: string;
  feedUrl: string | null;
  title: string | null;
}): Promise<number> {
  if (!podcastRecord.feedUrl) return 0;

  // Get existing episodes to avoid duplicates
  const existingEpisodes = await db.query.episode.findMany({
    where: eq(episode.podcastId, podcastRecord.id),
    columns: {
      episodeId: true,
    },
  });

  const episodeIdPrefix = `${podcastRecord.id}:`;
  const existingEpisodeIds = new Set<string>();

  for (const existingEpisode of existingEpisodes) {
    if (!existingEpisode.episodeId) continue;

    existingEpisodeIds.add(existingEpisode.episodeId);

    if (!existingEpisode.episodeId.startsWith(episodeIdPrefix)) {
      existingEpisodeIds.add(`${episodeIdPrefix}${existingEpisode.episodeId}`);
    }
  }

  // Helper function to get episode identifier (copied from podcasts router)
  const getEpisodeIdentifier = (item: unknown): string => {
    if (!item || typeof item !== "object") {
      return nanoid();
    }

    const candidateFromGuid = (() => {
      const guid = (item as { guid?: unknown }).guid;

      if (typeof guid === "string" && guid.trim()) {
        return guid.trim();
      }

      if (guid && typeof guid === "object") {
        if (
          "_" in (guid as Record<string, unknown>) &&
          typeof (guid as { _: unknown })._ === "string" &&
          (guid as { _: string })._.trim()
        ) {
          return (guid as { _: string })._.trim();
        }

        if (
          "text" in (guid as Record<string, unknown>) &&
          typeof (guid as { text: unknown }).text === "string" &&
          (guid as { text: string }).text.trim()
        ) {
          return (guid as { text: string }).text.trim();
        }
      }

      return null;
    })();

    if (candidateFromGuid) {
      return candidateFromGuid;
    }

    const candidateFromLink = (item as { link?: unknown }).link;
    if (typeof candidateFromLink === "string" && candidateFromLink.trim()) {
      return candidateFromLink.trim();
    }

    const candidateFromId = (item as { id?: unknown }).id;
    if (typeof candidateFromId === "string" && candidateFromId.trim()) {
      return candidateFromId.trim();
    }

    const candidateFromTitle = item as {
      title?: unknown;
      pubDate?: unknown;
    };
    if (
      candidateFromTitle &&
      typeof candidateFromTitle.title === "string" &&
      candidateFromTitle.title.trim()
    ) {
      const pubDateValue =
        typeof candidateFromTitle.pubDate === "string"
          ? candidateFromTitle.pubDate
          : "";
      return `${candidateFromTitle.title.trim()}_${pubDateValue}`;
    }

    return nanoid();
  };

  // Parse RSS feed with exponential backoff retry
  const parser = new Parser({
    timeout: 10000, // 10 second timeout
  });
  // biome-ignore lint/suspicious/noExplicitAny: Using same pattern as existing code
  let feedData: any;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      feedData = await parser.parseURL(podcastRecord.feedUrl);
      break; // Success, exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to parse RSS feed after ${maxRetries} attempts: ${lastError.message}`,
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = 2 ** (attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // Process episodes in batches (same logic as podcasts router)
  const batchSize = 10;
  const totalItems = feedData.items?.length || 0;
  let processedCount = 0;

  for (let i = 0; i < totalItems; i += batchSize) {
    const batch = feedData.items.slice(i, i + batchSize);

    // biome-ignore lint/suspicious/noExplicitAny: Using same pattern as existing code
    const episodesToInsert = batch.flatMap((item: any) => {
      const episodeIdentifier = getEpisodeIdentifier(item);
      const normalizedEpisodeId = `${episodeIdPrefix}${episodeIdentifier}`;

      // Process all episodes now - we'll use upsert to handle existing ones
      // if (existingEpisodeIds.has(normalizedEpisodeId)) {
      //   return [];
      // }

      existingEpisodeIds.add(normalizedEpisodeId);

      // Extract duration from itunes:duration or other sources (same as podcasts router)
      let durationSec: number | null = null;
      if (item.itunes?.duration) {
        const duration = item.itunes.duration;
        if (typeof duration === "string") {
          const parts = duration.split(":").map(Number);
          if (parts.length === 3) {
            durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          } else if (parts.length === 2) {
            durationSec = parts[0] * 60 + parts[1];
          } else if (parts.length === 1) {
            durationSec = parts[0];
          }
        }
      }

      return [
        {
          id: nanoid(),
          episodeId: normalizedEpisodeId,
          podcastId: podcastRecord.id,
          userId: podcastRecord.userId,
          title: item.title || "Untitled Episode",
          description:
            item.contentSnippet || item.content || item.summary || null,
          itunesSummary: item.itunes?.summary || null,
          contentEncoded:
            item["content:encoded"] || item.contentEncoded || null,
          creator: item["dc:creator"] || item.creator || null,
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          durationSec,
          audioUrl: item.enclosure?.url || null,
          thumbnailUrl: item.itunes?.image || null,
          transcriptUrl: null, // Not available in RSS feeds typically
          // iTunes namespace fields
          itunesTitle: item.itunes?.title || null,
          itunesEpisodeType: item.itunes?.episodeType || null,
          itunesEpisode: item.itunes?.episode
            ? Number(item.itunes.episode)
            : null,
          itunesKeywords: item.itunes?.keywords || null,
          itunesExplicit: item.itunes?.explicit || null,
          itunesImage: item.itunes?.image || null, // Episode-specific image
          // Standard RSS fields
          link: item.link || null,
          author: item.author || null,
          comments: item.comments || null,
          category: Array.isArray(item.categories)
            ? item.categories.join(", ")
            : item.category || null,
          // Dublin Core namespace
          dcCreator: item["dc:creator"] || null,
          status: "pending" as const, // Mark as pending for daily pipeline processing
        },
      ];
    });

    // Upsert episodes with enhanced RSS metadata using your efficient approach
    if (episodesToInsert.length > 0) {
      // Create dynamic set object for all fields except id and episodeId
      const setObject = Object.keys(episodesToInsert[0]).reduce(
        (acc, key) => {
          if (key !== "id" && key !== "episodeId") {
            // Convert camelCase to snake_case for database compatibility
            const columnName = key.replace(
              /[A-Z]/g,
              (letter) => `_${letter.toLowerCase()}`,
            );
            acc[columnName] = sql.raw(`excluded."${columnName}"`);
          }
          return acc;
        },
        {} as Record<string, unknown>,
      );

      await db.insert(episode).values(episodesToInsert).onConflictDoUpdate({
        target: episode.episodeId,
        set: setObject,
      });
    }

    processedCount += episodesToInsert.length;
  }

  return processedCount;
}

/**
 * Refresh a single article feed
 * Triggered when: user adds feed, manual refresh, or as part of bulk refresh
 */
export const refreshArticleFeed = inngest.createFunction(
  {
    id: "refresh-article-feed",
    retries: 3,
  },
  { event: REFRESH_ARTICLE_FEED_EVENT },
  async ({ event, step, logger }) => {
    const { feedId } = event.data as RefreshArticleFeedEvent;

    logger.info(`Refreshing article feed ${feedId}`);

    const feedRecord = await step.run("fetch-article-feed", async () => {
      return await db.query.articleFeed.findFirst({
        where: eq(articleFeed.id, feedId),
        columns: {
          id: true,
          userId: true,
          feedUrl: true,
          title: true,
        },
      });
    });

    if (!feedRecord) {
      logger.error(`Article feed ${feedId} not found`);
      return { status: "missing" } as const;
    }

    // Check circuit breaker
    const failureInfo = failedFeeds.get(feedRecord.feedUrl);
    if (failureInfo && failureInfo.count >= FEED_FAILURE_THRESHOLD) {
      const hoursSinceLastFailure =
        (Date.now() - failureInfo.lastFailed.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastFailure < FEED_COOLDOWN_HOURS) {
        logger.info(
          `Article feed ${feedId} in cooldown for ${FEED_COOLDOWN_HOURS - hoursSinceLastFailure} more hours`,
        );
        return {
          status: "cooldown",
          remainingHours: FEED_COOLDOWN_HOURS - hoursSinceLastFailure,
        } as const;
      } else {
        // Reset failure count after cooldown
        failedFeeds.delete(feedRecord.feedUrl);
      }
    }

    try {
      const articlesUpserted = await step.run("parse-feed", async () => {
        return await parseFeedAndUpsertArticles(feedRecord);
      });

      // Reset failure count on success
      failedFeeds.delete(feedRecord.feedUrl);

      logger.info(
        `Successfully refreshed article feed ${feedRecord.title}: ${articlesUpserted} articles upserted`,
      );

      return {
        status: "success",
        articlesUpserted,
      } as const;
    } catch (error) {
      // Track feed failure for circuit breaker
      const current = failedFeeds.get(feedRecord.feedUrl) || {
        count: 0,
        lastFailed: new Date(),
      };
      failedFeeds.set(feedRecord.feedUrl, {
        count: current.count + 1,
        lastFailed: new Date(),
      });

      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to refresh article feed ${feedRecord.title}`, {
        error: err.message,
        feedId: feedRecord.id,
        feedUrl: feedRecord.feedUrl,
        failureCount: failedFeeds.get(feedRecord.feedUrl)?.count || 1,
      });

      throw err;
    }
  },
);

/**
 * Bulk refresh all article feeds (or feeds for a specific user)
 * Triggered by: daily cron at 2 AM UTC, or manually via event
 */
export const bulkRefreshArticleFeeds = inngest.createFunction(
  {
    id: "bulk-refresh-article-feeds",
    concurrency: 5, // Process 5 feeds simultaneously
  },
  [
    { cron: "0 2 * * *" }, // Run daily at 2 AM UTC
    { event: BULK_REFRESH_ARTICLE_FEEDS_EVENT },
  ],
  async ({ event, step, logger }) => {
    const { userId } = (event.data || {}) as BulkRefreshFeedsEvent;
    const pipelineRunId = randomUUID();

    logger.info(
      `Bulk refreshing article feeds${userId ? ` for user ${userId}` : " for all users"} (run=${pipelineRunId})`,
    );

    const feeds = await step.run("fetch-article-feeds", async () => {
      return await db
        .select({
          id: articleFeed.id,
          userId: articleFeed.userId,
          feedUrl: articleFeed.feedUrl,
          title: articleFeed.title,
        })
        .from(articleFeed)
        .where(userId ? sql`${articleFeed.userId} = ${userId}` : sql`1=1`);
    });

    if (feeds.length === 0) {
      logger.info("No article feeds found");
      return {
        pipelineRunId,
        feedsDispatched: 0,
      };
    }

    // Dispatch individual refresh events for each article feed
    await step.sendEvent(
      "dispatch-article-feed-refreshes",
      feeds.map((f) => ({
        name: REFRESH_ARTICLE_FEED_EVENT,
        data: {
          feedId: f.id,
        } satisfies RefreshArticleFeedEvent,
      })),
    );

    logger.info(
      `Pipeline run ${pipelineRunId}: dispatched ${feeds.length} article feeds for refresh`,
    );

    return {
      pipelineRunId,
      feedsDispatched: feeds.length,
    };
  },
);

async function parseFeedAndUpsertArticles(feedRecord: {
  id: string;
  userId: string;
  feedUrl: string;
  title: string | null;
}): Promise<number> {
  // Parse RSS feed with exponential backoff retry
  const parser = new Parser({
    timeout: 10000, // 10 second timeout
  });
  // biome-ignore lint/suspicious/noExplicitAny: Using same pattern as existing code
  let feedData: any;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      feedData = await parser.parseURL(feedRecord.feedUrl);
      break; // Success, exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to parse RSS feed after ${maxRetries} attempts: ${lastError.message}`,
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = 2 ** (attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // Extract all URLs from feed items
  const feedUrls = (feedData.items || [])
    .filter((item: any) => item.link)
    .map((item: any) => item.link as string);

  if (feedUrls.length === 0) {
    return 0;
  }

  // Batch query: fetch all existing articles for these URLs in ONE query
  const existingArticles = await db.query.article.findMany({
    where: and(
      eq(article.userId, feedRecord.userId),
      inArray(article.url, feedUrls),
    ),
    columns: {
      url: true,
    },
  });

  // Create a Set for O(1) lookup
  const existingUrls = new Set(existingArticles.map((a) => a.url));

  // Filter to only new articles
  const newArticleData = (feedData.items || [])
    .filter((item: any) => item.link && !existingUrls.has(item.link))
    .map((item: any) => ({
      id: nanoid(),
      userId: feedRecord.userId,
      feedId: feedRecord.id,
      url: item.link as string,
      title: item.title || "Untitled Article",
      author: item.creator || item.author || null,
      excerpt: item.contentSnippet || item.content || null,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      status: "pending" as const,
    }));

  // Batch insert: insert all new articles in ONE query
  let newArticles = 0;
  if (newArticleData.length > 0) {
    await db.insert(article).values(newArticleData).onConflictDoNothing();
    newArticles = newArticleData.length;
  }

  return newArticles;
}
