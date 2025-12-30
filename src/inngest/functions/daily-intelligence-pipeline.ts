import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  episode,
  episodeSpeakerMapping,
  episodeSummary,
  transcriptChunk,
} from "@/server/db/schema";
import { generateEpisodeSummary } from "@/server/lib/episode-summary";
import { identifyEpisodeSpeakers } from "@/server/lib/speaker-identification";
import {
  chunkEpisodeTranscript,
  ensureEpisodeTranscript,
} from "@/server/lib/transcript-processing";
import type { TranscriptData } from "@/types/transcript";
import { inngest } from "../client";

const DAILY_INTELLIGENCE_EPISODE_EVENT =
  "app/daily-intelligence.episode.process" as const;
const DAILY_INTELLIGENCE_EPISODE_REPROCESS_EVENT =
  "app/daily-intelligence.episode.reprocess" as const;

const CHUNK_SETTINGS = {
  minWords: 100,
  maxWords: 800,
  useSpeakerTurns: true,
} as const;

type DailyIntelligenceEpisodeEvent = {
  pipelineRunId: string;
  userId: string;
  episodeId: string;
};

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
        hiddenAt: episodeData.hiddenAt ? new Date(episodeData.hiddenAt) : null,
      };

      const transcriptResult = await step.run("ensure-transcript", async () => {
        return await ensureEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          force: episodeData.status !== "processed",
        });
      });

      normalisedEpisode.transcriptUrl = transcriptResult.transcriptUrl;

      // Generate episode summary
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
          .set({ status: "failed", errorMessage: err.message })
          .where(eq(episode.id, episodeId));
      });
      throw err;
    }

    logger.info(
      `Pipeline run ${pipelineRunId}: episode ${episodeId} processed`,
    );

    return { status: "processed" } as const;
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
      // Delete existing data
      await step.run("delete-existing-data", async () => {
        await db
          .delete(transcriptChunk)
          .where(eq(transcriptChunk.episodeId, episodeId));

        await db
          .delete(episodeSpeakerMapping)
          .where(eq(episodeSpeakerMapping.episodeId, episodeId));

        await db
          .delete(episodeSummary)
          .where(eq(episodeSummary.episodeId, episodeId));

        logger.info(
          `Deleted all chunks, speaker mappings, and summary for episode ${episodeId}`,
        );
      });

      // Reset episode
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
        hiddenAt: episodeData.hiddenAt ? new Date(episodeData.hiddenAt) : null,
      };

      // Re-fetch transcript
      const transcriptResult = await step.run(
        "force-refetch-transcript",
        async () => {
          return await ensureEpisodeTranscript({
            db,
            episode: normalisedEpisode,
            force: true,
          });
        },
      );

      normalisedEpisode.transcriptUrl = transcriptResult.transcriptUrl;

      // Regenerate summary
      await step.run("regenerate-summary", async () => {
        if (!normalisedEpisode.transcriptUrl) {
          logger.warn(
            `Pipeline run ${pipelineRunId}: episode ${episodeId} has no transcript URL, skipping summary generation`,
          );
          return { summaryGenerated: false };
        }

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

      await step.run("mark-processed", async () => {
        await db
          .update(episode)
          .set({
            status: "processed",
            lastProcessedAt: new Date(),
          })
          .where(eq(episode.id, episodeId));
      });

      logger.info(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} FULLY REPROCESSED`,
      );

      return { status: "reprocessed" } as const;
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
          .set({ status: "failed", errorMessage: err.message })
          .where(eq(episode.id, episodeId));
      });
      throw err;
    }
  },
);
