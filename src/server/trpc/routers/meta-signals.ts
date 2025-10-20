import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import {
  dailySignal,
  metaSignal,
  metaSignalQuote,
  transcriptChunk,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

const MIN_CONFIDENCE_THRESHOLD = 0.7;

export const metaSignalsRouter = createTRPCRouter({
  // List high-confidence signals for meta signal curation
  listHighConfidence: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
        minScore: z.number().min(0).max(1).default(MIN_CONFIDENCE_THRESHOLD),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.episodeId && !input.articleId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either episodeId or articleId is required",
        });
      }

      const whereConditions = [
        eq(dailySignal.userId, ctx.user.id),
        gte(dailySignal.relevanceScore, input.minScore),
      ];

      if (input.episodeId) {
        whereConditions.push(eq(transcriptChunk.episodeId, input.episodeId));
      } else if (input.articleId) {
        whereConditions.push(eq(transcriptChunk.articleId, input.articleId));
      }

      const signals = await ctx.db
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
          chunkContent: transcriptChunk.content,
          chunkSpeaker: transcriptChunk.speaker,
          chunkStartTimeSec: transcriptChunk.startTimeSec,
          chunkEndTimeSec: transcriptChunk.endTimeSec,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(and(...whereConditions))
        .orderBy(
          desc(dailySignal.relevanceScore),
          desc(dailySignal.signalDate),
        );

      return signals;
    }),

  // Get or create meta signal for episode/article
  getOrCreate: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.episodeId && !input.articleId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either episodeId or articleId is required",
        });
      }

      // Check if meta signal already exists
      const whereConditions = [eq(metaSignal.userId, ctx.user.id)];

      if (input.episodeId) {
        whereConditions.push(eq(metaSignal.episodeId, input.episodeId));
      } else if (input.articleId) {
        whereConditions.push(eq(metaSignal.articleId, input.articleId));
      }

      const existing = await ctx.db
        .select()
        .from(metaSignal)
        .where(and(...whereConditions))
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      // Create new meta signal
      const id = nanoid();
      const newMetaSignal = await ctx.db
        .insert(metaSignal)
        .values({
          id,
          userId: ctx.user.id,
          episodeId: input.episodeId || null,
          articleId: input.articleId || null,
          status: "draft",
        })
        .returning();

      return newMetaSignal[0];
    }),

  // Get meta signal with quotes
  get: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.episodeId && !input.articleId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either episodeId or articleId is required",
        });
      }

      const whereConditions = [eq(metaSignal.userId, ctx.user.id)];

      if (input.episodeId) {
        whereConditions.push(eq(metaSignal.episodeId, input.episodeId));
      } else if (input.articleId) {
        whereConditions.push(eq(metaSignal.articleId, input.articleId));
      }

      const metaSignalRecord = await ctx.db
        .select()
        .from(metaSignal)
        .where(and(...whereConditions))
        .limit(1);

      if (metaSignalRecord.length === 0) {
        return null;
      }

      // Get selected quotes
      const quotes = await ctx.db
        .select({
          id: metaSignalQuote.id,
          dailySignalId: metaSignalQuote.dailySignalId,
          extractedQuote: metaSignalQuote.extractedQuote,
          sortOrder: metaSignalQuote.sortOrder,
          addedAt: metaSignalQuote.addedAt,
          // Signal data
          signalRelevanceScore: dailySignal.relevanceScore,
          signalExcerpt: dailySignal.excerpt,
          signalSpeakerName: dailySignal.speakerName,
          // Chunk data
          chunkContent: transcriptChunk.content,
          chunkSpeaker: transcriptChunk.speaker,
          chunkStartTimeSec: transcriptChunk.startTimeSec,
        })
        .from(metaSignalQuote)
        .innerJoin(
          dailySignal,
          eq(metaSignalQuote.dailySignalId, dailySignal.id),
        )
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .where(eq(metaSignalQuote.metaSignalId, metaSignalRecord[0].id))
        .orderBy(metaSignalQuote.sortOrder);

      return {
        ...metaSignalRecord[0],
        quotes,
      };
    }),

  // Add quote to meta signal
  addQuote: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
        dailySignalId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get or create meta signal
      const metaSignalRecord = await ctx.db.transaction(async (tx) => {
        const whereConditions = [eq(metaSignal.userId, ctx.user.id)];

        if (input.episodeId) {
          whereConditions.push(eq(metaSignal.episodeId, input.episodeId));
        } else if (input.articleId) {
          whereConditions.push(eq(metaSignal.articleId, input.articleId));
        }

        const existing = await tx
          .select()
          .from(metaSignal)
          .where(and(...whereConditions))
          .limit(1);

        if (existing.length > 0) {
          return existing[0];
        }

        // Create new meta signal if doesn't exist
        const id = nanoid();
        const newMetaSignal = await tx
          .insert(metaSignal)
          .values({
            id,
            userId: ctx.user.id,
            episodeId: input.episodeId || null,
            articleId: input.articleId || null,
            status: "draft",
          })
          .returning();

        return newMetaSignal[0];
      });

      // Get current max sort order
      const maxSortOrder = await ctx.db
        .select({ max: sql<number>`max(${metaSignalQuote.sortOrder})` })
        .from(metaSignalQuote)
        .where(eq(metaSignalQuote.metaSignalId, metaSignalRecord.id));

      const nextSortOrder = (maxSortOrder[0]?.max ?? -1) + 1;

      // Add quote
      const quote = await ctx.db
        .insert(metaSignalQuote)
        .values({
          id: nanoid(),
          metaSignalId: metaSignalRecord.id,
          dailySignalId: input.dailySignalId,
          sortOrder: nextSortOrder,
        })
        .returning();

      return quote[0];
    }),

  // Remove quote from meta signal
  removeQuote: protectedProcedure
    .input(
      z.object({
        episodeId: z.string().optional(),
        articleId: z.string().optional(),
        dailySignalId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Find meta signal
      const whereConditions = [eq(metaSignal.userId, ctx.user.id)];

      if (input.episodeId) {
        whereConditions.push(eq(metaSignal.episodeId, input.episodeId));
      } else if (input.articleId) {
        whereConditions.push(eq(metaSignal.articleId, input.articleId));
      }

      const metaSignalRecord = await ctx.db
        .select()
        .from(metaSignal)
        .where(and(...whereConditions))
        .limit(1);

      if (metaSignalRecord.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meta signal not found",
        });
      }

      // Remove quote
      await ctx.db
        .delete(metaSignalQuote)
        .where(
          and(
            eq(metaSignalQuote.metaSignalId, metaSignalRecord[0].id),
            eq(metaSignalQuote.dailySignalId, input.dailySignalId),
          ),
        );

      return { success: true };
    }),

  // Update meta signal (title, summary, notes)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        summary: z.string().optional(),
        manualNotes: z.string().optional(),
        status: z.enum(["draft", "ready", "published"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify ownership
      const existing = await ctx.db
        .select()
        .from(metaSignal)
        .where(and(eq(metaSignal.id, id), eq(metaSignal.userId, ctx.user.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meta signal not found",
        });
      }

      const updated = await ctx.db
        .update(metaSignal)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(metaSignal.id, id))
        .returning();

      return updated[0];
    }),

  // Trigger meta signal generation via Inngest
  generateForEpisode: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Trigger Inngest function
      await inngest.send({
        name: "meta-signal/generate.episode",
        data: {
          episodeId: input.episodeId,
          userId: ctx.user.id,
        },
      });

      return {
        success: true,
        message: "Meta signal generation started",
      };
    }),
});
