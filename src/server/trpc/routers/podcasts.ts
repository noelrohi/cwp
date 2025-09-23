import { asc, count, desc, eq, ilike } from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { z } from "zod";
import { episode, podcast } from "@/server/db/schema/podcast";
import { createTRPCRouter, publicProcedure } from "../init";

export const podcastsRouter = createTRPCRouter({
  get: publicProcedure
    .input(z.object({ podcastId: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.podcast.findFirst({
        where: eq(podcast.id, input.podcastId),
        with: {
          episodes: {
            limit: 50,
          },
        },
      });

      if (!result) {
        throw new Error("Podcast not found");
      }

      return result;
    }),

  list: publicProcedure
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
        where: query ? ilike(podcast.title, `%${query}%`) : undefined,
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

  add: publicProcedure
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
          where: eq(podcast.podcastId, podcastId),
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

  remove: publicProcedure
    .input(
      z.object({
        podcastId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { podcastId } = input;

      try {
        await ctx.db.delete(podcast).where(eq(podcast.podcastId, podcastId));
        return { success: true, message: "Podcast removed from library" };
      } catch (error) {
        console.error("Remove podcast error:", error);
        throw new Error("Failed to remove podcast");
      }
    }),

  stats: publicProcedure.query(async ({ ctx }) => {
    const totalPodcasts = await ctx.db.select({ count: count() }).from(podcast);
    const totalEpisodes = await ctx.db.select({ count: count() }).from(episode);

    return {
      totalPodcasts: Number(totalPodcasts[0]?.count ?? 0),
      totalEpisodes: Number(totalEpisodes[0]?.count ?? 0),
    };
  }),

  parseFeed: publicProcedure
    .input(z.object({ podcastId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { podcastId } = input;

      // Get podcast from database
      const podcastRecord = await ctx.db.query.podcast.findFirst({
        where: eq(podcast.id, podcastId),
      });

      if (!podcastRecord) {
        throw new Error(`Podcast with id ${podcastId} not found`);
      }

      if (!podcastRecord.feedUrl) {
        throw new Error("No feed URL available for this podcast");
      }

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
        const episodesToInsert = batch.map((item: any) => {
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

          return {
            id: nanoid(),
            episodeId: item.guid || item.link || nanoid(),
            podcastId: podcastRecord.id,
            title: item.title || "Untitled Episode",
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
            durationSec,
            audioUrl: item.enclosure?.url || null,
            thumbnailUrl: item.itunes?.image || null,
            series: item.itunes?.season || null,
            guest: null, // Could be extracted from title or description if needed
            hostName: null, // Could be extracted from feed metadata
            language: feedData.language || null,
            transcriptUrl: null, // Not available in RSS feeds typically
          };
        });

        // Insert episodes with conflict handling
        if (episodesToInsert.length > 0) {
          await ctx.db
            .insert(episode)
            .values(episodesToInsert)
            .onConflictDoNothing({ target: episode.episodeId });
        }

        processedCount += batch.length;
      }

      return {
        success: true,
        message: `Successfully processed ${processedCount} episodes`,
        feedTitle: feedData.title,
        totalEpisodes: totalItems,
      };
    }),
});
