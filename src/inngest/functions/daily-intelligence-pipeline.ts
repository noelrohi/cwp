import { randomUUID } from "node:crypto";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { cosineSimilarity, generateObject } from "ai";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  podcast,
  savedChunk,
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
  minWords: 400,
  maxWords: 800,
  useSpeakerTurns: true,
} as const;

const PIPELINE_SETTINGS = {
  maxDailySignals: 30,
  minConfidenceScore: 0.62,
} as const;

const PIPELINE_LOOKBACK_HOURS =
  process.env.NODE_ENV === "development" ? 72 : 24;

const SIGNAL_MODEL_ID = "x-ai/grok-4-fast:free" as const;
const PREFERENCE_SUMMARY_MODEL_ID = "x-ai/grok-4-fast:free" as const;
const PREFERENCE_SAVED_CLIP_LIMIT = 12;

const signalSchema = z.object({
  title: z.string().min(4).max(140),
  summary: z.string().min(24).max(1200),
  excerpt: z.string().min(12).max(320).optional().nullable(),
  speakerName: z.string().min(2).max(120).optional().nullable(),
});

type GeneratedSignal = z.infer<typeof signalSchema> & {
  excerpt: string | null;
  speakerName: string | null;
};

const preferenceSummarySchema = z.object({
  summary: z.string().min(32).describe("Verbose and concise summary."),
  interests: z.array(z.string().min(2).max(80)).min(1).max(6),
  avoid: z.array(z.string().min(2).max(80)).max(4).optional().nullable(),
});

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
  const preferenceContext = await buildUserPreferenceContext(userId);
  const candidateChunks = await getNewChunksForUser(userId);

  console.log(
    `User ${userId}: Found ${candidateChunks.length} candidate chunks`,
  );

  if (candidateChunks.length === 0) return 0;

  if (preferenceContext) {
    console.log(
      `User ${userId}: Preference summary -> ${preferenceContext.summary}`,
    );
  }

  const scoredChunks = scoreChunksForRelevance(
    candidateChunks,
    preferences,
    preferenceContext,
  );
  const filteredChunks = filterRankedChunks(scoredChunks, preferenceContext);

  console.log(
    `User ${userId}: After filtering, ${filteredChunks.length} chunks`,
  );

  if (filteredChunks.length === 0) return 0;

  await storeDailySignals(userId, filteredChunks, preferenceContext);

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
  episodePublishedAt: Date | string | null;
  podcastTitle: string | null;
  speaker: string | null;
};

type ScoredChunk = ChunkRecord & {
  relevanceScore: number;
  matchedInterests: string[];
  matchedAvoids: string[];
};

type PreferenceContext = {
  summary: string;
  interests: string[];
  avoid: string[];
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
      episodePublishedAt: episode.publishedAt,
      podcastTitle: podcast.title,
      speaker: transcriptChunk.speaker,
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
  preferenceContext: PreferenceContext | null,
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
    let score = 0.5;
    const matchedInterests: string[] = [];
    const matchedAvoids: string[] = [];

    if (chunkEmbedding && hasSignal && userEmbedding) {
      const similarity = cosineSimilarity(chunkEmbedding, userEmbedding);
      score = normalizeScore(similarity);
      console.log(
        `Chunk ${chunk.id}: similarity ${similarity}, score ${score}`,
      );
    }

    if (preferenceContext) {
      const content = chunk.content.toLowerCase();

      for (const interest of preferenceContext.interests) {
        const term = interest.toLowerCase();
        if (term.length > 2 && content.includes(term)) {
          matchedInterests.push(interest);
        }
      }

      for (const avoid of preferenceContext.avoid) {
        const term = avoid.toLowerCase();
        if (term.length > 2 && content.includes(term)) {
          matchedAvoids.push(avoid);
        }
      }

      if (matchedInterests.length > 0) {
        const boost = Math.min(
          0.2,
          0.12 + 0.04 * (matchedInterests.length - 1),
        );
        score = Math.min(1, score + boost);
      } else {
        score = Math.max(0.45, score - 0.05);
      }

      if (matchedAvoids.length > 0) {
        score = Math.max(0.25, score - 0.2);
      }
    }

    return {
      ...chunk,
      relevanceScore: score,
      matchedInterests,
      matchedAvoids,
    };
  });
}

type PreferenceClip = {
  chunkId: string;
  savedAt: Date;
  title: string | null;
  summary: string | null;
  excerpt: string | null;
  content: string;
};

async function buildUserPreferenceContext(
  userId: string,
): Promise<PreferenceContext | null> {
  const clips = await fetchSavedPreferenceClips(userId);
  if (clips.length === 0) return null;

  const prompt = composePreferencePrompt(clips);

  const { object } = await generateObject({
    model: openrouter(PREFERENCE_SUMMARY_MODEL_ID),
    schema: preferenceSummarySchema,
    temperature: 0.2,
    maxRetries: 2,
    messages: [
      {
        role: "system",
        content:
          "You analyze saved podcast intelligence clips to capture what the user values. Focus on recurring themes, desired outcomes, and signals they would rather avoid.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  if (!object) return null;

  return {
    summary: object.summary.trim(),
    interests: object.interests.map((interest) => interest.trim()),
    avoid: object.avoid?.map((item) => item.trim()) ?? [],
  };
}

async function fetchSavedPreferenceClips(
  userId: string,
): Promise<PreferenceClip[]> {
  const clips = await db
    .select({
      chunkId: savedChunk.chunkId,
      savedAt: savedChunk.savedAt,
      title: dailySignal.title,
      summary: dailySignal.summary,
      excerpt: dailySignal.excerpt,
      content: transcriptChunk.content,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .leftJoin(
      dailySignal,
      and(
        eq(dailySignal.chunkId, savedChunk.chunkId),
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "saved"),
      ),
    )
    .where(eq(savedChunk.userId, userId))
    .orderBy(desc(savedChunk.savedAt))
    .limit(PREFERENCE_SAVED_CLIP_LIMIT);

  return clips.map((clip) => ({
    chunkId: clip.chunkId,
    savedAt: clip.savedAt,
    title: clip.title,
    summary: clip.summary,
    excerpt: clip.excerpt,
    content: clip.content,
  }));
}

function composePreferencePrompt(clips: PreferenceClip[]): string {
  const header = [
    "These are the podcast intelligence clips the user saved recently.",
    "Identify what they consistently care about and what they avoid.",
    "Return a short briefing summarizing their preferences.",
  ].join("\n");

  const items = clips.map((clip, index) => {
    const label = `Clip ${index + 1}`;
    const headline = clip.title?.trim();
    const summary =
      clip.summary?.trim() ??
      clip.excerpt?.trim() ??
      truncateText(clip.content, 220);

    return [`${label}${headline ? ` — ${headline}` : ""}`, summary].join("\n");
  });

  return [header, ...items].join("\n\n");
}

function filterRankedChunks(
  chunks: ScoredChunk[],
  preferenceContext: PreferenceContext | null,
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  const confident = sorted.filter(
    (chunk) =>
      chunk.relevanceScore >= PIPELINE_SETTINGS.minConfidenceScore ||
      chunk.matchedInterests.length > 0,
  );

  const limit = PIPELINE_SETTINGS.maxDailySignals;
  const desiredExplorationSlots = preferenceContext
    ? Math.min(Math.max(Math.floor(limit * 0.4), 4), limit)
    : 0;
  const alignedSlots = Math.max(limit - desiredExplorationSlots, 0);

  const selectedAligned = confident.slice(0, alignedSlots);

  const explorationPool = sorted.filter(
    (chunk) =>
      chunk.matchedInterests.length === 0 &&
      chunk.relevanceScore < PIPELINE_SETTINGS.minConfidenceScore,
  );
  const selectedExploration = explorationPool.slice(0, desiredExplorationSlots);

  const result: ScoredChunk[] = [];

  for (const item of selectedAligned) {
    if (result.length >= limit) break;
    result.push(item);
  }

  for (const item of selectedExploration) {
    if (result.length >= limit) break;
    if (!result.some((chunk) => chunk.id === item.id)) {
      result.push(item);
    }
  }

  if (result.length < limit) {
    for (const item of sorted) {
      if (result.length >= limit) break;
      if (!result.some((chunk) => chunk.id === item.id)) {
        result.push(item);
      }
    }
  }

  return result.slice(0, limit);
}

async function storeDailySignals(
  userId: string,
  chunks: ScoredChunk[],
  preferenceContext: PreferenceContext | null,
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

  const generated: Array<{ chunk: ScoredChunk; signal: GeneratedSignal }> = [];

  for (const chunk of newChunks) {
    try {
      const signal = await generateSignalFromChunk(chunk, preferenceContext);
      generated.push({ chunk, signal });
    } catch (error) {
      console.error(
        `Failed to generate AI signal for chunk ${chunk.id}`,
        error,
      );
    }
  }

  if (generated.length === 0) return;

  const signalDate = new Date();

  await db.insert(dailySignal).values(
    generated.map(({ chunk, signal }) => ({
      id: randomUUID(),
      chunkId: chunk.id,
      userId,
      signalDate,
      relevanceScore: chunk.relevanceScore,
      title: signal.title,
      summary: signal.summary,
      excerpt: signal.excerpt,
      speakerName: signal.speakerName,
      userAction: null,
      presentedAt: null,
      actionedAt: null,
    })),
  );
}

function normalizeScore(raw: number): number {
  const clamped = Math.max(-1, Math.min(1, raw));
  return (clamped + 1) / 2;
}

async function generateSignalFromChunk(
  chunk: ScoredChunk,
  preferenceContext: PreferenceContext | null,
): Promise<GeneratedSignal> {
  const trimmedContent = truncateText(chunk.content, 2400);
  const publishedDate = formatPublishedDate(chunk.episodePublishedAt);
  const { object } = await generateObject({
    model: openrouter(SIGNAL_MODEL_ID),
    schema: signalSchema,
    temperature: 0.4,
    maxRetries: 2,
    messages: [
      {
        role: "system",
        content:
          "You are a senior research analyst who crafts concise daily intelligence signals from podcast transcripts. Keep the output actionable for operators and strategists.",
      },
      {
        role: "user",
        content: buildSignalPrompt({
          chunk,
          publishedDate,
          trimmedContent,
          preferenceContext,
        }),
      },
    ],
  });

  if (!object) {
    throw new Error("Signal generation returned no content");
  }

  return {
    title: object.title.trim(),
    summary: object.summary.trim(),
    excerpt: object.excerpt?.trim() ?? null,
    speakerName: object.speakerName?.trim() ?? null,
  };
}

interface SignalPromptContext {
  chunk: ScoredChunk;
  publishedDate: string;
  trimmedContent: string;
  preferenceContext: PreferenceContext | null;
}

function buildSignalPrompt({
  chunk,
  publishedDate,
  trimmedContent,
  preferenceContext,
}: SignalPromptContext): string {
  const podcastTitle = chunk.podcastTitle ?? "Unknown Podcast";
  const episodeTitle = chunk.episodeTitle ?? chunk.episodeId;
  const speakerLabel = chunk.speaker
    ? `Speaker ${chunk.speaker}`
    : "Unknown speaker";

  const preferenceNotes: string[] = [];

  if (preferenceContext) {
    preferenceNotes.push("User preference briefing:");
    preferenceNotes.push(preferenceContext.summary);
    preferenceNotes.push(
      `Preferred themes: ${preferenceContext.interests.join(", ")}`,
    );
    if (preferenceContext.avoid.length > 0) {
      preferenceNotes.push(
        `Avoid or caution topics: ${preferenceContext.avoid.join(", ")}`,
      );
    }

    if (chunk.matchedInterests.length > 0) {
      preferenceNotes.push(
        `This chunk matches: ${chunk.matchedInterests.join(", ")}`,
      );
    } else {
      preferenceNotes.push(
        "This chunk is exploratory; highlight why it might still be useful.",
      );
    }

    if (chunk.matchedAvoids.length > 0) {
      preferenceNotes.push(
        `Flag any conflicting signals: ${chunk.matchedAvoids.join(", ")}`,
      );
    }
  }

  return [
    `Podcast: ${podcastTitle}`,
    `Episode: ${episodeTitle}`,
    `Published: ${publishedDate}`,
    `Speaker label in transcript metadata: ${speakerLabel}`,
    "",
    ...(preferenceNotes.length > 0 ? preferenceNotes.concat([""]) : []),
    "Transcript excerpt:",
    trimmedContent,
    "",
    "Instructions:",
    "- Produce a compelling title (≤12 words) that captures the operator takeaway.",
    "- Write a 2-4 sentence summary focused on why this matters for decision makers.",
    "- Highlight any quantitative data, strategic implications, or contrasting viewpoints.",
    "- Provide a short excerpt or quote (≤200 characters) that anchors the insight.",
    "- Identify the likely real speaker name or role for the provided speaker label and return it in the speakerName field (use 'Unknown speaker' if unclear).",
    "- Do not fabricate information not present in the excerpt.",
  ].join("\n");
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

function formatPublishedDate(date: Date | string | null): string {
  if (!date) return "unknown date";
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "unknown date";
  return parsed.toISOString().split("T")[0];
}
