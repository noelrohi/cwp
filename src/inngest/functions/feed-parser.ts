import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { db } from "@/server/db";
import { episode, podcast } from "@/server/db/schema";
import { inngest } from "../client";

// Circuit breaker settings
const FEED_FAILURE_THRESHOLD = 3;
const FEED_COOLDOWN_HOURS = 24;
const failedFeeds = new Map<string, { count: number; lastFailed: Date }>();

/**
 * Feed Parser Pipeline - 1:00 AM (1 hour before daily intelligence)
 * Fetches and parses all podcast feeds, upserting new episodes
 */
export const feedParserPipeline = inngest.createFunction(
  {
    id: "feed-parser-pipeline",
    retries: 3,
    concurrency: 10, // Process 10 feeds simultaneously
  },
  { cron: "0 1 * * *" }, // Run at 1:00 AM daily
  async ({ step, logger }) => {
    const now = new Date();
    const pipelineRunId = randomUUID();

    logger.info(`Running feed parser pipeline (run=${pipelineRunId})`);

    // Get all podcasts with feed URLs, filtering out recently failed ones
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
          sql`${podcast.feedUrl} IS NOT NULL AND ${podcast.feedUrl} != ''`,
        );
    });

    // Filter out feeds that are in cooldown due to repeated failures
    const activePodcasts = podcasts.filter((p) => {
      if (!p.feedUrl) return false;

      const failureInfo = failedFeeds.get(p.feedUrl);
      if (!failureInfo) return true;

      if (failureInfo.count >= FEED_FAILURE_THRESHOLD) {
        const hoursSinceLastFailure =
          (now.getTime() - failureInfo.lastFailed.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastFailure < FEED_COOLDOWN_HOURS) {
          logger.info(
            `Skipping feed ${p.feedUrl} - in cooldown for ${FEED_COOLDOWN_HOURS - hoursSinceLastFailure} more hours`,
          );
          return false;
        } else {
          // Reset failure count after cooldown
          failedFeeds.delete(p.feedUrl);
          return true;
        }
      }

      return true;
    });

    if (activePodcasts.length === 0) {
      logger.info("No active podcasts with feed URLs found");
      return {
        date: now.toISOString().split("T")[0],
        pipelineRunId,
        podcastsProcessed: 0,
        episodesUpserted: 0,
        skippedFeeds: podcasts.length - activePodcasts.length,
      };
    }

    let totalEpisodesUpserted = 0;
    let successfulFeeds = 0;
    let failedFeedsCount = 0;

    // Process each podcast feed
    for (const podcastRecord of activePodcasts) {
      if (!podcastRecord.feedUrl) continue;

      try {
        const episodesUpserted = await step.run(
          `parse-feed-${podcastRecord.id}`,
          async () => {
            return await parseFeedAndUpsertEpisodes(podcastRecord);
          },
        );

        totalEpisodesUpserted += episodesUpserted;
        successfulFeeds++;

        // Reset failure count on success
        if (podcastRecord.feedUrl) {
          failedFeeds.delete(podcastRecord.feedUrl);
        }

        logger.info(
          `Pipeline run ${pipelineRunId}: processed ${episodesUpserted} episodes for podcast ${podcastRecord.title}`,
        );
      } catch (error) {
        failedFeedsCount++;

        // Track feed failure for circuit breaker
        if (podcastRecord.feedUrl) {
          const current = failedFeeds.get(podcastRecord.feedUrl) || {
            count: 0,
            lastFailed: new Date(),
          };
          failedFeeds.set(podcastRecord.feedUrl, {
            count: current.count + 1,
            lastFailed: now,
          });
        }

        logger.error(
          `Pipeline run ${pipelineRunId}: failed to process podcast ${podcastRecord.title}`,
          {
            error: error instanceof Error ? error.message : String(error),
            podcastId: podcastRecord.id,
            feedUrl: podcastRecord.feedUrl,
            failureCount: podcastRecord.feedUrl
              ? failedFeeds.get(podcastRecord.feedUrl)?.count || 1
              : 1,
          },
        );
        // Continue processing other podcasts even if one fails
      }
    }

    logger.info(
      `Pipeline run ${pipelineRunId}: processed ${activePodcasts.length} podcasts (${successfulFeeds} successful, ${failedFeedsCount} failed), upserted ${totalEpisodesUpserted} episodes`,
    );

    return {
      date: now.toISOString().split("T")[0],
      pipelineRunId,
      podcastsProcessed: activePodcasts.length,
      episodesUpserted: totalEpisodesUpserted,
      successfulFeeds,
      failedFeeds: failedFeedsCount,
      skippedFeeds: podcasts.length - activePodcasts.length,
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
