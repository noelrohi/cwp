import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { dailySignal, flashcard, savedChunk } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const flashcardsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        signalId: z.string(),
        front: z
          .string()
          .min(1, "Front is required")
          .max(500, "Front must be 500 characters or less"),
        back: z
          .string()
          .min(1, "Back is required")
          .max(5000, "Back must be 5000 characters or less"),
        tags: z.array(z.string()).optional(),
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Signal not found",
        });
      }

      const existingFlashcard = await ctx.db.query.flashcard.findFirst({
        where: and(
          eq(flashcard.signalId, input.signalId),
          eq(flashcard.userId, ctx.user.id),
        ),
      });

      if (existingFlashcard) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Flashcard already exists for this signal",
        });
      }

      if (!signal.userAction) {
        await ctx.db
          .update(dailySignal)
          .set({ userAction: "saved", actionedAt: new Date() })
          .where(eq(dailySignal.id, input.signalId));

        await ctx.db.insert(savedChunk).values({
          id: nanoid(),
          userId: ctx.user.id,
          chunkId: signal.chunkId,
          savedAt: new Date(),
        });

        await inngest.send({
          name: "signal/actioned",
          data: {
            signalId: input.signalId,
            action: "saved",
          },
        });
      }

      const id = nanoid();
      await ctx.db.insert(flashcard).values({
        id,
        userId: ctx.user.id,
        signalId: input.signalId,
        front: input.front,
        back: input.back,
        tags: input.tags ?? [],
      });

      return { id };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const flashcards = await ctx.db.query.flashcard.findMany({
      where: eq(flashcard.userId, ctx.user.id),
      orderBy: [desc(flashcard.createdAt)],
      with: {
        signal: {
          with: {
            chunk: {
              with: {
                episode: {
                  with: {
                    podcast: true,
                  },
                },
                article: true,
              },
            },
          },
        },
      },
    });

    return flashcards;
  }),

  getBySignal: protectedProcedure
    .input(z.object({ signalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const card = await ctx.db.query.flashcard.findFirst({
        where: and(
          eq(flashcard.signalId, input.signalId),
          eq(flashcard.userId, ctx.user.id),
        ),
      });

      return card ?? null;
    }),

  hasSnips: protectedProcedure
    .input(z.object({ signalIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (input.signalIds.length === 0) {
        return {};
      }

      const cards = await ctx.db
        .select({ signalId: flashcard.signalId })
        .from(flashcard)
        .where(
          and(
            eq(flashcard.userId, ctx.user.id),
            inArray(flashcard.signalId, input.signalIds),
          ),
        );

      return cards.reduce(
        (acc, card) => {
          acc[card.signalId] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        front: z
          .string()
          .min(1, "Front is required")
          .max(500, "Front must be 500 characters or less"),
        back: z
          .string()
          .min(1, "Back is required")
          .max(5000, "Back must be 5000 characters or less"),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.query.flashcard.findFirst({
        where: and(
          eq(flashcard.id, input.id),
          eq(flashcard.userId, ctx.user.id),
        ),
      });

      if (!card) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Flashcard not found",
        });
      }

      await ctx.db
        .update(flashcard)
        .set({
          front: input.front,
          back: input.back,
          tags: input.tags ?? [],
          updatedAt: new Date(),
        })
        .where(eq(flashcard.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.query.flashcard.findFirst({
        where: and(
          eq(flashcard.id, input.id),
          eq(flashcard.userId, ctx.user.id),
        ),
      });

      if (!card) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Flashcard not found",
        });
      }

      await ctx.db.delete(flashcard).where(eq(flashcard.id, input.id));

      return { success: true };
    }),
});
