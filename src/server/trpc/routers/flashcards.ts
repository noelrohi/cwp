import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import {
  article,
  dailySignal,
  flashcard,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";
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

  createFromSelection: protectedProcedure
    .input(
      z.object({
        articleId: z.string(),
        front: z
          .string()
          .min(1, "Front is required")
          .max(500, "Front must be 500 characters or less"),
        back: z
          .string()
          .min(1, "Back is required")
          .max(5000, "Back must be 5000 characters or less"),
        tags: z.array(z.string()).optional(),
        source: z.enum(["summary", "article"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const articleRecord = await ctx.db.query.article.findFirst({
        where: and(
          eq(article.id, input.articleId),
          eq(article.userId, ctx.user.id),
        ),
        columns: {
          id: true,
          title: true,
          publishedAt: true,
        },
      });

      if (!articleRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      const trimmedBack = input.back.trim();
      if (trimmedBack.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Back content cannot be empty",
        });
      }

      const chunkId = nanoid();
      const wordCount = trimmedBack.split(/\s+/).filter(Boolean).length;

      await ctx.db.insert(transcriptChunk).values({
        id: chunkId,
        articleId: articleRecord.id,
        content: trimmedBack,
        wordCount,
      });

      const signalId = nanoid();
      const now = new Date();
      const safeFront = input.front.trim();
      const summary = buildSummary(trimmedBack, safeFront);
      const excerpt = buildExcerpt(trimmedBack);

      await ctx.db.insert(dailySignal).values({
        id: signalId,
        chunkId,
        userId: ctx.user.id,
        signalDate: articleRecord.publishedAt ?? now,
        relevanceScore: 1,
        title: safeFront || articleRecord.title,
        summary,
        excerpt,
        userAction: "saved",
        presentedAt: now,
        actionedAt: now,
        scoringMethod: input.source ? `manual-${input.source}` : "manual",
      });

      const savedChunkId = nanoid();
      await ctx.db.insert(savedChunk).values({
        id: savedChunkId,
        chunkId,
        userId: ctx.user.id,
        tags: input.tags?.length ? input.tags.join(",") : null,
        highlightExtractedQuote: trimmedBack,
        highlightExtractedAt: now,
        savedAt: now,
      });

      await inngest.send({
        name: "signal/actioned",
        data: {
          signalId,
          action: "saved",
        },
      });

      const flashcardId = nanoid();
      await ctx.db.insert(flashcard).values({
        id: flashcardId,
        userId: ctx.user.id,
        signalId,
        front: safeFront,
        back: trimmedBack,
        tags: input.tags ?? [],
      });

      return { id: flashcardId, signalId };
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

      return cards
        .filter((card): card is { signalId: string } => card.signalId !== null)
        .reduce(
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

  createStandalone: protectedProcedure
    .input(
      z.object({
        front: z
          .string()
          .min(1, "Question/Statement is required")
          .max(500, "Question must be 500 characters or less"),
        back: z
          .string()
          .min(1, "Answer is required")
          .max(5000, "Answer must be 5000 characters or less"),
        tags: z.array(z.string()).optional(),
        source: z
          .string()
          .min(1, "Source is required")
          .max(500, "Source must be 500 characters or less"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const trimmedBack = input.back.trim();
      const trimmedFront = input.front.trim();
      const trimmedSource = input.source.trim();

      if (trimmedBack.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Answer cannot be empty",
        });
      }

      if (trimmedFront.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Question/Statement cannot be empty",
        });
      }

      if (trimmedSource.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source cannot be empty",
        });
      }

      // Create standalone flashcard without transcript chunk or daily signal
      const flashcardId = nanoid();
      await ctx.db.insert(flashcard).values({
        id: flashcardId,
        userId: ctx.user.id,
        front: trimmedFront,
        back: trimmedBack,
        tags: input.tags ?? [],
        source: trimmedSource,
      });

      return { id: flashcardId };
    }),
});

function buildSummary(back: string, front: string): string {
  if (front) {
    return truncateText(front, 320);
  }
  return truncateText(back, 320);
}

function buildExcerpt(back: string): string {
  return truncateText(back, 180);
}

function truncateText(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength - 3).trimEnd()}...`;
}
