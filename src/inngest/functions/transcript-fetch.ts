import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { episode } from "@/server/db/schema";
import { ensureEpisodeTranscript } from "@/server/lib/transcript-processing";
import { inngest } from "../client";

const TRANSCRIPT_FETCH_EVENT = "app/transcript.episode.fetch" as const;

type TranscriptFetchEvent = {
  pipelineRunId: string;
  userId: string;
  episodeId: string;
};

/**
 * Fetch transcript for an episode without full processing
 * Only fetches transcript (YouTube or Deepgram) - no summary, no chunking
 */
export const fetchEpisodeTranscript = inngest.createFunction(
  { id: "fetch-episode-transcript" },
  { event: TRANSCRIPT_FETCH_EVENT },
  async ({ event, step, logger }) => {
    const { pipelineRunId, episodeId } = event.data as TranscriptFetchEvent;

    logger.info(
      `Pipeline run ${pipelineRunId}: fetching transcript for episode ${episodeId}`,
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

    // If transcript already exists, skip
    if (episodeData.transcriptUrl) {
      logger.info(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} already has transcript`,
      );
      return {
        status: "exists",
        transcriptUrl: episodeData.transcriptUrl,
      } as const;
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

      const transcriptResult = await step.run("fetch-transcript", async () => {
        return await ensureEpisodeTranscript({
          db,
          episode: normalisedEpisode,
          force: false,
        });
      });

      // Mark episode status back to pending (we only fetched transcript, not processed)
      // This allows full processing later if needed
      await step.run("update-status", async () => {
        await db
          .update(episode)
          .set({
            status: "pending",
            transcriptUrl: transcriptResult.transcriptUrl,
          })
          .where(eq(episode.id, episodeId));
      });

      logger.info(
        `Pipeline run ${pipelineRunId}: transcript fetched for episode ${episodeId}`,
      );

      return {
        status: "fetched",
        transcriptUrl: transcriptResult.transcriptUrl,
      } as const;
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string" ? error : JSON.stringify(error),
            );
      logger.error(
        `Pipeline run ${pipelineRunId}: failed to fetch transcript for episode ${episodeId}`,
        {
          error: err.message,
          stack: err.stack,
        },
      );

      await step.run("mark-failed", async () => {
        await db
          .update(episode)
          .set({
            status: "failed",
            errorMessage: `Transcript fetch failed: ${err.message}`,
          })
          .where(eq(episode.id, episodeId));
      });

      throw err;
    }
  },
);
