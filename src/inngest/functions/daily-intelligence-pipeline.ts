import { randomUUID } from "node:crypto";
import { cosineSimilarity } from "ai";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  episodeSpeakerMapping,
  episodeSummary,
  podcast,
  savedChunk,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";
import { generateEpisodeSummary } from "@/server/lib/episode-summary";
import { hybridScoreBatchWithNovelty } from "@/server/lib/hybrid-scoring";
import type {
  HybridDiagnostics,
  ScoringMethod,
} from "@/server/lib/hybrid-types";
import { identifyEpisodeSpeakers } from "@/server/lib/speaker-identification";
import {
  chunkEpisodeTranscript,
  ensureEpisodeTranscript,
  generateMissingEmbeddings,
} from "@/server/lib/transcript-processing";
import type { TranscriptData } from "@/types/transcript";
import { inngest } from "../client";

const DAILY_INTELLIGENCE_USER_EVENT =
  "app/daily-intelligence.user.process" as const;
const DAILY_INTELLIGENCE_EPISODE_EVENT =
  "app/daily-intelligence.episode.process" as const;
const DAILY_INTELLIGENCE_EPISODE_REPROCESS_EVENT =
  "app/daily-intelligence.episode.reprocess" as const;
const DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT =
  "app/daily-intelligence.user.generate-signals" as const;
const DAILY_INTELLIGENCE_EPISODE_PROCESS_WITH_SIGNALS_EVENT =
  "app/daily-intelligence.episode.process-with-signals" as const;

const CHUNK_SETTINGS = {
  minWords: 100,
  maxWords: 800, // ~2 minutes maximum to capture complete thoughts
  useSpeakerTurns: true,
} as const;

const PIPELINE_SETTINGS = {
  maxDailySignals: 30,
  minConfidenceScore: 0.3,
} as const;

/**
 * Daily Intelligence Pipeline - Event-driven processing
 * Simple sequence: users -> podcasts -> episodes -> transcripts -> signals
 * Trigger manually via DAILY_INTELLIGENCE_USER_EVENT
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
  maxSignals?: number;
  regenerate?: boolean;
};

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
        `Pipeline run ${pipelineRunId}: episode ${episodeId} already processed, skipping`,
      );
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
        signalsGeneratedAt: episodeData.signalsGeneratedAt
          ? new Date(episodeData.signalsGeneratedAt)
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

      // Generate episode summary (if not already exists)
      await step.run("generate-summary", async () => {
        // Check if summary already exists
        const existingSummary = await db.query.episodeSummary.findFirst({
          where: eq(episodeSummary.episodeId, episodeId),
        });

        if (existingSummary) {
          logger.info(
            `Pipeline run ${pipelineRunId}: episode ${episodeId} already has summary, skipping generation`,
          );
          return { summaryGenerated: false };
        }

        // Ensure transcript URL exists
        if (!normalisedEpisode.transcriptUrl) {
          logger.warn(
            `Pipeline run ${pipelineRunId}: episode ${episodeId} has no transcript URL, skipping summary generation`,
          );
          return { summaryGenerated: false };
        }

        // Fetch transcript to generate summary
        const transcriptResponse = await fetch(normalisedEpisode.transcriptUrl);
        if (!transcriptResponse.ok) {
          logger.warn(
            `Pipeline run ${pipelineRunId}: failed to fetch transcript for summary generation`,
          );
          return { summaryGenerated: false };
        }

        const transcript: TranscriptData = await transcriptResponse.json();
        const markdownContent = await generateEpisodeSummary(
          transcript,
          episodeData.title,
        );

        // Store summary
        await db.insert(episodeSummary).values({
          id: randomUUID(),
          episodeId,
          markdownContent,
        });

        logger.info(
          `Pipeline run ${pipelineRunId}: episode ${episodeId} summary generated`,
        );
        return { summaryGenerated: true };
      });

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

      await step.run("mark-processed", async () => {
        await db
          .update(episode)
          .set({
            status: "processed",
            lastProcessedAt: new Date(),
          })
          .where(eq(episode.id, episodeId));
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

    logger.info(
      `Pipeline run ${pipelineRunId}: episode ${episodeId} processed and ready for manual signal generation by user ${userId}`,
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

        // Delete episode summary
        await db
          .delete(episodeSummary)
          .where(eq(episodeSummary.episodeId, episodeId));

        logger.info(
          `Deleted all chunks, signals, speaker mappings, and summary for episode ${episodeId}`,
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
        signalsGeneratedAt: episodeData.signalsGeneratedAt
          ? new Date(episodeData.signalsGeneratedAt)
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

      // Regenerate episode summary
      await step.run("regenerate-summary", async () => {
        // Ensure transcript URL exists
        if (!normalisedEpisode.transcriptUrl) {
          logger.warn(
            `Pipeline run ${pipelineRunId}: episode ${episodeId} has no transcript URL, skipping summary generation`,
          );
          return { summaryGenerated: false };
        }

        // Fetch transcript to generate summary
        const transcriptResponse = await fetch(normalisedEpisode.transcriptUrl);
        if (!transcriptResponse.ok) {
          logger.warn(
            `Pipeline run ${pipelineRunId}: failed to fetch transcript for summary generation`,
          );
          return { summaryGenerated: false };
        }

        const transcript: TranscriptData = await transcriptResponse.json();
        const markdownContent = await generateEpisodeSummary(
          transcript,
          episodeData.title,
        );

        // Store summary
        await db.insert(episodeSummary).values({
          id: randomUUID(),
          episodeId,
          markdownContent,
        });

        logger.info(
          `Pipeline run ${pipelineRunId}: episode ${episodeId} summary regenerated`,
        );
        return { summaryGenerated: true };
      });

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

      await step.run("mark-processed", async () => {
        await db
          .update(episode)
          .set({
            status: "processed",
            lastProcessedAt: new Date(),
          })
          .where(eq(episode.id, episodeId));
      });

      const signalResult = await step.run("generate-signals", async () => {
        const diagnostics = await generateUserSignals({
          userId,
          episodeId,
          forceRegenerate: false,
          maxSignals: PIPELINE_SETTINGS.maxDailySignals,
        });

        await db
          .update(episode)
          .set({
            signalsGeneratedAt: new Date(),
          })
          .where(eq(episode.id, episodeId));

        logger.info(
          `Pipeline run ${pipelineRunId}: episode ${episodeId} signals generated (${diagnostics.signalsGenerated} signals)`,
        );

        return {
          signalsGenerated: diagnostics.signalsGenerated,
        };
      });

      logger.info(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} FULLY REPROCESSED WITH SIGNALS`,
      );

      return {
        status: "reprocessed-with-signals" as const,
        signalCount: signalResult.signalsGenerated,
      };
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
  },
);

export const dailyIntelligenceGenerateSignals = inngest.createFunction(
  { id: "daily-intelligence-generate-signals" },
  { event: DAILY_INTELLIGENCE_GENERATE_SIGNALS_EVENT },
  async ({ event, step, logger }) => {
    const { pipelineRunId, userId, episodeId, maxSignals, regenerate } =
      event.data as DailyIntelligenceGenerateSignalsEvent;

    const result = await step.run("generate-user-signals", async () => {
      const diagnostics = await generateUserSignals({
        userId,
        episodeId,
        forceRegenerate: regenerate ?? false,
        maxSignals,
      });

      if (episodeId) {
        await db
          .update(episode)
          .set({
            status: "processed",
            lastProcessedAt: new Date(),
            signalsGeneratedAt: new Date(),
          })
          .where(eq(episode.id, episodeId));

        logger.info(
          `Pipeline run ${pipelineRunId}: episode ${episodeId} signals ${regenerate ? "regenerated" : "generated"} (${diagnostics.signalsGenerated} signals)`,
        );
      }

      return diagnostics;
    });

    logger.info(
      `Pipeline run ${pipelineRunId}: Signal Generation Complete for user ${userId}${episodeId ? ` (episode: ${episodeId})` : ""}`,
    );
    logger.info(`📊 Signals Generated: ${result.signalsGenerated}`);
    logger.info(
      `🎯 Hybrid Methods: length=${result.methodDistribution.length}, heuristics=${result.methodDistribution.heuristics}, llm=${result.methodDistribution.llm}`,
    );
    logger.info(`🤖 LLM Calls: ${result.llmCalls}`);

    if (result.baselineMethod) {
      logger.info(
        `🧪 Embedding Baseline: ${result.baselineMethod.type} (saved=${result.baselineMethod.savedCount}, skipped=${result.baselineMethod.skippedCount})`,
      );
    } else {
      logger.info(`🧪 Embedding Baseline: none`);
    }

    logger.info(
      `📈 Score Range: ${(result.minScore * 100).toFixed(1)}% - ${(result.maxScore * 100).toFixed(1)}%`,
    );
    logger.info(
      `📊 Score Spread: ${((result.maxScore - result.minScore) * 100).toFixed(1)}%`,
    );
    logger.info(`📉 Average Score: ${(result.avgScore * 100).toFixed(1)}%`);

    return result;
  },
);

export const dailyIntelligenceProcessEpisodeWithSignals =
  inngest.createFunction(
    { id: "daily-intelligence-process-episode-with-signals" },
    { event: DAILY_INTELLIGENCE_EPISODE_PROCESS_WITH_SIGNALS_EVENT },
    async ({ event, step, logger }) => {
      const { pipelineRunId, userId, episodeId } =
        event.data as DailyIntelligenceEpisodeEvent;

      logger.info(
        `Pipeline run ${pipelineRunId}: processing episode ${episodeId} WITH SIGNALS for user ${userId}`,
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

      if (
        episodeData.status === "processed" &&
        episodeData.signalsGeneratedAt !== null
      ) {
        logger.info(
          `Pipeline run ${pipelineRunId}: episode ${episodeId} already fully processed with signals, skipping`,
        );
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
          signalsGeneratedAt: episodeData.signalsGeneratedAt
            ? new Date(episodeData.signalsGeneratedAt)
            : null,
        };

        const transcriptResult = await step.run(
          "ensure-transcript",
          async () => {
            return await ensureEpisodeTranscript({
              db,
              episode: normalisedEpisode,
              force: episodeData.status !== "processed",
            });
          },
        );

        normalisedEpisode.transcriptUrl = transcriptResult.transcriptUrl;

        await step.run("generate-summary", async () => {
          const existingSummary = await db.query.episodeSummary.findFirst({
            where: eq(episodeSummary.episodeId, episodeId),
          });

          if (existingSummary) {
            logger.info(
              `Pipeline run ${pipelineRunId}: episode ${episodeId} already has summary, skipping generation`,
            );
            return { summaryGenerated: false };
          }

          if (!normalisedEpisode.transcriptUrl) {
            logger.warn(
              `Pipeline run ${pipelineRunId}: episode ${episodeId} has no transcript URL, skipping summary generation`,
            );
            return { summaryGenerated: false };
          }

          const transcriptResponse = await fetch(
            normalisedEpisode.transcriptUrl,
          );
          if (!transcriptResponse.ok) {
            logger.warn(
              `Pipeline run ${pipelineRunId}: failed to fetch transcript for summary generation`,
            );
            return { summaryGenerated: false };
          }

          const transcript: TranscriptData = await transcriptResponse.json();
          const markdownContent = await generateEpisodeSummary(
            transcript,
            episodeData.title,
          );

          await db.insert(episodeSummary).values({
            id: randomUUID(),
            episodeId,
            markdownContent,
          });

          logger.info(
            `Pipeline run ${pipelineRunId}: episode ${episodeId} summary generated`,
          );
          return { summaryGenerated: true };
        });

        await step.run("chunk-transcript", async () => {
          const { chunkCount } = await chunkEpisodeTranscript({
            db,
            episode: normalisedEpisode,
            minTokens: CHUNK_SETTINGS.minWords,
            maxTokens: CHUNK_SETTINGS.maxWords,
            skipEmbeddings: true,
          });
          return { chunkCount };
        });

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

        await step.run("generate-embeddings", async () => {
          const { embeddingsGenerated } = await generateMissingEmbeddings({
            db,
            episode: normalisedEpisode,
          });
          return { embeddingsGenerated };
        });

        await step.run("mark-processed", async () => {
          await db
            .update(episode)
            .set({
              status: "processed",
              lastProcessedAt: new Date(),
            })
            .where(eq(episode.id, episodeId));
        });

        const signalResult = await step.run("generate-signals", async () => {
          const diagnostics = await generateUserSignals({
            userId,
            episodeId,
            forceRegenerate: false,
            maxSignals: PIPELINE_SETTINGS.maxDailySignals,
          });

          await db
            .update(episode)
            .set({
              signalsGeneratedAt: new Date(),
            })
            .where(eq(episode.id, episodeId));

          logger.info(
            `Pipeline run ${pipelineRunId}: episode ${episodeId} signals generated (${diagnostics.signalsGenerated} signals)`,
          );

          return diagnostics;
        });

        logger.info(
          `Pipeline run ${pipelineRunId}: episode ${episodeId} FULLY PROCESSED WITH SIGNALS`,
        );
        logger.info(`📊 Signals Generated: ${signalResult.signalsGenerated}`);

        return { status: "processed-with-signals" } as const;
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
    },
  );

/**
 * Generate signals for a user via the hybrid scoring pipeline:
 * - Stage 1: Run hybrid scorer per chunk (length filter → heuristics → LLM)
 * - Stage 2: Compute embedding baseline for diagnostics and A/B tracking
 * - Stage 3: Stratified sampling to keep 30 high-quality signals
 *
 * @param userId - User to generate signals for
 * @param episodeId - Optional episode ID to limit signal generation to specific episode
 * @param maxSignals - Overrides default number of signals to keep after sampling
 * @param forceRegenerate - If true, includes chunks that already have signals (for regeneration)
 */
type GenerateUserSignalsParams = {
  userId: string;
  episodeId?: string;
  forceRegenerate?: boolean;
  maxSignals?: number;
};

async function generateUserSignals({
  userId,
  episodeId,
  forceRegenerate = false,
  maxSignals,
}: GenerateUserSignalsParams): Promise<SignalGenerationDiagnostics> {
  const targetSignalCount = maxSignals ?? PIPELINE_SETTINGS.maxDailySignals;
  const preferences = await getOrCreateUserPreferences(userId);

  if (forceRegenerate && episodeId) {
    const deletedCount = await db
      .delete(dailySignal)
      .where(
        and(
          eq(dailySignal.userId, userId),
          sql`${dailySignal.userAction} IS NULL`,
          sql`${dailySignal.chunkId} IN (
            SELECT id FROM ${transcriptChunk}
            WHERE ${transcriptChunk.episodeId} = ${episodeId}
          )`,
        ),
      )
      .returning({ id: dailySignal.id });

    console.log(
      `User ${userId}: Deleted ${deletedCount.length} pending signals for episode ${episodeId} before regeneration`,
    );
  }

  const candidateChunks = await getNewChunksForUser(
    userId,
    episodeId,
    forceRegenerate,
  );

  console.log(
    `User ${userId}: Found ${candidateChunks.length} candidate chunks${episodeId ? ` (episode: ${episodeId})` : ""}${forceRegenerate ? " [FORCE REGENERATE]" : ""}`,
  );

  if (candidateChunks.length === 0) {
    return {
      signalsGenerated: 0,
      methodDistribution: { length: 0, heuristics: 0, llm: 0 },
      baselineMethod: null,
      llmCalls: 0,
      minScore: 0,
      maxScore: 0,
      avgScore: 0,
    };
  }

  const { scoredChunks, diagnostics } = await scoreChunksForRelevance(
    candidateChunks,
    preferences,
    userId,
  );

  console.log(
    `User ${userId}: Hybrid method distribution — length: ${diagnostics.methodDistribution.length}, heuristics: ${diagnostics.methodDistribution.heuristics}, llm: ${diagnostics.methodDistribution.llm} (LLM calls: ${diagnostics.llmCalls})`,
  );

  if (diagnostics.baselineMethod) {
    const baseline = diagnostics.baselineMethod;
    console.log(
      `User ${userId}: Embedding baseline (${baseline.type}) — saved: ${baseline.savedCount}, skipped: ${baseline.skippedCount}`,
    );
  }

  const filteredChunks = filterRankedChunks(
    scoredChunks,
    preferences,
    targetSignalCount,
  );

  console.log(
    `User ${userId}: After filtering, ${filteredChunks.length} chunks (target ${targetSignalCount})`,
  );

  if (filteredChunks.length === 0) {
    return {
      signalsGenerated: 0,
      methodDistribution: diagnostics.methodDistribution,
      baselineMethod: diagnostics.baselineMethod,
      llmCalls: diagnostics.llmCalls,
      minScore: 0,
      maxScore: 0,
      avgScore: 0,
    };
  }

  await storeDailySignals(userId, filteredChunks);

  // Calculate score statistics
  const scores = filteredChunks.map((c) => c.relevanceScore);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const avgScore =
    scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return {
    signalsGenerated: filteredChunks.length,
    methodDistribution: diagnostics.methodDistribution,
    baselineMethod: diagnostics.baselineMethod,
    llmCalls: diagnostics.llmCalls,
    minScore,
    maxScore,
    avgScore,
  };
}

type UserPreferenceRecord = typeof userPreferences.$inferSelect;

type ChunkRecord = {
  id: string;
  content: string;
  episodeId: string; // This pipeline is podcast-only, so episodeId is always present
  embedding: number[] | null;
  createdAt: Date;
  episodeTitle: string | null;
  episodeExternalId: string | null;
  episodePublishedAt: Date | string | null;
  podcastTitle: string | null;
  podcastFeedUrl: string | null;
  speaker: string | null;
};

type MethodDistribution = Record<ScoringMethod, number>;

type BaselineMethodType =
  | "random"
  | "positive-only"
  | "contrastive"
  | "contrastive-fallback";

type BaselineSummary = {
  type: BaselineMethodType;
  savedCount: number;
  skippedCount: number;
};

type EmbeddingBaseline = {
  method: BaselineMethodType;
  scores: Map<string, number>;
  savedCount: number;
  skippedCount: number;
};

type ScoredChunk = ChunkRecord & {
  relevanceScore: number;
  scoringMethod: ScoringMethod;
  hybridRawScore: number;
  hybridDiagnostics: HybridDiagnostics;
  embeddingScore: number | null;
};

type SignalGenerationDiagnostics = {
  signalsGenerated: number;
  methodDistribution: MethodDistribution;
  baselineMethod: BaselineSummary | null;
  llmCalls: number;
  minScore: number;
  maxScore: number;
  avgScore: number;
};

type ScoringDiagnostics = {
  methodDistribution: MethodDistribution;
  baselineMethod: BaselineSummary | null;
  llmCalls: number;
  minScore: number;
  maxScore: number;
  avgScore: number;
};

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
        // Only get podcast chunks (not articles)
        sql`${transcriptChunk.episodeId} IS NOT NULL`,
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
  // Type assertion: we filtered for podcast chunks only, so episodeId is never null here
  return chunks as ChunkRecord[];
}

async function computeEmbeddingBaseline(
  chunks: ChunkRecord[],
  preferences: UserPreferenceRecord,
  userId: string,
): Promise<EmbeddingBaseline | null> {
  if (chunks.length === 0) {
    return null;
  }

  if (preferences.totalSaved < 10) {
    const scores = new Map<string, number>();
    for (const chunk of chunks) {
      scores.set(chunk.id, Math.random());
    }

    return {
      method: "random",
      scores,
      savedCount: preferences.totalSaved,
      skippedCount: 0,
    };
  }

  const savedEmbeddings = await db
    .select({ embedding: transcriptChunk.embedding })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  if (savedEmbeddings.length === 0) {
    const scores = new Map<string, number>();
    for (const chunk of chunks) {
      scores.set(chunk.id, Math.random());
    }

    return {
      method: "random",
      scores,
      savedCount: 0,
      skippedCount: 0,
    };
  }

  const savedCentroid = calculateCentroid(
    savedEmbeddings.map((row) => row.embedding as number[]),
  );

  const skippedEmbeddings = await db
    .select({ embedding: transcriptChunk.embedding })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "skipped"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  const scores = new Map<string, number>();

  if (skippedEmbeddings.length >= 5) {
    const skippedCentroid = calculateCentroid(
      skippedEmbeddings.map((row) => row.embedding as number[]),
    );
    const centroidSimilarity = cosineSimilarity(savedCentroid, skippedCentroid);

    if (centroidSimilarity <= 0.85) {
      for (const chunk of chunks) {
        const embedding = chunk.embedding;
        if (!embedding) {
          scores.set(chunk.id, 0.3);
          continue;
        }

        const savedSimilarity = cosineSimilarity(embedding, savedCentroid);
        const skippedSimilarity = cosineSimilarity(embedding, skippedCentroid);
        const contrastiveScore = savedSimilarity - skippedSimilarity;
        const normalized = (contrastiveScore + 2) / 4;
        scores.set(chunk.id, Math.max(0, Math.min(1, normalized)));
      }

      return {
        method: "contrastive",
        scores,
        savedCount: savedEmbeddings.length,
        skippedCount: skippedEmbeddings.length,
      };
    }

    console.warn(
      `User ${userId}: embedding centroids too similar (${centroidSimilarity.toFixed(3)}), using positive-only baseline`,
    );
  }

  for (const chunk of chunks) {
    const embedding = chunk.embedding;
    if (!embedding) {
      scores.set(chunk.id, 0.3);
      continue;
    }

    const similarity = cosineSimilarity(embedding, savedCentroid);
    scores.set(chunk.id, Math.max(0, Math.min(1, similarity)));
  }

  return {
    method:
      skippedEmbeddings.length >= 5 ? "contrastive-fallback" : "positive-only",
    scores,
    savedCount: savedEmbeddings.length,
    skippedCount: skippedEmbeddings.length,
  };
}

async function scoreChunksForRelevance(
  chunks: ChunkRecord[],
  preferences: UserPreferenceRecord,
  userId: string,
): Promise<{ scoredChunks: ScoredChunk[]; diagnostics: ScoringDiagnostics }> {
  if (chunks.length === 0) {
    return {
      scoredChunks: [],
      diagnostics: {
        methodDistribution: { length: 0, heuristics: 0, llm: 0 },
        baselineMethod: null,
        llmCalls: 0,
        minScore: 0,
        maxScore: 0,
        avgScore: 0,
      },
    };
  }

  const baseline = await computeEmbeddingBaseline(chunks, preferences, userId);
  const methodCounts: MethodDistribution = { length: 0, heuristics: 0, llm: 0 };

  let minScore = 1;
  let maxScore = 0;
  let totalScore = 0;

  // Use novelty-aware scoring with embeddings
  const results = await hybridScoreBatchWithNovelty(
    chunks.map((chunk) => ({
      content: chunk.content,
      embedding: chunk.embedding ?? [],
    })),
    userId,
  );

  const scoredChunks = chunks.map((chunk, i) => {
    const result = results[i];
    methodCounts[result.method] += 1;

    const normalized = result.normalizedScore;
    minScore = Math.min(minScore, normalized);
    maxScore = Math.max(maxScore, normalized);
    totalScore += normalized;

    return {
      ...chunk,
      relevanceScore: normalized,
      scoringMethod: result.method,
      hybridRawScore: result.rawScore,
      hybridDiagnostics: result.diagnostics,
      embeddingScore: baseline?.scores.get(chunk.id) ?? null,
    };
  });

  const count = scoredChunks.length;

  return {
    scoredChunks,
    diagnostics: {
      methodDistribution: methodCounts,
      baselineMethod: baseline
        ? {
            type: baseline.method,
            savedCount: baseline.savedCount,
            skippedCount: baseline.skippedCount,
          }
        : null,
      llmCalls: methodCounts.llm,
      minScore: count > 0 ? minScore : 0,
      maxScore: count > 0 ? maxScore : 0,
      avgScore: count > 0 ? totalScore / count : 0,
    },
  };
}

function filterRankedChunks(
  chunks: ScoredChunk[],
  preferences: UserPreferenceRecord,
  targetCount: number,
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  console.log(`Filtering chunks. User has ${preferences.totalSaved} saves`);

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
      embeddingScore: chunk.embeddingScore,
      scoringMethod: chunk.scoringMethod,
      hybridDiagnostics: chunk.hybridDiagnostics,
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
        scoringMethod: sql`CASE 
          WHEN ${dailySignal.userAction} IS NULL 
          THEN excluded.scoring_method 
          ELSE ${dailySignal.scoringMethod} 
        END`,
        embeddingScore: sql`CASE 
          WHEN ${dailySignal.userAction} IS NULL 
          THEN excluded.embedding_score 
          ELSE ${dailySignal.embeddingScore} 
        END`,
        hybridDiagnostics: sql`CASE 
          WHEN ${dailySignal.userAction} IS NULL 
          THEN excluded.hybrid_diagnostics 
          ELSE ${dailySignal.hybridDiagnostics} 
        END`,
        // CRITICAL FIX: Don't update signalDate on regeneration
        // Keep original date so cleanup can delete old pending signals
        // signalDate should only be set on first insert, not on upsert
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
