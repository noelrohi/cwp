import { TRPCError } from "@trpc/server";
import { cosineSimilarity } from "ai";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import {
  article,
  dailySignal,
  episode,
  podcast,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

const DEFAULT_SIGNAL_LIMIT = 30;

export const signalsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          episodeId: z.string().optional(),
          filter: z.enum(["all", "pending", "processed"]).optional(),
          confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? DEFAULT_SIGNAL_LIMIT;
      const filter = input?.filter ?? "pending";
      const confidenceFilter = input?.confidenceFilter ?? "all";

      if (input?.episodeId) {
        const whereConditions = [
          eq(dailySignal.userId, ctx.user.id),
          eq(transcriptChunk.episodeId, input.episodeId),
        ];

        if (filter === "pending") {
          whereConditions.push(isNull(dailySignal.userAction));
        } else if (filter === "processed") {
          whereConditions.push(isNotNull(dailySignal.userAction));
        }

        // Add confidence filter
        if (confidenceFilter === "high") {
          whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
        } else if (confidenceFilter === "medium") {
          whereConditions.push(
            sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
          );
        } else if (confidenceFilter === "low") {
          whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
        }

        const rows = await ctx.db
          .select({
            id: dailySignal.id,
            relevanceScore: dailySignal.relevanceScore,
            signalDate: dailySignal.signalDate,
            title: dailySignal.title,
            summary: dailySignal.summary,
            excerpt: dailySignal.excerpt,
            speakerName: dailySignal.speakerName,
            userAction: dailySignal.userAction,
            chunkId: dailySignal.chunkId,
            presentedAt: dailySignal.presentedAt,
          })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(and(...whereConditions))
          .orderBy(
            desc(dailySignal.relevanceScore),
            desc(dailySignal.signalDate),
          )
          .limit(limit);

        const unpresentedIds = rows
          .filter((row) => row.presentedAt === null)
          .map((row) => row.id);

        if (unpresentedIds.length > 0) {
          await ctx.db
            .update(dailySignal)
            .set({ presentedAt: new Date() })
            .where(inArray(dailySignal.id, unpresentedIds));
        }

        const enrichedRows = await Promise.all(
          rows.map(async (row) => {
            const chunk = await ctx.db.query.transcriptChunk.findFirst({
              where: eq(transcriptChunk.id, row.chunkId),
              with: {
                episode: {
                  columns: {
                    id: true,
                    title: true,
                    publishedAt: true,
                    audioUrl: true,
                    durationSec: true,
                    podcastId: true,
                  },
                  with: {
                    podcast: {
                      columns: {
                        id: true,
                        title: true,
                        imageUrl: true,
                      },
                    },
                  },
                },
              },
            });

            return {
              id: row.id,
              relevanceScore: row.relevanceScore,
              signalDate: row.signalDate,
              title: row.title ?? buildFallbackTitle(chunk?.content ?? ""),
              summary:
                row.summary ?? buildFallbackSummary(chunk?.content ?? ""),
              excerpt:
                row.excerpt ?? buildFallbackExcerpt(chunk?.content ?? ""),
              speakerName: row.speakerName,
              userAction: row.userAction,
              chunk: {
                id: chunk?.id ?? row.chunkId,
                content: chunk?.content ?? "",
                speaker: chunk?.speaker ?? null,
                startTimeSec: chunk?.startTimeSec ?? null,
                endTimeSec: chunk?.endTimeSec ?? null,
              },
              episode: chunk?.episode
                ? {
                    id: chunk.episode.id,
                    title: chunk.episode.title,
                    publishedAt: chunk.episode.publishedAt,
                    audioUrl: chunk.episode.audioUrl,
                    durationSec: chunk.episode.durationSec,
                    podcast: chunk.episode.podcast
                      ? {
                          id: chunk.episode.podcast.id,
                          title: chunk.episode.podcast.title,
                          imageUrl: chunk.episode.podcast.imageUrl,
                        }
                      : null,
                  }
                : null,
            };
          }),
        );

        return enrichedRows;
      }

      const whereConditions = [eq(dailySignal.userId, ctx.user.id)];

      if (filter === "pending") {
        whereConditions.push(isNull(dailySignal.userAction));
      } else if (filter === "processed") {
        whereConditions.push(isNotNull(dailySignal.userAction));
      }

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      const rows = await ctx.db
        .select({
          id: dailySignal.id,
          relevanceScore: dailySignal.relevanceScore,
          signalDate: dailySignal.signalDate,
          title: dailySignal.title,
          summary: dailySignal.summary,
          excerpt: dailySignal.excerpt,
          speakerName: dailySignal.speakerName,
          userAction: dailySignal.userAction,
          presentedAt: dailySignal.presentedAt,
          chunkId: transcriptChunk.id,
          chunkContent: transcriptChunk.content,
          chunkSpeaker: transcriptChunk.speaker,
          chunkStartTimeSec: transcriptChunk.startTimeSec,
          chunkEndTimeSec: transcriptChunk.endTimeSec,
          episodeId: episode.id,
          episodeTitle: episode.title,
          episodePublishedAt: episode.publishedAt,
          episodeAudioUrl: episode.audioUrl,
          episodeDurationSec: episode.durationSec,
          podcastId: podcast.id,
          podcastTitle: podcast.title,
          podcastImageUrl: podcast.imageUrl,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .leftJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(
          and(
            ...whereConditions,
            isNotNull(transcriptChunk.episodeId),
            isNull(transcriptChunk.articleId),
          ),
        )
        .orderBy(desc(dailySignal.relevanceScore), desc(dailySignal.signalDate))
        .limit(limit);

      const unpresentedIds = rows
        .filter((row) => row.presentedAt === null)
        .map((row) => row.id);

      if (unpresentedIds.length > 0) {
        await ctx.db
          .update(dailySignal)
          .set({ presentedAt: new Date() })
          .where(inArray(dailySignal.id, unpresentedIds));
      }

      return rows.map((row) => ({
        id: row.id,
        relevanceScore: row.relevanceScore,
        signalDate: row.signalDate,
        title: row.title ?? buildFallbackTitle(row.chunkContent),
        summary: row.summary ?? buildFallbackSummary(row.chunkContent),
        excerpt: row.excerpt ?? buildFallbackExcerpt(row.chunkContent),
        speakerName: row.speakerName,
        userAction: row.userAction,
        chunk: {
          id: row.chunkId,
          content: row.chunkContent,
          speaker: row.chunkSpeaker,
          startTimeSec: row.chunkStartTimeSec,
          endTimeSec: row.chunkEndTimeSec,
        },
        episode: row.episodeId
          ? {
              id: row.episodeId,
              title: row.episodeTitle,
              publishedAt: row.episodePublishedAt,
              audioUrl: row.episodeAudioUrl,
              durationSec: row.episodeDurationSec,
              podcast: row.podcastId
                ? {
                    id: row.podcastId,
                    title: row.podcastTitle,
                    imageUrl: row.podcastImageUrl,
                  }
                : null,
            }
          : null,
      }));
    }),

  episodeStats: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const stats = await ctx.db
        .select({
          total: count(),
          pending: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} IS NULL THEN 1 ELSE 0 END)`,
          saved: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} = 'saved' THEN 1 ELSE 0 END)`,
          skipped: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} = 'skipped' THEN 1 ELSE 0 END)`,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(
          and(
            eq(dailySignal.userId, ctx.user.id),
            eq(transcriptChunk.episodeId, input.episodeId),
          ),
        );

      return {
        total: Number(stats[0]?.total) || 0,
        pending: Number(stats[0]?.pending) || 0,
        saved: Number(stats[0]?.saved) || 0,
        skipped: Number(stats[0]?.skipped) || 0,
      };
    }),

  episodesWithSignals: protectedProcedure
    .input(
      z
        .object({
          confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const confidenceFilter = input?.confidenceFilter ?? "all";
      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        isNull(dailySignal.userAction),
      ];

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      const rows = await ctx.db
        .select({
          episodeId: episode.id,
          episodeTitle: episode.title,
          episodePublishedAt: episode.publishedAt,
          podcastId: podcast.id,
          podcastTitle: podcast.title,
          signalCount: count(dailySignal.id),
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .innerJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(and(...whereConditions))
        .groupBy(
          episode.id,
          episode.title,
          episode.publishedAt,
          podcast.id,
          podcast.title,
        )
        .orderBy(desc(sql`count(${dailySignal.id})`));

      return rows.map((row) => ({
        id: row.episodeId,
        title: row.episodeTitle || "Untitled Episode",
        publishedAt: row.episodePublishedAt,
        podcast: {
          id: row.podcastId,
          title: row.podcastTitle || "Unknown Podcast",
        },
        signalCount: row.signalCount,
      }));
    }),

  byEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().min(1),
        filter: z.enum(["all", "pending", "actioned"]).optional(),
        actionFilter: z.enum(["all", "saved", "skipped"]).optional(),
        confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filter = input.filter ?? "pending";
      const actionFilter = input.actionFilter ?? "all";
      const confidenceFilter = input.confidenceFilter ?? "all";

      // Build where clause based on filter
      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        eq(transcriptChunk.episodeId, input.episodeId),
      ];

      if (filter === "pending") {
        whereConditions.push(isNull(dailySignal.userAction));
      } else if (filter === "actioned") {
        whereConditions.push(isNotNull(dailySignal.userAction));
        // Add additional filter for saved/skipped if specified
        if (actionFilter === "saved") {
          whereConditions.push(eq(dailySignal.userAction, "saved"));
        } else if (actionFilter === "skipped") {
          whereConditions.push(eq(dailySignal.userAction, "skipped"));
        }
      }
      // "all" doesn't add any action filter

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      const rows = await ctx.db
        .select({
          id: dailySignal.id,
          relevanceScore: dailySignal.relevanceScore,
          signalDate: dailySignal.signalDate,
          title: dailySignal.title,
          summary: dailySignal.summary,
          excerpt: dailySignal.excerpt,
          speakerName: dailySignal.speakerName,
          userAction: dailySignal.userAction,
          actionedAt: dailySignal.actionedAt,
          chunkId: dailySignal.chunkId,
          chunkContent: transcriptChunk.content,
          chunkSpeaker: transcriptChunk.speaker,
          chunkStart: transcriptChunk.startTimeSec,
          chunkEnd: transcriptChunk.endTimeSec,
          relatedEpisodeId: episode.id,
          relatedEpisodeTitle: episode.title,
          relatedEpisodePublishedAt: episode.publishedAt,
          relatedEpisodeAudioUrl: episode.audioUrl,
          relatedEpisodeDurationSec: episode.durationSec,
          relatedPodcastId: podcast.id,
          relatedPodcastTitle: podcast.title,
          relatedPodcastImageUrl: podcast.imageUrl,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .leftJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(and(...whereConditions))
        .orderBy(
          desc(dailySignal.relevanceScore),
          desc(dailySignal.signalDate),
        );

      return rows.map((row) => ({
        id: row.id,
        relevanceScore: row.relevanceScore,
        signalDate: row.signalDate,
        title: row.title ?? buildFallbackTitle(row.chunkContent),
        summary: row.summary ?? buildFallbackSummary(row.chunkContent),
        excerpt: row.excerpt ?? buildFallbackExcerpt(row.chunkContent),
        speakerName: row.speakerName,
        userAction: row.userAction,
        actionedAt: row.actionedAt,
        chunk: {
          id: row.chunkId,
          content: row.chunkContent,
          speaker: row.chunkSpeaker,
          startTimeSec: row.chunkStart,
          endTimeSec: row.chunkEnd,
        },
        episode: {
          id: row.relatedEpisodeId,
          title: row.relatedEpisodeTitle,
          publishedAt: row.relatedEpisodePublishedAt,
          audioUrl: row.relatedEpisodeAudioUrl,
          durationSec: row.relatedEpisodeDurationSec,
          podcast: row.relatedPodcastId
            ? {
                id: row.relatedPodcastId,
                title: row.relatedPodcastTitle,
                imageUrl: row.relatedPodcastImageUrl,
              }
            : null,
        },
      }));
    }),

  action: protectedProcedure
    .input(
      z.object({
        signalId: z.string().min(1),
        action: z.enum(["saved", "skipped"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const signal = await ctx.db.query.dailySignal.findFirst({
        where: and(
          eq(dailySignal.id, input.signalId),
          eq(dailySignal.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          userAction: true,
          chunkId: true,
        },
      });

      if (!signal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signal not found" });
      }

      if (signal.userAction) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Signal already actioned",
        });
      }

      await ctx.db
        .update(dailySignal)
        .set({ userAction: input.action, actionedAt: new Date() })
        .where(eq(dailySignal.id, input.signalId));

      // If saving, also add to savedChunk table (only if not already saved)
      if (input.action === "saved") {
        // Check if this chunk is already saved by this user
        const existingSave = await ctx.db.query.savedChunk.findFirst({
          where: and(
            eq(savedChunk.userId, ctx.user.id),
            eq(savedChunk.chunkId, signal.chunkId),
          ),
        });

        // Only insert if not already saved
        if (!existingSave) {
          await ctx.db.insert(savedChunk).values({
            id: nanoid(),
            userId: ctx.user.id,
            chunkId: signal.chunkId,
            savedAt: new Date(),
          });
        }
      }

      await inngest.send({
        name: "signal/actioned",
        data: {
          signalId: input.signalId,
          action: input.action,
        },
      });

      return { success: true, chunkId: signal.chunkId };
    }),

  undo: protectedProcedure
    .input(
      z.object({
        signalId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const signal = await ctx.db.query.dailySignal.findFirst({
        where: and(
          eq(dailySignal.id, input.signalId),
          eq(dailySignal.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          userAction: true,
          chunkId: true,
        },
      });

      if (!signal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signal not found" });
      }

      if (!signal.userAction) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Signal has no action to undo",
        });
      }

      const previousAction = signal.userAction;

      // If undoing a save, remove from savedChunk table
      if (previousAction === "saved") {
        await ctx.db
          .delete(savedChunk)
          .where(
            and(
              eq(savedChunk.userId, ctx.user.id),
              eq(savedChunk.chunkId, signal.chunkId),
            ),
          );
      }

      // Clear the action on the signal
      await ctx.db
        .update(dailySignal)
        .set({ userAction: null, actionedAt: null })
        .where(eq(dailySignal.id, input.signalId));

      return { success: true, previousAction };
    }),

  metrics: protectedProcedure.query(async ({ ctx }) => {
    // Get overall metrics for the user
    const totalSignals = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(eq(dailySignal.userId, ctx.user.id));

    const totalPresented = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          isNotNull(dailySignal.presentedAt),
        ),
      );

    // Count pending signals (no action taken yet)
    const totalPending = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          isNull(dailySignal.userAction),
        ),
      );

    // Count from savedChunk table (source of truth for training)
    const totalSaved = await ctx.db
      .select({ count: count() })
      .from(savedChunk)
      .where(eq(savedChunk.userId, ctx.user.id));

    // Count skipped from dailySignal (no separate skipped table)
    const totalSkipped = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "skipped"),
        ),
      );

    // Get daily engagement over the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyEngagement = await ctx.db
      .select({
        date: sql<string>`DATE(${dailySignal.signalDate})`,
        presented: count(dailySignal.id),
        saved: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} = 'saved' THEN 1 ELSE 0 END)`,
        skipped: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} = 'skipped' THEN 1 ELSE 0 END)`,
      })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          sql`${dailySignal.signalDate} >= ${thirtyDaysAgo}`,
        ),
      )
      .groupBy(sql`DATE(${dailySignal.signalDate})`)
      .orderBy(sql`DATE(${dailySignal.signalDate}) DESC`);

    const totalActioned =
      (totalSaved[0]?.count || 0) + (totalSkipped[0]?.count || 0);

    const saveRate =
      totalActioned > 0 ? (totalSaved[0]?.count || 0) / totalActioned : 0;

    const actionRate =
      totalPresented[0]?.count > 0
        ? totalActioned / totalPresented[0].count
        : 0;

    return {
      totalSignals: Number(totalSignals[0]?.count) || 0,
      totalPresented: Number(totalPresented[0]?.count) || 0,
      totalPending: Number(totalPending[0]?.count) || 0,
      totalSaved: Number(totalSaved[0]?.count) || 0,
      totalSkipped: Number(totalSkipped[0]?.count) || 0,
      saveRate: Math.round(saveRate * 100) / 100,
      actionRate: Math.round(actionRate * 100) / 100,
      dailyEngagement: dailyEngagement.map((row) => ({
        date: row.date,
        presented: Number(row.presented),
        saved: Number(row.saved),
        skipped: Number(row.skipped),
      })),
    };
  }),

  saved: protectedProcedure.query(async ({ ctx }) => {
    // First, get all saved chunks without the problematic dailySignal join
    const savedChunksWithSignals = await ctx.db
      .select({
        savedChunkId: savedChunk.id,
        chunkId: savedChunk.chunkId,
        chunkContent: transcriptChunk.content,
        speaker: transcriptChunk.speaker,
        startTimeSec: transcriptChunk.startTimeSec,
        endTimeSec: transcriptChunk.endTimeSec,
        highlightExtractedQuote: savedChunk.highlightExtractedQuote,
        highlightExtractedAt: savedChunk.highlightExtractedAt,
        savedAt: savedChunk.savedAt,
        episodeId: episode.id,
        episodeTitle: episode.title,
        episodePublishedAt: episode.publishedAt,
        episodeAudioUrl: episode.audioUrl,
        podcastId: podcast.id,
        podcastTitle: podcast.title,
        podcastImageUrl: podcast.imageUrl,
      })
      .from(savedChunk)
      .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
      .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
      .innerJoin(podcast, eq(episode.podcastId, podcast.id))
      .where(
        and(
          eq(savedChunk.userId, ctx.user.id),
          isNotNull(transcriptChunk.episodeId),
        ),
      )
      .orderBy(desc(savedChunk.savedAt));

    // Get the most recent saved dailySignal for each chunk (if it exists)
    const chunkIds = savedChunksWithSignals.map((row) => row.chunkId);
    const signalsMap = new Map<
      string,
      { speakerName: string | null; relevanceScore: number | null; id: string }
    >();

    if (chunkIds.length > 0) {
      const signals = await ctx.db
        .select({
          chunkId: dailySignal.chunkId,
          speakerName: dailySignal.speakerName,
          relevanceScore: dailySignal.relevanceScore,
          id: dailySignal.id,
          actionedAt: dailySignal.actionedAt,
        })
        .from(dailySignal)
        .where(
          and(
            inArray(dailySignal.chunkId, chunkIds),
            eq(dailySignal.userId, ctx.user.id),
            eq(dailySignal.userAction, "saved"),
          ),
        )
        .orderBy(desc(dailySignal.actionedAt));

      // Keep only the most recent signal per chunk
      for (const signal of signals) {
        if (!signalsMap.has(signal.chunkId)) {
          signalsMap.set(signal.chunkId, {
            speakerName: signal.speakerName,
            relevanceScore: signal.relevanceScore,
            id: signal.id,
          });
        }
      }
    }

    return savedChunksWithSignals.map((row) => {
      // Get the associated signal data from the map (if it exists)
      const signalData = signalsMap.get(row.chunkId);
      const inferredSpeakerName = signalData?.speakerName?.trim();
      const speakerLabel = row.speaker?.trim();

      const getSpeakerDisplay = () => {
        if (
          inferredSpeakerName &&
          inferredSpeakerName.length > 0 &&
          !inferredSpeakerName.startsWith("Speaker ")
        ) {
          return inferredSpeakerName;
        }

        if (speakerLabel && /^\d+$/.test(speakerLabel)) {
          const speakerNum = Number.parseInt(speakerLabel, 10);
          if (speakerNum === 0) {
            return "Host";
          }
          return `Guest ${speakerNum}`;
        }

        if (speakerLabel) {
          return `Speaker ${speakerLabel}`;
        }

        return "Unknown speaker";
      };

      return {
        id: row.savedChunkId,
        content: row.chunkContent,
        speaker: getSpeakerDisplay(),
        startTimeSec: row.startTimeSec,
        endTimeSec: row.endTimeSec,
        highlightQuote: row.highlightExtractedQuote,
        highlightExtractedAt: row.highlightExtractedAt,
        savedAt: row.savedAt,
        relevanceScore: signalData?.relevanceScore ?? null,
        dailySignalId: signalData?.id ?? null,
        episode: {
          id: row.episodeId,
          title: row.episodeTitle,
          publishedAt: row.episodePublishedAt,
          audioUrl: row.episodeAudioUrl,
          podcast: {
            id: row.podcastId,
            title: row.podcastTitle,
            imageUrl: row.podcastImageUrl,
          },
        },
      };
    });
  }),

  savedArticles: protectedProcedure.query(async ({ ctx }) => {
    const savedArticleChunks = await ctx.db
      .select({
        savedChunkId: savedChunk.id,
        chunkId: savedChunk.chunkId,
        chunkContent: transcriptChunk.content,
        highlightExtractedQuote: savedChunk.highlightExtractedQuote,
        highlightExtractedAt: savedChunk.highlightExtractedAt,
        savedAt: savedChunk.savedAt,
        articleId: article.id,
        articleTitle: article.title,
        articleUrl: article.url,
        articleAuthor: article.author,
        articleSiteName: article.siteName,
        articlePublishedAt: article.publishedAt,
        relevanceScore: dailySignal.relevanceScore,
        dailySignalId: dailySignal.id,
      })
      .from(savedChunk)
      .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
      .innerJoin(article, eq(transcriptChunk.articleId, article.id))
      .leftJoin(
        dailySignal,
        and(
          eq(dailySignal.chunkId, savedChunk.chunkId),
          eq(dailySignal.userId, ctx.user.id),
        ),
      )
      .where(
        and(
          eq(savedChunk.userId, ctx.user.id),
          isNotNull(transcriptChunk.articleId),
        ),
      )
      .orderBy(desc(savedChunk.savedAt));

    return savedArticleChunks.map((row) => ({
      id: row.savedChunkId,
      content: row.chunkContent,
      highlightQuote: row.highlightExtractedQuote,
      highlightExtractedAt: row.highlightExtractedAt,
      savedAt: row.savedAt,
      relevanceScore: row.relevanceScore,
      dailySignalId: row.dailySignalId,
      article: {
        id: row.articleId,
        title: row.articleTitle,
        url: row.articleUrl,
        author: row.articleAuthor,
        siteName: row.articleSiteName,
        publishedAt: row.articlePublishedAt,
      },
    }));
  }),

  unsave: protectedProcedure
    .input(
      z.object({
        savedChunkId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const savedChunkRecord = await ctx.db.query.savedChunk.findFirst({
        where: and(
          eq(savedChunk.id, input.savedChunkId),
          eq(savedChunk.userId, ctx.user.id),
        ),
      });

      if (!savedChunkRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved chunk not found",
        });
      }

      await ctx.db
        .delete(savedChunk)
        .where(eq(savedChunk.id, input.savedChunkId));

      return { success: true };
    }),

  skipAll: protectedProcedure
    .input(
      z
        .object({
          episodeId: z.string().optional(),
          confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const episodeId = input?.episodeId;
      const confidenceFilter = input?.confidenceFilter ?? "all";

      // Build where conditions
      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        isNull(dailySignal.userAction),
      ];

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      // If episodeId is provided, only skip signals from that episode
      // biome-ignore lint/suspicious/noImplicitAnyLet: **
      let pendingSignalsQuery;

      if (episodeId) {
        // Need to join with transcript_chunk to filter by episode
        whereConditions.push(eq(transcriptChunk.episodeId, episodeId));
        pendingSignalsQuery = ctx.db
          .select({ id: dailySignal.id })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(and(...whereConditions));
      } else {
        pendingSignalsQuery = ctx.db
          .select({ id: dailySignal.id })
          .from(dailySignal)
          .where(and(...whereConditions));
      }

      const pendingSignals = await pendingSignalsQuery;

      if (pendingSignals.length === 0) {
        return { success: true, skippedCount: 0 };
      }

      // Skip the selected signals
      await ctx.db
        .update(dailySignal)
        .set({ userAction: "skipped", actionedAt: new Date() })
        .where(
          inArray(
            dailySignal.id,
            pendingSignals.map((s) => s.id),
          ),
        );

      // Send a single bulk event for the training pipeline
      await inngest.send({
        name: "signal/bulk-skipped",
        data: {
          userId: ctx.user.id,
          count: pendingSignals.length,
          episodeId: episodeId || null,
          confidenceFilter: confidenceFilter,
        },
      });

      return { success: true, skippedCount: pendingSignals.length };
    }),

  // Debug endpoints
  debug: protectedProcedure.query(async ({ ctx }) => {
    // Count total saved chunks (source of truth)
    const totalSavedResult = await ctx.db
      .select({ count: count() })
      .from(savedChunk)
      .where(eq(savedChunk.userId, ctx.user.id));

    // Count skipped from dailySignal
    const totalSkippedResult = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "skipped"),
        ),
      );

    // Count saved chunks with embeddings (from savedChunk table - source of truth)
    const savedWithEmbeddings = await ctx.db
      .select({ count: count() })
      .from(savedChunk)
      .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
      .where(
        and(
          eq(savedChunk.userId, ctx.user.id),
          sql`${transcriptChunk.embedding} IS NOT NULL`,
        ),
      );

    return {
      totalSaved: totalSavedResult[0]?.count || 0,
      totalSkipped: totalSkippedResult[0]?.count || 0,
      savedChunksWithEmbeddings: savedWithEmbeddings[0]?.count || 0,
    };
  }),

  scoreDistribution: protectedProcedure.query(async ({ ctx }) => {
    const results = await ctx.db
      .select({
        bucket: sql<string>`CASE 
          WHEN ${dailySignal.relevanceScore} < 0.1 THEN '0-10%'
          WHEN ${dailySignal.relevanceScore} < 0.2 THEN '10-20%'
          WHEN ${dailySignal.relevanceScore} < 0.3 THEN '20-30%'
          WHEN ${dailySignal.relevanceScore} < 0.4 THEN '30-40%'
          WHEN ${dailySignal.relevanceScore} < 0.5 THEN '40-50%'
          WHEN ${dailySignal.relevanceScore} < 0.6 THEN '50-60%'
          WHEN ${dailySignal.relevanceScore} < 0.7 THEN '60-70%'
          WHEN ${dailySignal.relevanceScore} < 0.8 THEN '70-80%'
          WHEN ${dailySignal.relevanceScore} < 0.9 THEN '80-90%'
          ELSE '90-100%'
        END`,
        count: count(),
      })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          isNull(dailySignal.userAction),
        ),
      )
      .groupBy(
        sql`CASE 
          WHEN ${dailySignal.relevanceScore} < 0.1 THEN '0-10%'
          WHEN ${dailySignal.relevanceScore} < 0.2 THEN '10-20%'
          WHEN ${dailySignal.relevanceScore} < 0.3 THEN '20-30%'
          WHEN ${dailySignal.relevanceScore} < 0.4 THEN '30-40%'
          WHEN ${dailySignal.relevanceScore} < 0.5 THEN '40-50%'
          WHEN ${dailySignal.relevanceScore} < 0.6 THEN '50-60%'
          WHEN ${dailySignal.relevanceScore} < 0.7 THEN '60-70%'
          WHEN ${dailySignal.relevanceScore} < 0.8 THEN '70-80%'
          WHEN ${dailySignal.relevanceScore} < 0.9 THEN '80-90%'
          ELSE '90-100%'
        END`,
      );

    // Ensure all buckets are present
    const buckets = [
      "0-10%",
      "10-20%",
      "20-30%",
      "30-40%",
      "40-50%",
      "50-60%",
      "60-70%",
      "70-80%",
      "80-90%",
      "90-100%",
    ];

    const distribution = buckets.map((bucket) => {
      const found = results.find((r) => r.bucket === bucket);
      return {
        bucket,
        count: found?.count || 0,
      };
    });

    return distribution;
  }),

  recentSamples: protectedProcedure.query(async ({ ctx }) => {
    const savedSignals = await ctx.db
      .select({
        id: dailySignal.id,
        content: transcriptChunk.content,
        relevanceScore: dailySignal.relevanceScore,
        savedAt: dailySignal.actionedAt,
      })
      .from(dailySignal)
      .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "saved"),
        ),
      )
      .orderBy(desc(dailySignal.actionedAt))
      .limit(10);

    const skippedSignals = await ctx.db
      .select({
        id: dailySignal.id,
        content: transcriptChunk.content,
        relevanceScore: dailySignal.relevanceScore,
        skippedAt: dailySignal.actionedAt,
      })
      .from(dailySignal)
      .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "skipped"),
        ),
      )
      .orderBy(desc(dailySignal.actionedAt))
      .limit(10);

    return {
      saved: savedSignals,
      skipped: skippedSignals,
    };
  }),

  regenerateForUser: protectedProcedure.mutation(async ({ ctx }) => {
    await inngest.send({
      name: "app/daily-intelligence.user.generate-signals",
      data: {
        pipelineRunId: "manual-trigger",
        userId: ctx.user.id,
      },
    });

    return { success: true };
  }),

  embeddingDiagnostics: protectedProcedure.query(async ({ ctx }) => {
    // Total saved signals
    const totalSaved = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "saved"),
        ),
      );

    // Saved signals with embeddings
    const savedWithEmbeddings = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "saved"),
          sql`${transcriptChunk.embedding} IS NOT NULL`,
        ),
      );

    // Total chunks with embeddings
    const totalChunksWithEmbeddings = await ctx.db
      .select({ count: count() })
      .from(transcriptChunk)
      .where(sql`${transcriptChunk.embedding} IS NOT NULL`);

    // Sample saved signals with embedding status
    const sampleSavedSignals = await ctx.db
      .select({
        signalId: dailySignal.id,
        chunkId: transcriptChunk.id,
        hasEmbedding: sql<boolean>`${transcriptChunk.embedding} IS NOT NULL`,
        actionedAt: dailySignal.actionedAt,
        relevanceScore: dailySignal.relevanceScore,
      })
      .from(dailySignal)
      .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "saved"),
        ),
      )
      .orderBy(desc(dailySignal.actionedAt))
      .limit(10);

    return {
      totalSaved: totalSaved[0]?.count || 0,
      savedWithEmbeddings: savedWithEmbeddings[0]?.count || 0,
      totalChunksWithEmbeddings: totalChunksWithEmbeddings[0]?.count || 0,
      sampleSignals: sampleSavedSignals,
    };
  }),

  validationMetrics: protectedProcedure.query(async ({ ctx }) => {
    // Get saved chunks with embeddings
    const savedChunks = await ctx.db
      .select({
        chunkId: transcriptChunk.id,
        embedding: transcriptChunk.embedding,
        content: transcriptChunk.content,
      })
      .from(transcriptChunk)
      .innerJoin(dailySignal, eq(transcriptChunk.id, dailySignal.chunkId))
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "saved"),
          sql`${transcriptChunk.embedding} IS NOT NULL`,
        ),
      )
      .limit(50);

    if (savedChunks.length === 0) {
      return {
        hasSavedChunks: false,
        savedChunkCount: 0,
        pairwiseSimilarity: null,
        randomChunksSimilarity: null,
        centroidNorm: null,
      };
    }

    const embeddings = savedChunks.map((c) => c.embedding as number[]);

    // Calculate centroid
    const centroid = calculateCentroid(embeddings);
    const centroidNorm = Math.sqrt(
      centroid.reduce((sum, val) => sum + val * val, 0),
    );

    // Compute pairwise similarity among saved chunks
    const pairwiseSimilarities: number[] = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        pairwiseSimilarities.push(sim);
      }
    }

    const avgPairwiseSim =
      pairwiseSimilarities.length > 0
        ? pairwiseSimilarities.reduce((a, b) => a + b, 0) /
          pairwiseSimilarities.length
        : 0;

    // Compute each saved chunk's similarity to centroid
    const savedToCentroid = embeddings.map((emb) =>
      cosineSimilarity(emb, centroid),
    );
    const avgSavedToCentroid =
      savedToCentroid.reduce((a, b) => a + b, 0) / savedToCentroid.length;

    // Get 50 random chunks with embeddings
    const randomChunks = await ctx.db
      .select({
        chunkId: transcriptChunk.id,
        embedding: transcriptChunk.embedding,
      })
      .from(transcriptChunk)
      .where(sql`${transcriptChunk.embedding} IS NOT NULL`)
      .orderBy(sql`RANDOM()`)
      .limit(50);

    // Compute random chunks' similarity to centroid
    const randomToCentroid = randomChunks
      .filter((c) => c.embedding)
      .map((c) => cosineSimilarity(c.embedding as number[], centroid));

    const avgRandomToCentroid =
      randomToCentroid.length > 0
        ? randomToCentroid.reduce((a, b) => a + b, 0) / randomToCentroid.length
        : 0;

    // Build distribution histograms
    const buildHistogram = (similarities: number[]) => {
      const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 10 buckets for -1 to 1
      for (const sim of similarities) {
        const normalized = (sim + 1) / 2; // Convert -1..1 to 0..1
        const bucketIndex = Math.min(9, Math.floor(normalized * 10));
        buckets[bucketIndex]++;
      }
      return buckets;
    };

    return {
      hasSavedChunks: true,
      savedChunkCount: savedChunks.length,
      pairwiseSimilarity: {
        avg: avgPairwiseSim,
        min: Math.min(...pairwiseSimilarities),
        max: Math.max(...pairwiseSimilarities),
        distribution: buildHistogram(pairwiseSimilarities),
      },
      savedToCentroid: {
        avg: avgSavedToCentroid,
        min: Math.min(...savedToCentroid),
        max: Math.max(...savedToCentroid),
        distribution: buildHistogram(savedToCentroid),
      },
      randomChunksSimilarity: {
        avg: avgRandomToCentroid,
        min: Math.min(...randomToCentroid),
        max: Math.max(...randomToCentroid),
        distribution: buildHistogram(randomToCentroid),
        sampleSize: randomToCentroid.length,
      },
      centroidNorm,
    };
  }),

  // Article signal endpoints
  articlesWithSignals: protectedProcedure
    .input(
      z
        .object({
          confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const confidenceFilter = input?.confidenceFilter ?? "all";
      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        isNull(dailySignal.userAction),
        isNotNull(transcriptChunk.articleId),
      ];

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      const rows = await ctx.db
        .select({
          articleId: article.id,
          articleTitle: article.title,
          articleUrl: article.url,
          articleAuthor: article.author,
          articleSiteName: article.siteName,
          articlePublishedAt: article.publishedAt,
          signalCount: count(dailySignal.id),
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(article, eq(transcriptChunk.articleId, article.id))
        .where(and(...whereConditions))
        .groupBy(
          article.id,
          article.title,
          article.url,
          article.author,
          article.siteName,
          article.publishedAt,
        )
        .orderBy(desc(sql`count(${dailySignal.id})`));

      return rows.map((row) => ({
        id: row.articleId,
        title: row.articleTitle || "Untitled Article",
        url: row.articleUrl,
        author: row.articleAuthor,
        siteName: row.articleSiteName,
        publishedAt: row.articlePublishedAt,
        signalCount: row.signalCount,
      }));
    }),

  listArticleSignals: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          articleId: z.string().optional(),
          confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? DEFAULT_SIGNAL_LIMIT;
      const confidenceFilter = input?.confidenceFilter ?? "all";

      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        isNull(dailySignal.userAction),
        isNotNull(transcriptChunk.articleId),
      ];

      if (input?.articleId) {
        whereConditions.push(eq(transcriptChunk.articleId, input.articleId));
      }

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      const rows = await ctx.db
        .select({
          id: dailySignal.id,
          relevanceScore: dailySignal.relevanceScore,
          signalDate: dailySignal.signalDate,
          title: dailySignal.title,
          summary: dailySignal.summary,
          excerpt: dailySignal.excerpt,
          userAction: dailySignal.userAction,
          chunkId: dailySignal.chunkId,
          presentedAt: dailySignal.presentedAt,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(and(...whereConditions))
        .orderBy(desc(dailySignal.relevanceScore))
        .limit(limit);

      const unpresentedIds = rows
        .filter((row) => row.presentedAt === null)
        .map((row) => row.id);

      if (unpresentedIds.length > 0) {
        await ctx.db
          .update(dailySignal)
          .set({ presentedAt: new Date() })
          .where(inArray(dailySignal.id, unpresentedIds));
      }

      const enrichedRows = await Promise.all(
        rows.map(async (row) => {
          const chunk = await ctx.db.query.transcriptChunk.findFirst({
            where: eq(transcriptChunk.id, row.chunkId),
            with: {
              article: {
                columns: {
                  id: true,
                  title: true,
                  url: true,
                  author: true,
                  siteName: true,
                  publishedAt: true,
                },
              },
            },
          });

          return {
            id: row.id,
            relevanceScore: row.relevanceScore,
            signalDate: row.signalDate,
            title: row.title ?? buildFallbackTitle(chunk?.content ?? ""),
            summary: row.summary ?? buildFallbackSummary(chunk?.content ?? ""),
            excerpt: row.excerpt ?? buildFallbackExcerpt(chunk?.content ?? ""),
            userAction: row.userAction,
            chunk: {
              id: chunk?.id ?? row.chunkId,
              content: chunk?.content ?? "",
            },
            article: chunk?.article
              ? {
                  id: chunk.article.id,
                  title: chunk.article.title,
                  url: chunk.article.url,
                  author: chunk.article.author,
                  siteName: chunk.article.siteName,
                  publishedAt: chunk.article.publishedAt,
                }
              : null,
          };
        }),
      );

      return enrichedRows;
    }),

  byArticle: protectedProcedure
    .input(
      z.object({
        articleId: z.string().min(1),
        filter: z.enum(["all", "pending", "actioned"]).optional(),
        actionFilter: z.enum(["all", "saved", "skipped"]).optional(),
        confidenceFilter: z.enum(["all", "high", "medium", "low"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filter = input.filter ?? "pending";
      const actionFilter = input.actionFilter ?? "all";
      const confidenceFilter = input.confidenceFilter ?? "all";

      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        eq(transcriptChunk.articleId, input.articleId),
      ];

      if (filter === "pending") {
        whereConditions.push(isNull(dailySignal.userAction));
      } else if (filter === "actioned") {
        whereConditions.push(isNotNull(dailySignal.userAction));
        if (actionFilter === "saved") {
          whereConditions.push(eq(dailySignal.userAction, "saved"));
        } else if (actionFilter === "skipped") {
          whereConditions.push(eq(dailySignal.userAction, "skipped"));
        }
      }

      // Add confidence filter
      if (confidenceFilter === "high") {
        whereConditions.push(sql`${dailySignal.relevanceScore} >= 0.65`);
      } else if (confidenceFilter === "medium") {
        whereConditions.push(
          sql`${dailySignal.relevanceScore} >= 0.4 AND ${dailySignal.relevanceScore} < 0.65`,
        );
      } else if (confidenceFilter === "low") {
        whereConditions.push(sql`${dailySignal.relevanceScore} < 0.4`);
      }

      const rows = await ctx.db
        .select({
          id: dailySignal.id,
          relevanceScore: dailySignal.relevanceScore,
          signalDate: dailySignal.signalDate,
          title: dailySignal.title,
          summary: dailySignal.summary,
          excerpt: dailySignal.excerpt,
          userAction: dailySignal.userAction,
          actionedAt: dailySignal.actionedAt,
          chunkId: dailySignal.chunkId,
          chunkContent: transcriptChunk.content,
          relatedArticleId: article.id,
          relatedArticleTitle: article.title,
          relatedArticleUrl: article.url,
          relatedArticleAuthor: article.author,
          relatedArticleSiteName: article.siteName,
          relatedArticlePublishedAt: article.publishedAt,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(article, eq(transcriptChunk.articleId, article.id))
        .where(and(...whereConditions))
        .orderBy(desc(dailySignal.relevanceScore));

      return rows.map((row) => ({
        id: row.id,
        relevanceScore: row.relevanceScore,
        signalDate: row.signalDate,
        title: row.title,
        summary: row.summary,
        excerpt: row.excerpt,
        speakerName: null,
        userAction: row.userAction,
        actionedAt: row.actionedAt,
        chunk: {
          id: row.chunkId,
          content: row.chunkContent,
          speaker: null,
          startTimeSec: null,
          endTimeSec: null,
        },
        article: {
          id: row.relatedArticleId,
          title: row.relatedArticleTitle,
          url: row.relatedArticleUrl,
          author: row.relatedArticleAuthor,
          siteName: row.relatedArticleSiteName,
          publishedAt: row.relatedArticlePublishedAt,
        },
      }));
    }),

  articleStats: protectedProcedure
    .input(
      z.object({
        articleId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const stats = await ctx.db
        .select({
          total: count(),
          pending: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} IS NULL THEN 1 ELSE 0 END)`,
          saved: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} = 'saved' THEN 1 ELSE 0 END)`,
          skipped: sql<number>`SUM(CASE WHEN ${dailySignal.userAction} = 'skipped' THEN 1 ELSE 0 END)`,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(
          and(
            eq(dailySignal.userId, ctx.user.id),
            eq(transcriptChunk.articleId, input.articleId),
          ),
        );

      return {
        total: Number(stats[0]?.total) || 0,
        pending: Number(stats[0]?.pending) || 0,
        saved: Number(stats[0]?.saved) || 0,
        skipped: Number(stats[0]?.skipped) || 0,
      };
    }),
});

function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error("Cannot calculate centroid of empty embedding set");
  }

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

// Using cosineSimilarity from 'ai' package (imported above)

function buildFallbackTitle(content: string): string {
  return truncate(content, 80, "Insight");
}

function buildFallbackSummary(content: string): string {
  return truncate(content, 320, "No summary available.");
}

function buildFallbackExcerpt(content: string): string {
  return truncate(content, 180, "");
}

function truncate(
  content: string,
  maxLength: number,
  fallback: string,
): string {
  if (!content.trim()) return fallback;
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength - 3).trimEnd()}...`;
}
