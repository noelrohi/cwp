import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { dailySignal, flashcard } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const flashcardsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        signalId: z.string(),
        front: z.string().min(1, "Front is required"),
        back: z.string().min(1, "Back is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const signal = await ctx.db.query.dailySignal.findFirst({
        where: and(
          eq(dailySignal.id, input.signalId),
          eq(dailySignal.userId, ctx.user.id),
        ),
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

      const id = nanoid();
      await ctx.db.insert(flashcard).values({
        id,
        userId: ctx.user.id,
        signalId: input.signalId,
        front: input.front,
        back: input.back,
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

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        front: z.string().min(1, "Front is required"),
        back: z.string().min(1, "Back is required"),
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
