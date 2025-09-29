import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { z } from "zod";
import { episode, podcast } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const podcastsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ podcastId: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.podcast.findFirst({
        where: and(
          eq(podcast.id, input.podcastId),
          eq(podcast.userId, ctx.user.id),
        ),
        with: {
          episodes: {
            limit: 50,
            orderBy: [desc(episode.publishedAt)],
          },
        },
      });
      console.log({ result });

      if (!result) {
        throw new Error("Podcast not found");
      }

      return result;
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).optional().default(1),
          limit: z.number().int().min(1).max(50).optional().default(20),
          query: z.optional(z.string()),
          sortBy: z.enum(["date", "title"]).optional().default("date"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { page = 1, limit = 20, query, sortBy = "date" } = input ?? {};

      const orderBy =
        sortBy === "title" ? [asc(podcast.title)] : [desc(podcast.createdAt)];

      const results = await ctx.db.query.podcast.findMany({
        where: and(
          eq(podcast.userId, ctx.user.id),
          query ? ilike(podcast.title, `%${query}%`) : undefined,
        ),
        orderBy,
        limit,
        offset: (page - 1) * limit,
        with: {
          episodes: {
            limit: 5,
            orderBy: [desc(episode.createdAt)],
          },
        },
      });

      return {
        data: results,
        pagination: {
          page,
          limit,
          hasMore: results.length === limit,
        },
      };
    }),

  add: protectedProcedure
    .input(
      z.object({
        podcastId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        feedUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { podcastId, title, description, imageUrl } = input;

      try {
        const existing = await ctx.db.query.podcast.findFirst({
          where: and(
            eq(podcast.podcastId, podcastId),
            eq(podcast.userId, ctx.user.id),
          ),
        });

        if (existing) {
          return {
            success: true,
            podcast: existing,
            message: "Podcast already in library",
          };
        }

        const newPodcast = {
          id: nanoid(),
          podcastId,
          title,
          description: description || null,
          imageUrl: imageUrl || null,
          feedUrl: input.feedUrl || null,
          userId: ctx.user.id,
        };

        await ctx.db.insert(podcast).values(newPodcast);

        return {
          success: true,
          podcast: newPodcast,
          message: "Podcast added to library",
        };
      } catch (error) {
        console.error("Add podcast error:", error);
        throw new Error("Failed to add podcast");
      }
    }),

  remove: protectedProcedure
    .input(
      z.object({
        podcastId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { podcastId } = input;

      try {
        await ctx.db
          .delete(podcast)
          .where(
            and(
              eq(podcast.podcastId, podcastId),
              eq(podcast.userId, ctx.user.id),
            ),
          );
        return { success: true, message: "Podcast removed from library" };
      } catch (error) {
        console.error("Remove podcast error:", error);
        throw new Error("Failed to remove podcast");
      }
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const userPodcasts = await ctx.db
      .select({ count: count() })
      .from(podcast)
      .where(eq(podcast.userId, ctx.user.id));

    const userEpisodes = await ctx.db
      .select({ count: count() })
      .from(episode)
      .innerJoin(podcast, eq(episode.podcastId, podcast.id))
      .where(eq(podcast.userId, ctx.user.id));

    return {
      totalPodcasts: Number(userPodcasts[0]?.count ?? 0),
      totalEpisodes: Number(userEpisodes[0]?.count ?? 0),
    };
  }),

  parseFeed: protectedProcedure
    .input(z.object({ podcastId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { podcastId } = input;

      // Get podcast from database
      const podcastRecord = await ctx.db.query.podcast.findFirst({
        where: and(eq(podcast.id, podcastId), eq(podcast.userId, ctx.user.id)),
      });

      if (!podcastRecord) {
        throw new Error(`Podcast with id ${podcastId} not found`);
      }

      if (!podcastRecord.feedUrl) {
        throw new Error("No feed URL available for this podcast");
      }

      const existingEpisodes = await ctx.db.query.episode.findMany({
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
          existingEpisodeIds.add(
            `${episodeIdPrefix}${existingEpisode.episodeId}`,
          );
        }
      }

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

      // Parse RSS feed
      const parser = new Parser();
      // biome-ignore lint/suspicious/noExplicitAny: **
      let feedData: any;
      try {
        feedData = await parser.parseURL(podcastRecord.feedUrl);
      } catch (error) {
        throw new Error(
          `Failed to parse RSS feed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Process episodes in batches
      const batchSize = 10;
      const totalItems = feedData.items?.length || 0;
      let processedCount = 0;

      for (let i = 0; i < totalItems; i += batchSize) {
        const batch = feedData.items.slice(i, i + batchSize);

        // biome-ignore lint/suspicious/noExplicitAny: **
        const episodesToInsert = batch.flatMap((item: any) => {
          const episodeIdentifier = getEpisodeIdentifier(item);
          const normalizedEpisodeId = `${episodeIdPrefix}${episodeIdentifier}`;

          existingEpisodeIds.add(normalizedEpisodeId);

          // Extract duration from itunes:duration or other sources
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
              status: "pending" as const,
            },
          ];
        });

        // Upsert episodes with enhanced RSS metadata using efficient approach
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

          await ctx.db
            .insert(episode)
            .values(episodesToInsert)
            .onConflictDoUpdate({
              target: episode.episodeId,
              set: setObject,
            });
        }

        processedCount += episodesToInsert.length;
      }

      return {
        success: true,
        message: `Successfully processed ${processedCount} episodes`,
        feedTitle: feedData.title,
        totalEpisodes: totalItems,
      };
    }),
});
