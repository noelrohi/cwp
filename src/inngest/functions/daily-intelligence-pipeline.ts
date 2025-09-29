import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  episodeSpeakerMapping,
  podcast,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";
import {
  chunkEpisodeTranscript,
  ensureEpisodeTranscript,
  generateMissingEmbeddings,
} from "@/server/lib/transcript-processing";
import { inngest } from "../client";

const DAILY_INTELLIGENCE_USER_EVENT =
  "app/daily-intelligence.user.process" as const;
const DAILY_INTELLIGENCE_EPISODE_EVENT =
  "app/daily-intelligence.episode.process" as const;
const DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT =
  "app/daily-intelligence.user.generate-signals" as const;

const CHUNK_SETTINGS = {
  minWords: 100,
  maxWords: 800, // ~2 minutes maximum to capture complete thoughts
  useSpeakerTurns: true,
} as const;

const PIPELINE_SETTINGS = {
  maxDailySignals: 30,
  minConfidenceScore: 0.3,
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
        const { chunkCount } = await chunkEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          minTokens: CHUNK_SETTINGS.minWords,
          maxTokens: CHUNK_SETTINGS.maxWords,
          skipEmbeddings: true, // Skip embeddings for speed
        });
        return { chunkCount };
      });

      // Generate embeddings separately for better performance
      await step.run("generate-embeddings", async () => {
        const { embeddingsGenerated } = await generateMissingEmbeddings({
          db,
          episode: normalisedEpisode,
        });
        return { embeddingsGenerated };
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
 * Generate signals for a user using simplified algorithm per Karpathy's advice:
 * - Phase 1: Pure random until user has 10 saves
 * - Phase 2: Simple cosine similarity against user centroid
 * - No negative feedback, no complex blending, no confidence thresholds
 * - Let user actions be the filter, not algorithmic assumptions
 *
 * Store top 30 results for daily review
 */
async function generateUserSignals(userId: string): Promise<number> {
  const preferences = await getOrCreateUserPreferences(userId);
  const candidateChunks = await getNewChunksForUser(userId);

  console.log(
    `User ${userId}: Found ${candidateChunks.length} candidate chunks`,
  );

  if (candidateChunks.length === 0) return 0;

  const scoredChunks = scoreChunksForRelevance(candidateChunks, preferences);
  const filteredChunks = filterRankedChunks(scoredChunks, preferences);

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
        // CRITICAL: Filter by word count to match chunking settings
        sql`${transcriptChunk.wordCount} >= ${CHUNK_SETTINGS.minWords}`,
        sql`${transcriptChunk.wordCount} <= ${CHUNK_SETTINGS.maxWords}`,
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
    `Scoring ${chunks.length} chunks for user. Has signal: ${hasSignal}, saved: ${preferences.totalSaved}`,
  );

  return chunks.map((chunk) => {
    const chunkEmbedding = chunk.embedding as number[] | null;

    // Phase 1: Pure random until user has 10 saves
    if (preferences.totalSaved < 10) {
      return {
        ...chunk,
        relevanceScore: Math.random(),
      };
    }

    // Phase 2: Simple cosine similarity once we have user signal
    if (!chunkEmbedding || !hasSignal || !userEmbedding) {
      return {
        ...chunk,
        relevanceScore: 0.5, // Neutral score for missing embeddings
      };
    }

    // Calculate cosine similarity
    const magnitude1 = Math.sqrt(
      chunkEmbedding.reduce((sum, val) => sum + val * val, 0),
    );
    const magnitude2 = Math.sqrt(
      userEmbedding.reduce((sum, val) => sum + val * val, 0),
    );

    const cosineSimilarity =
      magnitude1 > 0 && magnitude2 > 0
        ? chunkEmbedding.reduce(
            (sum, val, i) => sum + val * userEmbedding[i],
            0,
          ) /
          (magnitude1 * magnitude2)
        : 0;

    // Normalize cosine similarity from [-1, 1] to [0, 1]
    const score = (cosineSimilarity + 1) / 2;

    return {
      ...chunk,
      relevanceScore: Math.max(0.1, Math.min(0.9, score)),
    };
  });
}

function filterRankedChunks(
  chunks: ScoredChunk[],
  preferences: UserPreferenceRecord,
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  console.log(`Filtering chunks. User has ${preferences.totalSaved} saves`);

  // Simple approach: always return top 30 regardless of confidence
  // Let the user's save/skip actions be the filter, not algorithmic thresholds
  return sorted.slice(0, PIPELINE_SETTINGS.maxDailySignals);
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

  // 🚀 BATCH SPEAKER LOOKUP - Single query instead of 200+
  const episodeIds = [...new Set(newChunks.map((chunk) => chunk.episodeId))];

  const speakerMappings = await db
    .select()
    .from(episodeSpeakerMapping)
    .where(inArray(episodeSpeakerMapping.episodeId, episodeIds));

  // Build lookup map
  const speakerMap = new Map<string, Record<string, string>>();
  speakerMappings.forEach((mapping) => {
    speakerMap.set(mapping.episodeId, JSON.parse(mapping.speakerMappings));
  });

  const signalDate = new Date();

  // Create signals with cached speaker names
  const signals = newChunks.map((chunk) => {
    const episodeSpeakers = speakerMap.get(chunk.episodeId);
    const speakerName =
      episodeSpeakers?.[chunk.speaker || "0"] ||
      (chunk.speaker === "0" ? "Host" : `Guest ${chunk.speaker}`);

    return {
      id: randomUUID(),
      chunkId: chunk.id,
      userId,
      signalDate,
      relevanceScore: chunk.relevanceScore,
      title: null,
      summary: null,
      excerpt: chunk.content,
      speakerName,
      userAction: null,
      presentedAt: null,
      actionedAt: null,
    };
  });

  await db.insert(dailySignal).values(signals);
}
