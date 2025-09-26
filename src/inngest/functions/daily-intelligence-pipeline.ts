import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  podcast,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";
import {
  chunkEpisodeTranscript,
  ensureEpisodeTranscript,
} from "@/server/lib/transcript-processing";
import { inngest } from "../client";

const DAILY_INTELLIGENCE_USER_EVENT =
  "app/daily-intelligence.user.process" as const;
const DAILY_INTELLIGENCE_EPISODE_EVENT =
  "app/daily-intelligence.episode.process" as const;
const DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT =
  "app/daily-intelligence.user.generate-signals" as const;

// Configuration from sequence.md - "set once, forget"
const CHUNK_SETTINGS = {
  minWords: 200,
  maxWords: 300,
  useSpeakerTurns: true,
} as const;

const PIPELINE_SETTINGS = {
  maxDailySignals: 30,
  minConfidenceScore: 0.4,
} as const;

const PIPELINE_LOOKBACK_HOURS =
  process.env.NODE_ENV === "development" ? 72 : 24;

/**
 * Daily Intelligence Pipeline - 2:00 AM
 * Simple sequence: users -> podcasts -> episodes -> transcripts -> signals
 */
type DailyIntelligenceUserEvent = {
  pipelineRunId: string;
  userId: string;
  lookbackStart: string;
};

type DailyIntelligenceEpisodeEvent = {
  pipelineRunId: string;
  userId: string;
  episodeId: string;
};

type DailyIntelligenceGenerateSignalsEvent = {
  pipelineRunId: string;
  userId: string;
  episodeId?: string;
};

export const dailyIntelligencePipeline = inngest.createFunction(
  { id: "daily-intelligence-pipeline" },
  { cron: "0 2 * * *" },
  async ({ step, logger }) => {
    const now = new Date();
    const pipelineRunId = randomUUID();
    const lookbackWindowMs = PIPELINE_LOOKBACK_HOURS * 60 * 60 * 1000;
    const lookbackStart = new Date(now.getTime() - lookbackWindowMs);

    logger.info(
      `Running daily intelligence pipeline (lookback=${PIPELINE_LOOKBACK_HOURS}h, run=${pipelineRunId})`,
    );

    const users = await step.run("get-all-users", async () => {
      return await db
        .select({ userId: podcast.userId })
        .from(podcast)
        .groupBy(podcast.userId);
    });

    if (users.length === 0) {
      logger.info("No users with podcasts found for pipeline run");
      return {
        date: now.toISOString().split("T")[0],
        pipelineRunId,
        usersDispatched: 0,
      };
    }

    await step.sendEvent(
      "dispatch-user-processing",
      users.map((user) => ({
        name: DAILY_INTELLIGENCE_USER_EVENT,
        data: {
          pipelineRunId,
          userId: user.userId,
          lookbackStart: lookbackStart.toISOString(),
        } satisfies DailyIntelligenceUserEvent,
      })),
    );

    logger.info(`Dispatched ${users.length} users for daily intelligence run`);

    return {
      date: now.toISOString().split("T")[0],
      pipelineRunId,
      usersDispatched: users.length,
    };
  },
);

export const dailyIntelligenceProcessUser = inngest.createFunction(
  { id: "daily-intelligence-process-user" },
  { event: DAILY_INTELLIGENCE_USER_EVENT },
  async ({ event, step, logger }) => {
    const { pipelineRunId, userId, lookbackStart } =
      event.data as DailyIntelligenceUserEvent;
    const lookbackStartDate = new Date(lookbackStart);

    logger.info(
      `Pipeline run ${pipelineRunId}: processing user ${userId} (lookback start ${lookbackStartDate.toISOString()})`,
    );

    const userPodcasts = await step.run("fetch-user-podcasts", async () => {
      return await db
        .select({ id: podcast.id })
        .from(podcast)
        .where(eq(podcast.userId, userId));
    });

    if (userPodcasts.length === 0) {
      logger.info(
        `Pipeline run ${pipelineRunId}: user ${userId} has no podcasts`,
      );
      return { episodesDispatched: 0 };
    }

    const recentEpisodes = await step.run("fetch-recent-episodes", async () => {
      return await db
        .select()
        .from(episode)
        .where(
          and(
            inArray(
              episode.podcastId,
              userPodcasts.map((p) => p.id),
            ),
            gte(episode.publishedAt, lookbackStartDate),
          ),
        );
    });

    const pendingEpisodes = recentEpisodes.filter(
      (ep) => ep.status !== "processed",
    );

    if (pendingEpisodes.length === 0) {
      logger.info(
        `Pipeline run ${pipelineRunId}: user ${userId} has no pending episodes`,
      );
      return { episodesDispatched: 0 };
    }

    await step.sendEvent(
      "dispatch-episode-processing",
      pendingEpisodes.map((ep) => ({
        name: DAILY_INTELLIGENCE_EPISODE_EVENT,
        data: {
          pipelineRunId,
          userId,
          episodeId: ep.id,
        } satisfies DailyIntelligenceEpisodeEvent,
      })),
    );

    logger.info(
      `Pipeline run ${pipelineRunId}: dispatched ${pendingEpisodes.length} episodes for user ${userId}`,
    );

    return { episodesDispatched: pendingEpisodes.length };
  },
);

export const dailyIntelligenceProcessEpisode = inngest.createFunction(
  { id: "daily-intelligence-process-episode" },
  { event: DAILY_INTELLIGENCE_EPISODE_EVENT },
  async ({ event, step, logger }) => {
    const { pipelineRunId, userId, episodeId } =
      event.data as DailyIntelligenceEpisodeEvent;

    logger.info(
      `Pipeline run ${pipelineRunId}: processing episode ${episodeId} for user ${userId}`,
    );

    const episodeRecord = await step.run("load-episode", async () => {
      const [row] = await db
        .select()
        .from(episode)
        .where(eq(episode.id, episodeId))
        .limit(1);
      return row ?? null;
    });

    if (!episodeRecord) {
      logger.error(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} not found`,
      );
      return { status: "missing" } as const;
    }

    if (episodeRecord.status === "processed") {
      logger.info(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} already processed`,
      );
      await step.sendEvent("signal-generation", [
        {
          name: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT,
          data: {
            pipelineRunId,
            userId,
          } satisfies DailyIntelligenceGenerateSignalsEvent,
        },
      ]);
      return { status: "already-processed" } as const;
    }

    try {
      const normalisedEpisode = {
        ...episodeRecord,
        createdAt: new Date(episodeRecord.createdAt),
        updatedAt: new Date(episodeRecord.updatedAt),
        publishedAt: episodeRecord.publishedAt
          ? new Date(episodeRecord.publishedAt)
          : null,
      };

      const transcriptResult = await step.run("ensure-transcript", async () => {
        return await ensureEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          force: false,
        });
      });

      normalisedEpisode.transcriptUrl = transcriptResult.transcriptUrl;

      await step.run("chunk-transcript", async () => {
        await chunkEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          minTokens: CHUNK_SETTINGS.minWords,
          maxTokens: CHUNK_SETTINGS.maxWords,
        });
        return "ok";
      });
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string" ? error : JSON.stringify(error),
            );
      logger.error(
        `Pipeline run ${pipelineRunId}: failed to process episode ${episodeId}`,
        {
          error: err.message,
          stack: err.stack,
        },
      );
      await step.run("mark-failed", async () => {
        await db
          .update(episode)
          .set({ status: "failed" })
          .where(eq(episode.id, episodeId));
      });
      throw err;
    }

    await step.sendEvent("signal-generation", [
      {
        name: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT,
        data: {
          pipelineRunId,
          userId,
          episodeId,
        } satisfies DailyIntelligenceGenerateSignalsEvent,
      },
    ]);

    logger.info(
      `Pipeline run ${pipelineRunId}: episode ${episodeId} transcript processed and signal generation dispatched for user ${userId}`,
    );

    return { status: "transcript-processed" } as const;
  },
);

export const dailyIntelligenceGenerateSignals = inngest.createFunction(
  { id: "daily-intelligence-generate-signals" },
  { event: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT },
  async ({ event, step, logger }) => {
    const { pipelineRunId, userId, episodeId } =
      event.data as DailyIntelligenceGenerateSignalsEvent;

    const signalsGenerated = await step.run(
      "generate-user-signals",
      async () => await generateUserSignals(userId),
    );

    // Mark episode as processed only after successful signal generation
    if (episodeId) {
      await step.run("mark-episode-processed", async () => {
        await db
          .update(episode)
          .set({ status: "processed" })
          .where(eq(episode.id, episodeId));
      });

      logger.info(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} marked as processed after signal generation`,
      );
    }

    logger.info(
      `Pipeline run ${pipelineRunId}: generated ${signalsGenerated} signals for user ${userId}`,
    );

    return { signalsGenerated };
  },
);

/**
 * Generate signals for a user based on relevance and importance
 * Store top 30 results for daily review at 8:00 AM
 */
async function generateUserSignals(userId: string): Promise<number> {
  const preferences = await getOrCreateUserPreferences(userId);
  const candidateChunks = await getNewChunksForUser(userId);

  console.log(
    `User ${userId}: Found ${candidateChunks.length} candidate chunks`,
  );

  if (candidateChunks.length === 0) return 0;

  const scoredChunks = scoreChunksForRelevance(candidateChunks, preferences);
  const filteredChunks = filterRankedChunks(scoredChunks);

  console.log(
    `User ${userId}: After filtering, ${filteredChunks.length} chunks`,
  );

  if (filteredChunks.length === 0) return 0;

  await storeDailySignals(userId, filteredChunks);

  return filteredChunks.length;
}

type UserPreferenceRecord = typeof userPreferences.$inferSelect;

type ChunkRecord = {
  id: string;
  content: string;
  episodeId: string;
  embedding: number[] | null;
  createdAt: Date;
  episodeTitle: string | null;
  episodeExternalId: string | null;
  episodePublishedAt: Date | string | null;
  podcastTitle: string | null;
  podcastFeedUrl: string | null;
  speaker: string | null;
};

type ScoredChunk = ChunkRecord & { relevanceScore: number };

async function getOrCreateUserPreferences(
  userId: string,
): Promise<UserPreferenceRecord> {
  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  await db.insert(userPreferences).values({
    id: randomUUID(),
    userId,
    centroidEmbedding: new Array(1536).fill(0),
    totalSaved: 0,
    totalSkipped: 0,
    lastUpdated: new Date(),
  });

  const [created] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return created;
}

async function getNewChunksForUser(userId: string): Promise<ChunkRecord[]> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const chunks = await db
    .select({
      id: transcriptChunk.id,
      content: transcriptChunk.content,
      episodeId: transcriptChunk.episodeId,
      embedding: transcriptChunk.embedding,
      createdAt: transcriptChunk.createdAt,
      episodeTitle: episode.title,
      episodeExternalId: episode.episodeId,
      episodePublishedAt: episode.publishedAt,
      podcastTitle: podcast.title,
      podcastFeedUrl: podcast.feedUrl,
      speaker: transcriptChunk.speaker,
      startTimeSec: transcriptChunk.startTimeSec,
      endTimeSec: transcriptChunk.endTimeSec,
      transcriptUrl: episode.transcriptUrl,
    })
    .from(transcriptChunk)
    .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .innerJoin(podcast, eq(episode.podcastId, podcast.id))
    .leftJoin(
      dailySignal,
      and(
        eq(dailySignal.chunkId, transcriptChunk.id),
        eq(dailySignal.userId, userId),
      ),
    )
    .where(
      and(
        eq(podcast.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
        sql`${dailySignal.id} IS NULL`,
        gte(transcriptChunk.createdAt, twoDaysAgo),
      ),
    );

  console.log(
    `User ${userId}: getNewChunksForUser returned ${chunks.length} chunks`,
  );
  return chunks;
}

function scoreChunksForRelevance(
  chunks: ChunkRecord[],
  preferences: UserPreferenceRecord,
): ScoredChunk[] {
  const userEmbedding = preferences.centroidEmbedding as number[] | null;
  const hasSignal = Array.isArray(userEmbedding)
    ? userEmbedding.some((value) => value !== 0)
    : false;

  console.log(
    `Scoring ${chunks.length} chunks for user. Has signal: ${hasSignal}`,
  );

  return chunks.map((chunk) => {
    const chunkEmbedding = chunk.embedding as number[] | null;
    const baseScore = 0.5;

    if (!chunkEmbedding || !hasSignal || !userEmbedding) {
      return { ...chunk, relevanceScore: baseScore };
    }

    // Use dot product instead of cosine similarity for preference learning
    const dotProduct = chunkEmbedding.reduce(
      (sum, val, i) => sum + val * userEmbedding[i],
      0,
    );
    const score = normalizeScore(dotProduct);
    console.log(`Chunk ${chunk.id}: dot product ${dotProduct}, score ${score}`);
    return {
      ...chunk,
      relevanceScore: score,
    };
  });
}

function filterRankedChunks(chunks: ScoredChunk[]): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  const confident = sorted.filter(
    (chunk) => chunk.relevanceScore >= PIPELINE_SETTINGS.minConfidenceScore,
  );

  if (confident.length >= PIPELINE_SETTINGS.maxDailySignals) {
    return confident.slice(0, PIPELINE_SETTINGS.maxDailySignals);
  }

  if (confident.length > 0) {
    const remainingSlots = PIPELINE_SETTINGS.maxDailySignals - confident.length;
    const fallback = sorted
      .filter(
        (chunk) => chunk.relevanceScore < PIPELINE_SETTINGS.minConfidenceScore,
      )
      .slice(0, remainingSlots);
    return confident.concat(fallback);
  }

  return sorted.slice(
    0,
    Math.min(sorted.length, PIPELINE_SETTINGS.maxDailySignals),
  );
}

async function storeDailySignals(
  userId: string,
  chunks: ScoredChunk[],
): Promise<void> {
  if (chunks.length === 0) return;

  const existingSignals = await db
    .select({ chunkId: dailySignal.chunkId })
    .from(dailySignal)
    .where(
      and(
        eq(dailySignal.userId, userId),
        inArray(
          dailySignal.chunkId,
          chunks.map((chunk) => chunk.id),
        ),
      ),
    );

  const existingIds = new Set(existingSignals.map((signal) => signal.chunkId));
  const newChunks = chunks.filter((chunk) => !existingIds.has(chunk.id));

  if (newChunks.length === 0) return;

  const signalDate = new Date();

  await db.insert(dailySignal).values(
    newChunks.map((chunk) => {
      return {
        id: randomUUID(),
        chunkId: chunk.id,
        userId,
        signalDate,
        relevanceScore: chunk.relevanceScore,
        title: null,
        summary: null,
        excerpt: chunk.content,
        speakerName: chunk.speaker
          ? `Speaker ${Number(chunk.speaker) + 1}`
          : "Unknown Speaker",
        userAction: null,
        presentedAt: null,
        actionedAt: null,
      };
    }),
  );
}

function normalizeScore(raw: number): number {
  const clamped = Math.max(-1, Math.min(1, raw));
  return (clamped + 1) / 2;
}
