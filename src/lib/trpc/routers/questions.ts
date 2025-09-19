import { desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { after } from "next/server";
import { z } from "zod";
import {
  episode,
  podcast,
  qaAnswer,
  qaCitation,
  qaQuery,
  transcriptChunk,
} from "@/db/schema/podcast";
import { generateAnswersForQuery } from "@/server/qa/generate";
import { createTRPCRouter, publicProcedure } from "../init";

const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(
      `[TRPC:Questions:INFO] ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
  error: (
    message: string,
    error?: Error | unknown,
    data?: Record<string, unknown>,
  ) => {
    console.error(
      `[TRPC:Questions:ERROR] ${message}`,
      error,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
  debug: (message: string, data?: Record<string, unknown>) => {
    console.debug(
      `[TRPC:Questions:DEBUG] ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(
      `[TRPC:Questions:WARN] ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
};

export const questionsRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        question: z.string().min(1, "Question is required"),
        episodeId: z.string().optional(),
        mode: z.enum(["global", "episode"]).optional().default("global"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const queryId = nanoid();
      const startTime = Date.now();

      logger.info("Creating new question", {
        queryId,
        userId: ctx.user?.id ?? "anonymous",
        mode: input.episodeId ? "episode" : input.mode,
        episodeId: input.episodeId ?? null,
        questionLength: input.question.length,
      });

      await ctx.db.insert(qaQuery).values({
        queryId,
        userId: ctx.user?.id ?? null,
        mode: input.episodeId ? "episode" : input.mode,
        episodeId: input.episodeId ?? null,
        queryText: input.question,
      });

      const insertDuration = Date.now() - startTime;
      logger.debug("Query inserted successfully", {
        queryId,
        insertDurationMs: insertDuration,
      });

      after(async () => {
        try {
          logger.info("Starting background answer generation", { queryId });
          await generateAnswersForQuery({
            db: ctx.db,
            queryId,
          });
          logger.info("Background answer generation completed", { queryId });
        } catch (err) {
          logger.error("Failed to generate answers", err, { queryId });
        }
      });

      const totalDuration = Date.now() - startTime;
      logger.info("Question creation completed", {
        queryId,
        totalDurationMs: totalDuration,
      });

      return { queryId };
    }),

  // Optional: fetch answers saved by the background job
  getAnswersByQuery: publicProcedure
    .input(z.object({ queryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const startTime = Date.now();

      logger.debug("Fetching answers by query", { queryId: input.queryId });

      const answers = await ctx.db
        .select()
        .from(qaAnswer)
        .where(eq(qaAnswer.queryId, input.queryId));

      if (answers.length === 0) {
        logger.info("No answers found for query", { queryId: input.queryId });
        return { answers: [], citations: [] as any[] };
      }

      logger.debug("Answers retrieved", {
        queryId: input.queryId,
        answerCount: answers.length,
      });

      const citations = await ctx.db
        .select()
        .from(qaCitation)
        .where(
          inArray(
            qaCitation.answerId,
            answers.map((a) => a.answerId),
          ),
        );

      const chunkIds = Array.from(new Set(citations.map((c) => c.chunkId)));
      const chunks = chunkIds.length
        ? await ctx.db
            .select()
            .from(transcriptChunk)
            .where(inArray(transcriptChunk.chunkId, chunkIds))
        : [];

      const chunkMap = new Map(chunks.map((c) => [c.chunkId, c]));
      const episodeIds = Array.from(
        new Set(chunks.map((c) => c.episodeId).filter(Boolean) as string[]),
      );

      // Use relational query to get episodes with their podcasts
      const episodesWithPodcasts = episodeIds.length
        ? await ctx.db.query.episode.findMany({
            where: inArray(episode.id, episodeIds),
            with: {
              podcast: true,
            },
          })
        : [];

      const epMap = new Map(episodesWithPodcasts.map((e) => [e.id, e]));

      const enriched = citations.map((c) => {
        const ch = chunkMap.get(c.chunkId);
        const ep = ch?.episodeId ? epMap.get(ch.episodeId) : undefined;

        // Debug logging for series data
        logger.debug("Episode data for citation", {
          episodeId: ep?.id,
          episodeTitle: ep?.title,
          episodeSeries: ep?.series,
          podcastTitle: ep?.podcast?.title,
          podcastId: ep?.podcast?.podcastId,
          hasAudioUrl: !!ep?.audioUrl,
          chunkId: c.chunkId,
        });

        return {
          ...c,
          transcript: ch?.text ?? null,
          episodeId: ch?.episodeId ?? null,
          episodeTitle: ep?.title ?? null,
          episodeSeries: ep?.podcast?.title ?? ep?.series ?? null,
          audioUrl: ep?.audioUrl ?? null,
          thumbnailUrl: ep?.thumbnailUrl ?? null,
        } as const;
      });

      const totalDuration = Date.now() - startTime;
      logger.info("Answer retrieval completed", {
        queryId: input.queryId,
        answerCount: answers.length,
        citationCount: enriched.length,
        uniqueEpisodes: episodeIds.length,
        totalDurationMs: totalDuration,
      });

      return { answers, citations: enriched };
    }),

  getById: publicProcedure
    .input(z.object({ queryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const startTime = Date.now();

      logger.debug("Fetching query by ID", { queryId: input.queryId });

      const result = await ctx.db.query.qaQuery.findFirst({
        where: eq(qaQuery.queryId, input.queryId),
        with: {
          answers: {
            with: {
              citations: {
                with: {
                  chunk: {
                    with: {
                      episode: {
                        with: {
                          podcast: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!result) {
        logger.warn("Query not found", { queryId: input.queryId });
        return null;
      }

      logger.debug("Query found", {
        queryId: input.queryId,
        mode: result.mode,
        episodeId: result.episodeId,
      });

      return result;
    }),

  // Generate more answers for a query
  generateMore: publicProcedure
    .input(z.object({ queryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      logger.info("Generating additional answers", { queryId: input.queryId });

      // Generate additional answers without deleting existing ones
      after(async () => {
        try {
          logger.info("Starting background generation of additional answers", {
            queryId: input.queryId,
          });
          await generateAnswersForQuery({
            db: ctx.db,
            queryId: input.queryId,
          });
          logger.info("Additional answer generation completed", {
            queryId: input.queryId,
          });
        } catch (err) {
          logger.error("Failed to generate additional answers", err, {
            queryId: input.queryId,
          });
        }
      });

      logger.debug("Additional answer generation request queued", {
        queryId: input.queryId,
      });

      return { success: true };
    }),

  // List queries with answer counts
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).optional(),
          sort: z.enum(["newest", "active"]).optional().default("newest"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const startTime = Date.now();
      const limit = input?.limit ?? 20;
      const sort = input?.sort ?? "newest";

      logger.debug("Listing queries", {
        limit,
        sort,
        userId: ctx.user?.id ?? "anonymous",
      });

      const query = ctx.db
        .select({
          queryId: qaQuery.queryId,
          queryText: qaQuery.queryText,
          createdAt: qaQuery.createdAt,
          answersCount: sql<number>`count(${qaAnswer.answerId})`,
        })
        .from(qaQuery)
        .leftJoin(qaAnswer, eq(qaAnswer.queryId, qaQuery.queryId))
        .groupBy(qaQuery.queryId)
        .limit(limit);

      const rows = await (sort === "active"
        ? query.orderBy(
            desc(sql<number>`count(${qaAnswer.answerId})`),
            desc(qaQuery.createdAt),
          )
        : query.orderBy(desc(qaQuery.createdAt)));

      const totalDuration = Date.now() - startTime;
      const totalAnswers = rows.reduce(
        (sum, row) => sum + Number(row.answersCount),
        0,
      );

      logger.info("Query list retrieval completed", {
        queriesReturned: rows.length,
        requestedLimit: limit,
        sort,
        totalAnswersInSet: totalAnswers,
        totalDurationMs: totalDuration,
      });

      return rows;
    }),
});
