import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { db } from "@/server/db";
import { episode, podcast } from "@/server/db/schema";
import { inngest } from "../client";

/**
 * Feed Parser Pipeline - 1:00 AM (1 hour before daily intelligence)
 * Fetches and parses all podcast feeds, upserting new episodes
 */
export const feedParserPipeline = inngest.createFunction(
  { id: "feed-parser-pipeline" },
  { cron: "0 1 * * *" }, // Run at 1:00 AM daily
  async ({ step, logger }) => {
    const now = new Date();
    const pipelineRunId = randomUUID();

    logger.info(`Running feed parser pipeline (run=${pipelineRunId})`);

    // Get all podcasts with feed URLs
    const podcasts = await step.run("fetch-podcasts", async () => {
      return await db
        .select({
          id: podcast.id,
          userId: podcast.userId,
          feedUrl: podcast.feedUrl,
          title: podcast.title,
        })
        .from(podcast)
        .where(eq(podcast.feedUrl, podcast.feedUrl)); // Only get podcasts with feed URLs
    });

    if (podcasts.length === 0) {
      logger.info("No podcasts with feed URLs found");
      return {
        date: now.toISOString().split("T")[0],
        pipelineRunId,
        podcastsProcessed: 0,
        episodesUpserted: 0,
      };
    }

    let totalEpisodesUpserted = 0;

    // Process each podcast feed
    for (const podcastRecord of podcasts) {
      if (!podcastRecord.feedUrl) continue;

      try {
        const episodesUpserted = await step.run(
          `parse-feed-${podcastRecord.id}`,
          async () => {
            return await parseFeedAndUpsertEpisodes(podcastRecord);
          },
        );

        totalEpisodesUpserted += episodesUpserted;
        logger.info(
          `Pipeline run ${pipelineRunId}: processed ${episodesUpserted} episodes for podcast ${podcastRecord.title}`,
        );
      } catch (error) {
        logger.error(
          `Pipeline run ${pipelineRunId}: failed to process podcast ${podcastRecord.title}`,
          {
            error: error instanceof Error ? error.message : String(error),
            podcastId: podcastRecord.id,
            feedUrl: podcastRecord.feedUrl,
          },
        );
        // Continue processing other podcasts even if one fails
      }
    }

    logger.info(
      `Pipeline run ${pipelineRunId}: processed ${podcasts.length} podcasts, upserted ${totalEpisodesUpserted} episodes`,
    );

    return {
      date: now.toISOString().split("T")[0],
      pipelineRunId,
      podcastsProcessed: podcasts.length,
      episodesUpserted: totalEpisodesUpserted,
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

  // Parse RSS feed using the same parser as in podcasts router
  const parser = new Parser();
  // biome-ignore lint/suspicious/noExplicitAny: Using same pattern as existing code
  let feedData: any;
  try {
    feedData = await parser.parseURL(podcastRecord.feedUrl);
  } catch (error) {
    throw new Error(
      `Failed to parse RSS feed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
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
