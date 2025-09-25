import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import {
  dailySignal,
  episode,
  podcast,
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
