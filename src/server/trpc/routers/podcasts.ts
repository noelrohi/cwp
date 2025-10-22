import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  not,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import Parser from "rss-parser";
import { z } from "zod";
import {
  dailySignal,
  episode,
  podcast,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const podcastsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        podcastId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const podcastRecord = await ctx.db.query.podcast.findFirst({
        where: and(
          eq(podcast.id, input.podcastId),
          eq(podcast.userId, ctx.user.id),
        ),
      });

      if (!podcastRecord) {
        throw new Error("Podcast not found");
      }

      const [episodeCountResult] = await ctx.db
        .select({ value: count() })
        .from(episode)
        .where(
          and(
            eq(episode.podcastId, input.podcastId),
            eq(episode.userId, ctx.user.id),
          ),
        );

      return {
        ...podcastRecord,
        episodeCount: Number(episodeCountResult?.value ?? 0),
      };
    }),

  episodesInfinite: protectedProcedure
    .input(
      z.object({
        podcastId: z.string(),
        filterBySignals: z
          .enum(["all", "with-signals", "without-signals"])
          .optional()
          .default("all"),
        limit: z.number().int().min(1).max(50).optional().default(20),
        cursor: z
          .object({
            id: z.string(),
            publishedAt: z.string().datetime().nullable(),
            createdAt: z.string().datetime(),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;

      const orderTimestampExpr = sql`coalesce(${episode.publishedAt}, ${episode.createdAt})`;
      const signalExists = exists(
        ctx.db
          .select({ value: sql`1` })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(
            and(
              eq(dailySignal.userId, ctx.user.id),
              eq(transcriptChunk.episodeId, episode.id),
            ),
          ),
      );

      const filterCondition = (() => {
        if (input.filterBySignals === "with-signals") {
          return signalExists;
        }
        if (input.filterBySignals === "without-signals") {
          return not(signalExists);
        }
        return undefined;
      })();

      const cursorCondition = input.cursor
        ? (() => {
            const cursorTimestamp = new Date(
              input.cursor.publishedAt ?? input.cursor.createdAt,
            );
            return sql`
              (${orderTimestampExpr} < ${cursorTimestamp})
              or (
                ${orderTimestampExpr} = ${cursorTimestamp}
                and ${episode.id} < ${input.cursor.id}
              )
            `;
          })()
        : undefined;

      const rows = await ctx.db.query.episode.findMany({
        where: and(
          eq(episode.podcastId, input.podcastId),
          eq(episode.userId, ctx.user.id),
          filterCondition,
          cursorCondition,
        ),
        orderBy: [desc(orderTimestampExpr), desc(episode.id)],
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      const nextCursor = hasMore
        ? {
            id: rows[limit].id,
            publishedAt: rows[limit].publishedAt
              ? rows[limit].publishedAt.toISOString()
              : null,
            createdAt: rows[limit].createdAt.toISOString(),
          }
        : null;

      return {
        items,
        nextCursor,
      };
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

      const whereClause = and(
        eq(podcast.userId, ctx.user.id),
        query ? ilike(podcast.title, `%${query}%`) : undefined,
      );

      const results = await ctx.db
        .select({
          id: podcast.id,
          podcastId: podcast.podcastId,
          title: podcast.title,
          description: podcast.description,
          imageUrl: podcast.imageUrl,
          feedUrl: podcast.feedUrl,
          userId: podcast.userId,
          createdAt: podcast.createdAt,
          updatedAt: podcast.updatedAt,
          total: sql<number>`count(*) over()`.as("total"),
        })
        .from(podcast)
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(limit)
        .offset((page - 1) * limit);

      const totalCount = results.length > 0 ? Number(results[0].total) : 0;
      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: results,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
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
        youtubePlaylistId: z.string().optional(),
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
          youtubePlaylistId: input.youtubePlaylistId || null,
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

  updateYouTubePlaylistId: protectedProcedure
    .input(
      z.object({
        podcastId: z.string(),
        youtubePlaylistId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db
          .update(podcast)
          .set({ youtubePlaylistId: input.youtubePlaylistId })
          .where(
            and(
              eq(podcast.id, input.podcastId),
              eq(podcast.userId, ctx.user.id),
            ),
          );

        return {
          success: true,
          message: "YouTube playlist ID updated",
        };
      } catch (error) {
        console.error("Update YouTube playlist ID error:", error);
        throw new Error("Failed to update YouTube playlist ID");
      }
    }),

  manuallyMatchEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
        youtubeVideoId: z.string(),
        youtubeVideoUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify episode belongs to user
        const episodeRecord = await ctx.db.query.episode.findFirst({
          where: and(
            eq(episode.id, input.episodeId),
            eq(episode.userId, ctx.user.id),
          ),
        });

        if (!episodeRecord) {
          throw new Error("Episode not found");
        }

        // Update episode with YouTube video info
        await ctx.db
          .update(episode)
          .set({
            youtubeVideoId: input.youtubeVideoId,
            youtubeVideoUrl:
              input.youtubeVideoUrl ||
              `https://www.youtube.com/watch?v=${input.youtubeVideoId}`,
          })
          .where(eq(episode.id, input.episodeId));

        return {
          success: true,
          message: "Episode manually matched with YouTube video",
        };
      } catch (error) {
        console.error("Manual episode match error:", error);
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to manually match episode",
        );
      }
    }),

  getPotentialYouTubeMatches: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        // Get the episode with its podcast
        const episodeRecord = await ctx.db.query.episode.findFirst({
          where: and(
            eq(episode.id, input.episodeId),
            eq(episode.userId, ctx.user.id),
          ),
          with: {
            podcast: true,
          },
        });

        if (!episodeRecord) {
          throw new Error("Episode not found");
        }

        // Get channel name from episode author
        const channelName = episodeRecord.author || episodeRecord.podcast?.title || "";

        // Search YouTube using the episode title
        const { searchYouTubeVideos } = await import(
          "@/server/lib/youtube-search"
        );

        const searchQuery = episodeRecord.itunesTitle || episodeRecord.title;
        console.log(`[YouTube Search] Searching for episode: "${searchQuery}"`);

        // Add podcast/channel name to improve search accuracy
        const enhancedQuery = channelName
          ? `${searchQuery} ${channelName}`
          : searchQuery;

        const searchResults = await searchYouTubeVideos({
          query: enhancedQuery,
          maxResults: 20,
        });

        if (searchResults.length === 0) {
          console.log("[YouTube Search] No results found, trying without channel name");
          // Fallback: try search without channel name
          const fallbackResults = await searchYouTubeVideos({
            query: searchQuery,
            maxResults: 20,
          });
          searchResults.push(...fallbackResults);
        }

        // Get all already matched video IDs for this podcast
        const matchedEpisodes = await ctx.db.query.episode.findMany({
          where: and(
            eq(episode.podcastId, episodeRecord.podcast?.id || ""),
            eq(episode.userId, ctx.user.id),
            not(eq(episode.youtubeVideoId, sql`NULL`)),
          ),
          columns: {
            youtubeVideoId: true,
          },
        });

        const matchedVideoIds = new Set(
          matchedEpisodes
            .map((e) => e.youtubeVideoId)
            .filter((id): id is string => id !== null),
        );

        // Calculate confidence scores
        const { compareTwoStrings } = await import("string-similarity");
        const { normalizeTitle } = await import(
          "@/server/lib/youtube-matcher-utils"
        );

        const normalizedEpisodeTitle = normalizeTitle(searchQuery);

        type VideoWithScore = {
          videoId: string;
          title: string;
          description: string;
          publishedAt: string | null;
          durationSec: number;
          thumbnailUrl: string | null;
          videoUrl: string;
          confidence: number;
          titleSimilarity: number;
          dateDiffDays: number | null;
          isAlreadyMatched: boolean;
          channelName: string;
        };

        const videosWithScores: VideoWithScore[] = searchResults.map(
          (video, index) => {
            const normalizedVideoTitle = normalizeTitle(video.title);
            const titleSimilarity = compareTwoStrings(
              normalizedEpisodeTitle,
              normalizedVideoTitle,
            );

            // Calculate duration similarity if both durations are available
            let durationSimilarity = 0;
            if (episodeRecord.durationSec && video.durationSec) {
              const durationDiff = Math.abs(
                episodeRecord.durationSec - video.durationSec,
              );
              durationSimilarity = 1 - Math.min(durationDiff / episodeRecord.durationSec, 1);
            }

            // Calculate confidence score:
            // 1. YouTube's search ranking (position bonus: first result gets higher score)
            const positionBonus = Math.max(0, (20 - index) / 20) * 0.3; // 0-30% based on position
            // 2. Title similarity (40%)
            const titleScore = titleSimilarity * 0.4;
            // 3. Duration similarity if available (30%)
            const durationScore = durationSimilarity * 0.3;

            const confidence = positionBonus + titleScore + durationScore;

            // Calculate date difference if available
            let dateDiffDays: number | null = null;
            if (episodeRecord.publishedAt && video.publishedAt) {
              const episodeDate = episodeRecord.publishedAt.getTime();
              const videoDate = video.publishedAt.getTime();
              dateDiffDays = Math.abs(episodeDate - videoDate) / (1000 * 60 * 60 * 24);
            }

            return {
              videoId: video.videoId,
              title: video.title,
              description: video.description,
              publishedAt: video.publishedAt?.toISOString() || null,
              durationSec: video.durationSec,
              thumbnailUrl: video.thumbnailUrl,
              videoUrl: video.videoUrl,
              confidence,
              titleSimilarity,
              dateDiffDays,
              isAlreadyMatched: matchedVideoIds.has(video.videoId),
              channelName: video.channelName,
            };
          },
        );

        // Sort by confidence (highest first), but put already matched videos at the end
        videosWithScores.sort((a, b) => {
          if (a.isAlreadyMatched !== b.isAlreadyMatched) {
            return a.isAlreadyMatched ? 1 : -1;
          }
          return b.confidence - a.confidence;
        });

        return {
          episodeTitle: episodeRecord.title,
          episodePublishedAt: episodeRecord.publishedAt?.toISOString() || null,
          searchQuery: enhancedQuery,
          videos: videosWithScores,
        };
      } catch (error) {
        console.error("Get potential YouTube matches error:", error);
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to get potential YouTube matches",
        );
      }
    }),
});
