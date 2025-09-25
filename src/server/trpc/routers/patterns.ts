import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { pattern, patternEvidence } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const patternsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).optional().default(20),
          patternDate: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { limit = 20, patternDate } = input ?? {};

      const items = await ctx.db.query.pattern.findMany({
        where: and(
          eq(pattern.userId, ctx.user.id),
          patternDate ? eq(pattern.patternDate, patternDate) : undefined,
        ),
        orderBy: [desc(pattern.createdAt)],
        limit,
        with: {
          evidences: {
            orderBy: [asc(patternEvidence.showAtSec)],
          },
          episode: true,
        },
      });

      return items.map((item) => ({
        id: item.id,
        userId: item.userId,
        episodeId: item.episodeId,
        patternDate: item.patternDate,
        status: item.status,
        title: item.title,
        insightMarkdown: item.synthesis,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        episode: item.episode
          ? {
              id: item.episode.id,
              title: item.episode.title,
              series: item.episode.series,
              hostName: item.episode.hostName,
            }
          : null,
        evidences: item.evidences.map((evidence) => ({
          id: evidence.id,
          patternId: evidence.patternId,
          episodeId: evidence.episodeId,
          userId: evidence.userId,
          speaker: evidence.speaker,
          content: evidence.content,
          evidenceType: evidence.evidenceType,
          entityLabel: evidence.entityLabel,
          entityCategory: evidence.entityCategory,
          confidence: evidence.confidence,
          showAtSec: evidence.showAtSec,
          endAtSec: evidence.endAtSec,
          episodeTitle: evidence.episodeTitle,
          podcastTitle: evidence.podcastTitle,
          podcastSeries: evidence.podcastSeries,
          createdAt: evidence.createdAt,
          updatedAt: evidence.updatedAt,
        })),
      }));
    }),

  latestByEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
        limit: z.number().int().min(1).max(5).optional().default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.pattern.findMany({
        where: and(
          eq(pattern.userId, ctx.user.id),
          eq(pattern.episodeId, input.episodeId),
        ),
        orderBy: [desc(pattern.createdAt)],
        limit: input.limit,
        with: {
          evidences: {
            orderBy: [asc(patternEvidence.showAtSec)],
          },
        },
      });

      return items.map((item) => ({
        id: item.id,
        patternDate: item.patternDate,
        status: item.status,
        title: item.title,
        insightMarkdown: item.synthesis,
        createdAt: item.createdAt,
        evidences: item.evidences,
      }));
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.pattern.findFirst({
        where: and(eq(pattern.userId, ctx.user.id), eq(pattern.id, input.id)),
        with: {
          evidences: {
            orderBy: [asc(patternEvidence.showAtSec)],
          },
          episode: true,
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pattern not found",
        });
      }

      return {
        id: item.id,
        userId: item.userId,
        episodeId: item.episodeId,
        patternDate: item.patternDate,
        status: item.status,
        title: item.title,
        insightMarkdown: item.synthesis,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        episode: item.episode
          ? {
              id: item.episode.id,
              title: item.episode.title,
              series: item.episode.series,
              hostName: item.episode.hostName,
            }
          : null,
        evidences: item.evidences.map((evidence) => ({
          id: evidence.id,
          patternId: evidence.patternId,
          episodeId: evidence.episodeId,
          userId: evidence.userId,
          speaker: evidence.speaker,
          content: evidence.content,
          evidenceType: evidence.evidenceType,
          entityLabel: evidence.entityLabel,
          entityCategory: evidence.entityCategory,
          confidence: evidence.confidence,
          showAtSec: evidence.showAtSec,
          endAtSec: evidence.endAtSec,
          episodeTitle: evidence.episodeTitle,
          podcastTitle: evidence.podcastTitle,
          podcastSeries: evidence.podcastSeries,
          createdAt: evidence.createdAt,
          updatedAt: evidence.updatedAt,
        })),
      };
    }),
});
