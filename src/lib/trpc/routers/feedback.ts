import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { qaAnswer, qaFeedback } from "@/db/schema/podcast";
import { createTRPCRouter, publicProcedure } from "../init";

const logger = {
  info: (m: string, d?: Record<string, unknown>) =>
    console.log(
      `[TRPC:Feedback:INFO] ${m}`,
      d ? JSON.stringify(d, null, 2) : "",
    ),
  error: (m: string, e?: unknown, d?: Record<string, unknown>) =>
    console.error(
      `[TRPC:Feedback:ERROR] ${m}`,
      e,
      d ? JSON.stringify(d, null, 2) : "",
    ),
  debug: (m: string, d?: Record<string, unknown>) =>
    console.debug(
      `[TRPC:Feedback:DEBUG] ${m}`,
      d ? JSON.stringify(d, null, 2) : "",
    ),
};

export const feedbackRouter = createTRPCRouter({
  submit: publicProcedure
    .input(
      z.object({
        queryId: z.string(),
        answerId: z.string(),
        signal: z.enum(["helpful", "unhelpful"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      logger.info("Submitting feedback", input);
      await ctx.db.insert(qaFeedback).values({
        queryId: input.queryId,
        answerId: input.answerId,
        signal: input.signal,
      });
      return { ok: true } as const;
    }),

  listForQuery: publicProcedure
    .input(z.object({ queryId: z.string() }))
    .query(async ({ ctx, input }) => {
      logger.debug("Listing feedback aggregates", input);
      // Join to ensure we only consider answers that belong to this query
      const rows = await ctx.db
        .select({
          answerId: qaAnswer.answerId,
          signal: qaFeedback.signal,
          n: count(),
        })
        .from(qaFeedback)
        .innerJoin(qaAnswer, eq(qaAnswer.answerId, qaFeedback.answerId))
        .where(eq(qaAnswer.queryId, input.queryId))
        .groupBy(qaAnswer.answerId, qaFeedback.signal);

      const map = new Map<string, { helpful: number; unhelpful: number }>();
      for (const r of rows) {
        const cur = map.get(r.answerId) ?? { helpful: 0, unhelpful: 0 };
        if (r.signal === "helpful") cur.helpful += Number(r.n);
        if (r.signal === "unhelpful") cur.unhelpful += Number(r.n);
        map.set(r.answerId, cur);
      }
      return Array.from(map.entries()).map(([answerId, counts]) => ({
        answerId,
        ...counts,
      }));
    }),

  logPlayback: publicProcedure
    .input(
      z.object({
        queryId: z.string(),
        answerId: z.string().optional(),
        audioUrl: z.string().optional(),
        startSec: z.number().nonnegative().optional(),
        endSec: z.number().nonnegative().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      logger.info("Playback", input);
      return { ok: true } as const;
    }),
});
