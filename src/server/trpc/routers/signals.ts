import { TRPCError } from "@trpc/server";
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
import { z } from "zod";
import { inngest } from "@/inngest/client";
import {
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
          limit: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? DEFAULT_SIGNAL_LIMIT;

      const rows = await ctx.db.query.dailySignal.findMany({
        where: and(
          eq(dailySignal.userId, ctx.user.id),
          isNull(dailySignal.userAction),
        ),
        orderBy: [
          desc(dailySignal.signalDate),
          desc(dailySignal.relevanceScore),
        ],
        limit,
        with: {
          chunk: {
            columns: {
              id: true,
              content: true,
              speaker: true,
              startTimeSec: true,
              endTimeSec: true,
              episodeId: true,
            },
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
          },
        },
      });

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
        title: row.title ?? buildFallbackTitle(row.chunk.content),
        summary: row.summary ?? buildFallbackSummary(row.chunk.content),
        excerpt: row.excerpt ?? buildFallbackExcerpt(row.chunk.content),
        speakerName: row.speakerName,
        chunk: {
          id: row.chunk.id,
          content: row.chunk.content,
          speaker: row.chunk.speaker,
          startTimeSec: row.chunk.startTimeSec,
          endTimeSec: row.chunk.endTimeSec,
        },
        episode: row.chunk.episode
          ? {
              id: row.chunk.episode.id,
              title: row.chunk.episode.title,
              publishedAt: row.chunk.episode.publishedAt,
              audioUrl: row.chunk.episode.audioUrl,
              durationSec: row.chunk.episode.durationSec,
              podcast: row.chunk.episode.podcast
                ? {
                    id: row.chunk.episode.podcast.id,
                    title: row.chunk.episode.podcast.title,
                    imageUrl: row.chunk.episode.podcast.imageUrl,
                  }
                : null,
            }
          : null,
      }));
    }),

  byEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: dailySignal.id,
          relevanceScore: dailySignal.relevanceScore,
          signalDate: dailySignal.signalDate,
          title: dailySignal.title,
          summary: dailySignal.summary,
          excerpt: dailySignal.excerpt,
          speakerName: dailySignal.speakerName,
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
        .where(
          and(
            eq(dailySignal.userId, ctx.user.id),
            eq(transcriptChunk.episodeId, input.episodeId),
          ),
        )
        .orderBy(
          desc(dailySignal.signalDate),
          desc(dailySignal.relevanceScore),
        );

      return rows.map((row) => ({
        id: row.id,
        relevanceScore: row.relevanceScore,
        signalDate: row.signalDate,
        title: row.title ?? buildFallbackTitle(row.chunkContent),
        summary: row.summary ?? buildFallbackSummary(row.chunkContent),
        excerpt: row.excerpt ?? buildFallbackExcerpt(row.chunkContent),
        speakerName: row.speakerName,
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

      await inngest.send({
        name: "signal/actioned",
        data: {
          signalId: input.signalId,
          action: input.action,
        },
      });

      return { success: true };
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

    const totalSaved = await ctx.db
      .select({ count: count() })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          eq(dailySignal.userAction, "saved"),
        ),
      );

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

    const saveRate =
      totalPresented[0]?.count > 0
        ? (totalSaved[0]?.count || 0) / totalPresented[0].count
        : 0;

    const actionRate =
      totalPresented[0]?.count > 0
        ? ((totalSaved[0]?.count || 0) + (totalSkipped[0]?.count || 0)) /
          totalPresented[0].count
        : 0;

    return {
      totalSignals: totalSignals[0]?.count || 0,
      totalPresented: totalPresented[0]?.count || 0,
      totalSaved: totalSaved[0]?.count || 0,
      totalSkipped: totalSkipped[0]?.count || 0,
      saveRate: Math.round(saveRate * 100) / 100,
      actionRate: Math.round(actionRate * 100) / 100,
      dailyEngagement,
    };
  }),

  saved: protectedProcedure.query(async ({ ctx }) => {
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
        speakerName: dailySignal.speakerName,
        relevanceScore: dailySignal.relevanceScore,
      })
      .from(savedChunk)
      .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
      .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
      .innerJoin(podcast, eq(episode.podcastId, podcast.id))
      .leftJoin(
        dailySignal,
        and(
          eq(dailySignal.chunkId, savedChunk.chunkId),
          eq(dailySignal.userId, ctx.user.id),
        ),
      )
      .where(eq(savedChunk.userId, ctx.user.id))
      .orderBy(desc(savedChunk.savedAt));

    return savedChunksWithSignals.map((row) => {
      const inferredSpeakerName = row.speakerName?.trim();
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
        relevanceScore: row.relevanceScore,
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

  skipAll: protectedProcedure.mutation(async ({ ctx }) => {
    const pendingSignals = await ctx.db
      .select({ id: dailySignal.id })
      .from(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          isNull(dailySignal.userAction),
        ),
      );

    if (pendingSignals.length === 0) {
      return { success: true, skippedCount: 0 };
    }

    await ctx.db
      .update(dailySignal)
      .set({ userAction: "skipped", actionedAt: new Date() })
      .where(
        and(
          eq(dailySignal.userId, ctx.user.id),
          isNull(dailySignal.userAction),
        ),
      );

    return { success: true, skippedCount: pendingSignals.length };
  }),
});

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
