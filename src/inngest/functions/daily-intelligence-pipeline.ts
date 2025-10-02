import { randomUUID } from "node:crypto";
import { cosineSimilarity } from "ai";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  episodeSpeakerMapping,
  podcast,
  savedChunk,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";
import { identifyEpisodeSpeakers } from "@/server/lib/speaker-identification";
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
const DAILY_INTELLIGENCE_EPISODE_REPROCESS_EVENT =
  "app/daily-intelligence.episode.reprocess" as const;
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

    const episodeData = await step.run("load-episode", async () => {
      const result = await db.query.episode.findFirst({
        where: eq(episode.id, episodeId),
        with: {
          podcast: true,
        },
      });
      return result ?? null;
    });

    if (!episodeData) {
      logger.error(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} not found`,
      );
      return { status: "missing" } as const;
    }

    if (episodeData.status === "processed") {
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
        ...episodeData,
        createdAt: new Date(episodeData.createdAt),
        updatedAt: new Date(episodeData.updatedAt),
        publishedAt: episodeData.publishedAt
          ? new Date(episodeData.publishedAt)
          : null,
        lastProcessedAt: episodeData.lastProcessedAt
          ? new Date(episodeData.lastProcessedAt)
          : null,
        processingStartedAt: episodeData.processingStartedAt
          ? new Date(episodeData.processingStartedAt)
          : null,
      };

      const transcriptResult = await step.run("ensure-transcript", async () => {
        return await ensureEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          force: episodeData.status !== "processed", // Force refetch if not cleanly processed
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

      // Identify speakers using AI
      await step.run("identify-speakers", async () => {
        if (!episodeData.podcast) {
          logger.warn(
            `Episode ${episodeId} has no podcast info, skipping speaker identification`,
          );
          return { identified: false };
        }

        const speakerResult = await identifyEpisodeSpeakers({
          db,
          episodeId: episodeData.id,
          episodeTitle: episodeData.title,
          episodeDescription: episodeData.description,
          itunesSummary: episodeData.itunesSummary,
          contentEncoded: episodeData.contentEncoded,
          creator: episodeData.creator,
          podcastTitle: episodeData.podcast.title,
          podcastDescription: episodeData.podcast.description,
        });

        return {
          identified: speakerResult !== null,
          confidence: speakerResult?.confidence,
        };
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

export const dailyIntelligenceReprocessEpisode = inngest.createFunction(
  { id: "daily-intelligence-reprocess-episode" },
  { event: DAILY_INTELLIGENCE_EPISODE_REPROCESS_EVENT },
  async ({ event, step, logger }) => {
    const { pipelineRunId, userId, episodeId } =
      event.data as DailyIntelligenceEpisodeEvent;

    logger.info(
      `Pipeline run ${pipelineRunId}: FULL REPROCESS of episode ${episodeId} for user ${userId}`,
    );

    const episodeData = await step.run("load-episode", async () => {
      const result = await db.query.episode.findFirst({
        where: eq(episode.id, episodeId),
        with: {
          podcast: true,
        },
      });
      return result ?? null;
    });

    if (!episodeData) {
      logger.error(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} not found`,
      );
      return { status: "missing" } as const;
    }

    try {
      // DESTRUCTIVE: Delete all chunks and signals for this episode
      // Cascade deletes will handle:
      // - transcript_chunk -> daily_signal (cascade)
      // - transcript_chunk -> saved_chunk (cascade)
      // - episode_speaker_mapping (cascade)
      await step.run("delete-existing-data", async () => {
        // Delete chunks (signals and saved_chunks will cascade)
        await db
          .delete(transcriptChunk)
          .where(eq(transcriptChunk.episodeId, episodeId));

        // Delete speaker mapping
        await db
          .delete(episodeSpeakerMapping)
          .where(eq(episodeSpeakerMapping.episodeId, episodeId));

        logger.info(
          `Deleted all chunks, signals, and speaker mappings for episode ${episodeId}`,
        );
      });

      // Reset episode to pending state
      await step.run("reset-episode-status", async () => {
        await db
          .update(episode)
          .set({
            status: "pending",
            transcriptUrl: null,
            lastProcessedAt: null,
          })
          .where(eq(episode.id, episodeId));
      });

      const normalisedEpisode = {
        ...episodeData,
        createdAt: new Date(episodeData.createdAt),
        updatedAt: new Date(episodeData.updatedAt),
        publishedAt: episodeData.publishedAt
          ? new Date(episodeData.publishedAt)
          : null,
        lastProcessedAt: null,
        processingStartedAt: episodeData.processingStartedAt
          ? new Date(episodeData.processingStartedAt)
          : null,
      };

      // Re-fetch transcript with force=true
      const transcriptResult = await step.run(
        "force-refetch-transcript",
        async () => {
          return await ensureEpisodeTranscript({
            db,
            episode: normalisedEpisode,
            force: true, // FORCE REFETCH
          });
        },
      );

      normalisedEpisode.transcriptUrl = transcriptResult.transcriptUrl;

      // Re-chunk transcript
      await step.run("rechunk-transcript", async () => {
        const { chunkCount } = await chunkEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          minTokens: CHUNK_SETTINGS.minWords,
          maxTokens: CHUNK_SETTINGS.maxWords,
          skipEmbeddings: true,
        });
        return { chunkCount };
      });

      // Re-identify speakers
      await step.run("reidentify-speakers", async () => {
        if (!episodeData.podcast) {
          logger.warn(
            `Episode ${episodeId} has no podcast info, skipping speaker identification`,
          );
          return { identified: false };
        }

        const speakerResult = await identifyEpisodeSpeakers({
          db,
          episodeId: episodeData.id,
          episodeTitle: episodeData.title,
          episodeDescription: episodeData.description,
          itunesSummary: episodeData.itunesSummary,
          contentEncoded: episodeData.contentEncoded,
          creator: episodeData.creator,
          podcastTitle: episodeData.podcast.title,
          podcastDescription: episodeData.podcast.description,
        });

        return {
          identified: speakerResult !== null,
          confidence: speakerResult?.confidence,
        };
      });

      // Generate embeddings
      await step.run("regenerate-embeddings", async () => {
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
        `Pipeline run ${pipelineRunId}: failed to reprocess episode ${episodeId}`,
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

    // Generate new signals
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
      `Pipeline run ${pipelineRunId}: episode ${episodeId} FULLY REPROCESSED, signal generation dispatched`,
    );

    return { status: "reprocessed" } as const;
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
      async () => await generateUserSignals(userId, episodeId, true),
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
      `Pipeline run ${pipelineRunId}: generated ${signalsGenerated} signals for user ${userId}${episodeId ? ` (episode: ${episodeId})` : ""}`,
    );

    return { signalsGenerated };
  },
);

/**
 * Generate signals for a user using simplified algorithm per Karpathy's advice:
 * - Phase 1: Pure random until user has 10 saves (cold start exploration)
 * - Phase 2a: Positive-only similarity (< 5 skips)
 * - Phase 2b: Contrastive learning (≥ 5 skips) - NEW!
 *   - Score = similarity(saved_centroid) - similarity(skipped_centroid)
 *   - User skipping low scores reinforces "system got it right"
 *   - Spreads distribution across full 0-100% range
 *
 * Store top 30 results for daily review via stratified sampling
 *
 * @param userId - User to generate signals for
 * @param episodeId - Optional episode ID to limit signal generation to specific episode
 * @param forceRegenerate - If true, includes chunks that already have signals (for regeneration)
 */
async function generateUserSignals(
  userId: string,
  episodeId?: string,
  forceRegenerate = false,
): Promise<number> {
  const preferences = await getOrCreateUserPreferences(userId);
  const candidateChunks = await getNewChunksForUser(
    userId,
    episodeId,
    forceRegenerate,
  );

  console.log(
    `User ${userId}: Found ${candidateChunks.length} candidate chunks${episodeId ? ` (episode: ${episodeId})` : ""}${forceRegenerate ? " [FORCE REGENERATE]" : ""}`,
  );

  if (candidateChunks.length === 0) return 0;

  const scoredChunks = await scoreChunksForRelevance(
    candidateChunks,
    preferences,
    userId,
  );
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
    totalSaved: 0,
    totalSkipped: 0,
    preferredPodcasts: "[]",
    preferredSpeakers: "[]",
    preferredContentLength: "medium",
    averageEngagementScore: 0.5,
    lastUpdated: new Date(),
  });

  const [created] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return created;
}

async function getNewChunksForUser(
  userId: string,
  episodeId?: string,
  forceRegenerate = false,
): Promise<ChunkRecord[]> {
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
        // Only exclude existing signals if NOT force regenerating
        forceRegenerate ? undefined : sql`${dailySignal.id} IS NULL`,
        // Filter by specific episode if provided
        episodeId ? eq(episode.id, episodeId) : undefined,
        gte(transcriptChunk.createdAt, twoDaysAgo),
        // CRITICAL: Filter by word count to match chunking settings
        sql`${transcriptChunk.wordCount} >= ${CHUNK_SETTINGS.minWords}`,
        sql`${transcriptChunk.wordCount} <= ${CHUNK_SETTINGS.maxWords}`,
      ),
    );

  console.log(
    `User ${userId}: getNewChunksForUser returned ${chunks.length} chunks${episodeId ? ` (episode: ${episodeId})` : ""}${forceRegenerate ? " [including existing signals]" : ""}`,
  );
  return chunks;
}

async function scoreChunksForRelevance(
  chunks: ChunkRecord[],
  preferences: UserPreferenceRecord,
  userId: string,
): Promise<ScoredChunk[]> {
  console.log(
    `Scoring ${chunks.length} chunks for user ${userId}. Total saved: ${preferences.totalSaved}`,
  );

  // PHASE 1: Random scoring until we have 10 saves
  // This avoids cold-start bias and lets the user train the system
  if (preferences.totalSaved < 10) {
    console.log(
      `User ${userId} has < 10 saves. Using random distribution for exploration.`,
    );
    return chunks.map((chunk) => ({
      ...chunk,
      relevanceScore: Math.random(), // Pure random 0.0-1.0
    }));
  }

  // PHASE 2: Embedding-based similarity - NOW WITH CONTRASTIVE LEARNING

  // Get embeddings of all saved chunks (positive examples)
  const savedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  // Get embeddings of all skipped chunks (negative examples)
  const skippedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "skipped"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  if (savedChunks.length === 0) {
    console.log(
      `User ${userId} has saves but no embeddings. Falling back to random.`,
    );
    return chunks.map((chunk) => ({
      ...chunk,
      relevanceScore: Math.random(),
    }));
  }

  // Calculate saved centroid (what user likes)
  const savedCentroid = calculateCentroid(
    savedChunks.map((c) => c.embedding as number[]),
  );

  // CONTRASTIVE LEARNING: Use skipped chunks if we have enough
  const useContrastiveScoring = skippedChunks.length >= 5;

  if (useContrastiveScoring) {
    // Calculate skipped centroid (what user dislikes)
    const skippedCentroid = calculateCentroid(
      skippedChunks.map((c) => c.embedding as number[]),
    );

    // DIAGNOSTIC: Check if centroids are too similar
    const centroidSimilarity = cosineSimilarity(savedCentroid, skippedCentroid);

    console.log(
      `User ${userId}: Using CONTRASTIVE scoring with ${savedChunks.length} saved + ${skippedChunks.length} skipped chunks`,
    );
    console.log(
      `User ${userId}: Centroid similarity: ${centroidSimilarity.toFixed(3)} ` +
        `(${centroidSimilarity > 0.9 ? "⚠️ TOO SIMILAR - centroids nearly identical!" : centroidSimilarity > 0.7 ? "⚠️ High similarity - limited discrimination" : "✅ Good separation"})`,
    );

    // FALLBACK: If centroids are too similar (> 0.85), contrastive scoring won't help
    // Fall back to positive-only scoring
    if (centroidSimilarity > 0.85) {
      console.log(
        `User ${userId}: ⚠️ Centroids too similar (${centroidSimilarity.toFixed(3)} > 0.85), ` +
          `falling back to POSITIVE-ONLY scoring to avoid clustering at 0.5`,
      );

      return chunks.map((chunk) => {
        if (!chunk.embedding) {
          return {
            ...chunk,
            relevanceScore: 0.3,
          };
        }

        const similarity = cosineSimilarity(chunk.embedding, savedCentroid);
        const relevanceScore = Math.max(0, similarity);

        return {
          ...chunk,
          relevanceScore,
        };
      });
    }

    // Contrastive scoring: positive similarity MINUS negative similarity
    const scoredChunks = chunks.map((chunk) => {
      if (!chunk.embedding) {
        return {
          ...chunk,
          relevanceScore: 0.3,
        };
      }

      const savedSimilarity = cosineSimilarity(chunk.embedding, savedCentroid);
      const skippedSimilarity = cosineSimilarity(
        chunk.embedding,
        skippedCentroid,
      );

      // Contrastive score: how similar to saved MINUS how similar to skipped
      // Cosine similarity ranges from -1 to 1, so difference ranges from -2 to 2
      const contrastiveScore = savedSimilarity - skippedSimilarity;

      // Normalize to 0-1 range: map [-2, 2] to [0, 1]
      const normalizedScore = (contrastiveScore + 2) / 4;

      // Clamp to ensure we stay in [0, 1]
      const relevanceScore = Math.max(0, Math.min(1, normalizedScore));

      return {
        ...chunk,
        relevanceScore,
      };
    });

    // Log distribution for validation
    const distribution = {
      veryLow: scoredChunks.filter((c) => c.relevanceScore < 0.2).length,
      low: scoredChunks.filter(
        (c) => c.relevanceScore >= 0.2 && c.relevanceScore < 0.4,
      ).length,
      mid: scoredChunks.filter(
        (c) => c.relevanceScore >= 0.4 && c.relevanceScore < 0.6,
      ).length,
      high: scoredChunks.filter(
        (c) => c.relevanceScore >= 0.6 && c.relevanceScore < 0.8,
      ).length,
      veryHigh: scoredChunks.filter((c) => c.relevanceScore >= 0.8).length,
    };

    const minScore = Math.min(...scoredChunks.map((c) => c.relevanceScore));
    const maxScore = Math.max(...scoredChunks.map((c) => c.relevanceScore));
    const avgScore =
      scoredChunks.reduce((sum, c) => sum + c.relevanceScore, 0) /
      scoredChunks.length;

    console.log(
      `User ${userId}: Contrastive score distribution: ` +
        `0-20%: ${distribution.veryLow}, ` +
        `20-40%: ${distribution.low}, ` +
        `40-60%: ${distribution.mid}, ` +
        `60-80%: ${distribution.high}, ` +
        `80-100%: ${distribution.veryHigh}`,
    );
    console.log(
      `User ${userId}: Score stats: min=${minScore.toFixed(3)}, max=${maxScore.toFixed(3)}, avg=${avgScore.toFixed(3)}, range=${(maxScore - minScore).toFixed(3)}`,
    );

    // WARNING: If all scores are clustered around 0.5, contrastive isn't helping
    if (maxScore - minScore < 0.1) {
      console.warn(
        `User ${userId}: ⚠️ WARNING - Contrastive scores too clustered (range < 0.1). ` +
          `Saved/skipped centroids may be too similar. Consider using positive-only scoring.`,
      );
    }

    return scoredChunks;
  }

  // Fallback: Positive-only scoring (original behavior)
  console.log(
    `User ${userId}: Using POSITIVE-ONLY scoring against ${savedChunks.length} saved chunks ` +
      `(need ${5 - skippedChunks.length} more skips for contrastive learning)`,
  );

  return chunks.map((chunk) => {
    if (!chunk.embedding) {
      return {
        ...chunk,
        relevanceScore: 0.3,
      };
    }

    const similarity = cosineSimilarity(chunk.embedding, savedCentroid);
    const relevanceScore = Math.max(0, similarity);

    return {
      ...chunk,
      relevanceScore,
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

  const targetCount = PIPELINE_SETTINGS.maxDailySignals;

  if (sorted.length <= targetCount) {
    return sorted;
  }

  // STRATIFIED SAMPLING: Ensure distribution across confidence ranges
  // This allows user to train on both good (high score) and bad (low score) examples
  // Per Karpathy/Usman: "When I see a 23% confidence chunk and click skip,
  // that's reinforcing data that the system got the bad chunk right"

  // Define buckets for stratified sampling
  const buckets = {
    veryLow: sorted.filter((c) => c.relevanceScore < 0.3), // 0-30%
    low: sorted.filter(
      (c) => c.relevanceScore >= 0.3 && c.relevanceScore < 0.5,
    ), // 30-50%
    mid: sorted.filter(
      (c) => c.relevanceScore >= 0.5 && c.relevanceScore < 0.65,
    ), // 50-65%
    high: sorted.filter(
      (c) => c.relevanceScore >= 0.65 && c.relevanceScore < 0.8,
    ), // 65-80%
    veryHigh: sorted.filter((c) => c.relevanceScore >= 0.8), // 80-100%
  };

  // Target distribution (these percentages should sum to 100)
  // Weighted toward high confidence but including low for training
  const distribution = {
    veryLow: 0.1, // 10% - Show some clearly bad examples
    low: 0.15, // 15% - Show low confidence examples
    mid: 0.25, // 25% - System is unsure
    high: 0.35, // 35% - Likely good matches
    veryHigh: 0.15, // 15% - Very confident matches
  };

  const selected: ScoredChunk[] = [];

  // Sample from each bucket according to distribution
  for (const [bucket, weight] of Object.entries(distribution)) {
    const bucketChunks = buckets[bucket as keyof typeof buckets];
    const targetFromBucket = Math.floor(targetCount * weight);

    if (bucketChunks.length === 0) continue;

    // Take top N from this bucket (still ranked within bucket)
    const fromBucket = bucketChunks.slice(
      0,
      Math.min(targetFromBucket, bucketChunks.length),
    );
    selected.push(...fromBucket);
  }

  // If we haven't filled targetCount due to empty buckets, fill with highest remaining
  if (selected.length < targetCount) {
    const selectedIds = new Set(selected.map((c) => c.id));
    const remaining = sorted.filter((c) => !selectedIds.has(c.id));
    const needed = targetCount - selected.length;
    selected.push(...remaining.slice(0, needed));
  }

  // Sort final selection by score descending for presentation
  const final = selected.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Log distribution for debugging
  const finalBuckets = {
    veryLow: final.filter((c) => c.relevanceScore < 0.3).length,
    low: final.filter((c) => c.relevanceScore >= 0.3 && c.relevanceScore < 0.5)
      .length,
    mid: final.filter((c) => c.relevanceScore >= 0.5 && c.relevanceScore < 0.65)
      .length,
    high: final.filter(
      (c) => c.relevanceScore >= 0.65 && c.relevanceScore < 0.8,
    ).length,
    veryHigh: final.filter((c) => c.relevanceScore >= 0.8).length,
  };

  console.log(
    `Selected ${final.length} signals via stratified sampling:`,
    `0-30%: ${finalBuckets.veryLow},`,
    `30-50%: ${finalBuckets.low},`,
    `50-65%: ${finalBuckets.mid},`,
    `65-80%: ${finalBuckets.high},`,
    `80-100%: ${finalBuckets.veryHigh}`,
  );
  console.log(
    `Score range: ${final[final.length - 1]?.relevanceScore.toFixed(2)} - ${final[0]?.relevanceScore.toFixed(2)}`,
  );

  return final;
}

async function storeDailySignals(
  userId: string,
  chunks: ScoredChunk[],
): Promise<void> {
  if (chunks.length === 0) return;

  // 🚀 BATCH SPEAKER LOOKUP - Single query instead of 200+
  const episodeIds = [...new Set(chunks.map((chunk) => chunk.episodeId))];

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
  // Include ALL chunks - UPSERT will handle existing vs new
  const signals = chunks.map((chunk) => {
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

  await db
    .insert(dailySignal)
    .values(signals)
    .onConflictDoUpdate({
      target: [dailySignal.chunkId, dailySignal.userId],
      set: {
        // Only update scores for signals user hasn't acted on
        // Preserves historical context for training data
        relevanceScore: sql`CASE 
          WHEN ${dailySignal.userAction} IS NULL 
          THEN excluded.relevance_score 
          ELSE ${dailySignal.relevanceScore} 
        END`,
        excerpt: sql`CASE 
          WHEN ${dailySignal.userAction} IS NULL 
          THEN excluded.excerpt 
          ELSE ${dailySignal.excerpt} 
        END`,
        speakerName: sql`CASE 
          WHEN ${dailySignal.userAction} IS NULL 
          THEN excluded.speaker_name 
          ELSE ${dailySignal.speakerName} 
        END`,
        signalDate: sql`excluded.signal_date`,
      },
    });
}

/**
 * Calculate the centroid (average) of embedding vectors
 */
function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error("Cannot calculate centroid of empty embedding set");
  }

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  // Sum all embeddings
  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  // Average
  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

// Using cosineSimilarity from 'ai' package (imported above)
// Returns value between -1 (opposite) and 1 (identical)
