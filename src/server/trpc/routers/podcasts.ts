import { generateId } from "ai";
import { count, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { episode, podcast } from "@/server/db/schema/podcast";
import { createTRPCRouter, publicProcedure } from "../init";

export const podcastsRouter = createTRPCRouter({
  get: publicProcedure
    .input(z.object({ podcastId: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.podcast.findFirst({
        where: eq(podcast.podcastId, input.podcastId),
        with: {
          episodes: {
            orderBy: [desc(episode.createdAt)],
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
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { page = 1, limit = 20, query } = input ?? {};

      const results = await ctx.db.query.podcast.findMany({
        where: query ? ilike(podcast.title, `%${query}%`) : undefined,
        orderBy: [desc(podcast.createdAt)],
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
          id: generateId(),
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
});
