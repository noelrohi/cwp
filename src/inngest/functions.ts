import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  episode as episodeSchema,
  type podcast as podcastSchema,
} from "@/server/db/schema/podcast";
import {
  extractPatternsFromTranscript,
  hasExistingPatternForEpisode,
  persistExtractedPatterns,
  type SupportingEpisodeContext,
} from "@/server/lib/patterns";
import type { EpisodeRecord } from "@/server/lib/transcript-processing";
import {
  chunkEpisodeTranscript,
  ensureEpisodeTranscript,
} from "@/server/lib/transcript-processing";
import type { TranscriptData } from "@/types/transcript";
import { inngest } from "./client";

dayjs.extend(utc);

const MIN_WORDS_PER_CHUNK = 200;
const MAX_WORDS_PER_CHUNK = 800;
const WORD_TO_TOKEN_RATIO = 1.33;
const MIN_TOKENS_PER_CHUNK = Math.round(
  MIN_WORDS_PER_CHUNK * WORD_TO_TOKEN_RATIO,
);
const MAX_TOKENS_PER_CHUNK = Math.round(
  MAX_WORDS_PER_CHUNK * WORD_TO_TOKEN_RATIO,
);
const DEFAULT_MAX_PATTERNS_PER_EPISODE = 3;
const DEFAULT_SUPPORTING_EPISODE_LIMIT = 2;

const pipelineConfigSchema = z
  .object({
    insightFormat: z.enum(["markdown", "plain_text"]).optional(),
    maxPatternsPerEpisode: z.number().int().min(1).max(5).optional(),
    supportingEpisodes: z
      .object({
        limit: z.number().int().min(0).max(5).optional(),
        preferCrossSeries: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

type PipelineConfig = {
  insightFormat: "markdown" | "plain_text";
  maxPatternsPerEpisode: number;
  supportingEpisodeLimit: number;
  preferCrossSeries: boolean;
};

function resolvePipelineConfig(data: unknown): PipelineConfig {
  const parsed = pipelineConfigSchema.safeParse(data);
  const config = parsed.success && parsed.data ? parsed.data : {};

  const supporting = config.supportingEpisodes ?? {};

  return {
    insightFormat: config.insightFormat ?? "markdown",
    maxPatternsPerEpisode:
      config.maxPatternsPerEpisode ?? DEFAULT_MAX_PATTERNS_PER_EPISODE,
    supportingEpisodeLimit:
      supporting.limit ?? DEFAULT_SUPPORTING_EPISODE_LIMIT,
    preferCrossSeries: supporting.preferCrossSeries ?? true,
  };
}

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data.email}!` };
  },
);

export const dailyInsightsPipeline = inngest.createFunction(
  {
    id: "daily-insights-pipeline",
    retries: 1,
    concurrency: {
      limit: 1,
      scope: "fn",
    },
  },
  {
    cron: "TZ=Asia/Dubai 0 8 * * *",
  },
  async ({ event, step, logger }) => {
    const pipelineConfig = resolvePipelineConfig(event?.data);
    const now = new Date();
    const { start: windowStart, end: windowEnd } = getLast24HoursWindow(now);

    const fetchedEpisodes = await step.run(
      "fetch-recent-episodes",
      async () => {
        return await db.query.episode.findMany({
          where: and(
            isNotNull(episodeSchema.publishedAt),
            gte(episodeSchema.publishedAt, windowStart),
            lt(episodeSchema.publishedAt, windowEnd),
          ),
          with: {
            podcast: true,
          },
        });
      },
    );

    const episodes = fetchedEpisodes.map(normalizeEpisodeRecord);

    const results: Array<{
      episodeId: string;
      status: "completed" | "failed" | "skipped";
      reason?: string;
      patterns?: number;
    }> = [];

    for (const episode of episodes) {
      const logContext = { episodeId: episode.id };
      const patternDate = getPatternDate(now);

      if (!episode.audioUrl) {
        results.push({
          episodeId: episode.id,
          status: "skipped",
          reason: "missing-audio-url",
        });
        continue;
      }

      const alreadyProcessed = await hasExistingPatternForEpisode({
        db,
        episodeId: episode.id,
        userId: episode.userId,
        patternDate,
      });

      if (alreadyProcessed) {
        results.push({
          episodeId: episode.id,
          status: "skipped",
          reason: "pattern-already-exists",
        });
        continue;
      }

      try {
        const transcriptResult = await step.run(
          `ensure-transcript-${episode.id}`,
          async () => ensureEpisodeTranscript({ db, episode }),
        );

        const transcriptUrl =
          transcriptResult.transcriptUrl ?? episode.transcriptUrl;
        if (!transcriptUrl) {
          throw new Error("Transcript URL missing after transcription step");
        }

        const transcriptData = await step.run(
          `load-transcript-${episode.id}`,
          async () => loadTranscriptData(transcriptUrl),
        );

        await step.run(`chunk-transcript-${episode.id}`, async () => {
          await chunkEpisodeTranscript({
            db,
            episode: {
              ...episode,
              transcriptUrl,
            },
            minTokens: MIN_TOKENS_PER_CHUNK,
            maxTokens: MAX_TOKENS_PER_CHUNK,
            transcriptData,
          });
          return true;
        });

        const supportingContexts = (await step.run(
          `supporting-episodes-${episode.id}`,
          async () =>
            resolveSupportingEpisodeContexts({
              baseEpisode: episode,
              limit: pipelineConfig.supportingEpisodeLimit,
              preferCrossSeries: pipelineConfig.preferCrossSeries,
            }),
        )) as unknown as SupportingEpisodeContext[];

        const patterns = await step.run(
          `extract-patterns-${episode.id}`,
          async () =>
            extractPatternsFromTranscript({
              episode: {
                ...episode,
                podcastTitle: episode.podcast?.title ?? null,
                podcastSeries: episode.series ?? null,
              },
              transcript: transcriptData,
              maxPatterns: pipelineConfig.maxPatternsPerEpisode,
              insightFormat: pipelineConfig.insightFormat,
              supportingEpisodes: supportingContexts,
            }),
        );

        if (patterns.length > 0) {
          await step.run(`persist-patterns-${episode.id}`, async () => {
            await persistExtractedPatterns({
              db,
              episode: {
                ...episode,
                podcastTitle: episode.podcast?.title ?? null,
                podcastSeries: episode.series ?? null,
              },
              patternDate,
              userId: episode.userId,
              patterns,
              supportingEpisodes: supportingContexts.map(
                (supportingContext) => ({
                  key: supportingContext.key,
                  episode: supportingContext.episode,
                }),
              ),
            });
            return true;
          });
        } else {
          logger.info("No high-confidence patterns extracted", {
            ...logContext,
            transcriptUrl,
          });
        }

        results.push({
          episodeId: episode.id,
          status: "completed",
          patterns: patterns.length,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown-error";
        logger.error("Failed to process daily insights", {
          ...logContext,
          error: message,
        });
        results.push({
          episodeId: episode.id,
          status: "failed",
          reason: message,
        });
      }
    }

    return {
      processedEpisodes: episodes.length,
      results,
    };
  },
);

async function resolveSupportingEpisodeContexts({
  baseEpisode,
  limit,
  preferCrossSeries,
}: {
  baseEpisode: NormalizedEpisode;
  limit: number;
  preferCrossSeries: boolean;
}): Promise<SupportingEpisodeContext[]> {
  if (!limit || limit <= 0) {
    return [];
  }

  const fetchLimit = Math.max(limit * 3, limit);

  const candidateRecords = await db.query.episode.findMany({
    where: and(
      eq(episodeSchema.userId, baseEpisode.userId),
      ne(episodeSchema.id, baseEpisode.id),
      isNotNull(episodeSchema.transcriptUrl),
    ),
    with: {
      podcast: true,
    },
    orderBy: [desc(episodeSchema.publishedAt), desc(episodeSchema.createdAt)],
    limit: fetchLimit,
  });

  const normalized = candidateRecords.map(normalizeEpisodeRecord);
  const prioritised = prioritizeSupportingEpisodes({
    baseSeries: baseEpisode.series ?? null,
    episodes: normalized,
    preferCrossSeries,
  });

  const selected: NormalizedEpisode[] = [];
  for (const candidate of prioritised) {
    if (!candidate.transcriptUrl) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= limit) {
      break;
    }
  }

  const contexts: SupportingEpisodeContext[] = [];

  for (const candidate of selected) {
    if (!candidate.transcriptUrl) {
      continue;
    }

    try {
      const transcript = await loadTranscriptData(candidate.transcriptUrl);
      contexts.push({
        key: `support_${contexts.length + 1}`,
        episode: {
          ...candidate,
          podcastTitle: candidate.podcast?.title ?? null,
          podcastSeries: candidate.series ?? null,
        },
        transcript,
      });
    } catch (_error) {
      // Ignore supporting transcript failures and continue.
    }
  }

  return contexts;
}

function prioritizeSupportingEpisodes({
  baseSeries,
  episodes,
  preferCrossSeries,
}: {
  baseSeries: string | null;
  episodes: NormalizedEpisode[];
  preferCrossSeries: boolean;
}): NormalizedEpisode[] {
  if (!preferCrossSeries || !baseSeries) {
    return episodes;
  }

  const crossSeries: NormalizedEpisode[] = [];
  const remaining: NormalizedEpisode[] = [];

  for (const candidate of episodes) {
    if (candidate.series && candidate.series !== baseSeries) {
      crossSeries.push(candidate);
    } else {
      remaining.push(candidate);
    }
  }

  return [...crossSeries, ...remaining];
}

async function loadTranscriptData(url: string): Promise<TranscriptData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load transcript data: ${response.status}`);
  }

  return (await response.json()) as TranscriptData;
}

function getLast24HoursWindow(reference: Date) {
  const end = dayjs(reference).utc();
  const start = end.subtract(24, "hour");
  return { start: start.toDate(), end: end.toDate() };
}

function getPatternDate(reference: Date) {
  return dayjs(reference).utc().startOf("day").toDate();
}

type PodcastRecord = typeof podcastSchema.$inferSelect;

type NormalizedEpisode = EpisodeRecord & {
  podcast: PodcastRecord | null;
};

type EpisodeLike = Omit<
  EpisodeRecord,
  "createdAt" | "updatedAt" | "publishedAt"
> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  publishedAt: Date | string | null;
  podcast?: PodcastLike | null;
};

type PodcastLike = Omit<PodcastRecord, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

function normalizeEpisodeRecord(episode: EpisodeLike): NormalizedEpisode {
  return {
    ...episode,
    createdAt: new Date(episode.createdAt),
    updatedAt: new Date(episode.updatedAt),
    publishedAt: episode.publishedAt ? new Date(episode.publishedAt) : null,
    podcast: episode.podcast
      ? {
          ...episode.podcast,
          createdAt: new Date(episode.podcast.createdAt),
          updatedAt: new Date(episode.podcast.updatedAt),
        }
      : null,
  };
}
