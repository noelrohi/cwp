import { randomUUID } from "node:crypto";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
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

// Configuration from sequence.md - "set once, forget"
const CHUNK_SETTINGS = {
  minWords: 400,
  maxWords: 800,
  useSpeakerTurns: true,
} as const;

const PIPELINE_SETTINGS = {
  maxDailySignals: 30,
  minConfidenceScore: 0.7,
} as const;

const PIPELINE_LOOKBACK_HOURS = 24;

const SIGNAL_MODEL_ID = "x-ai/grok-4-fast:free" as const;

const signalSchema = z.object({
  title: z.string().min(4).max(140),
  summary: z.string().min(24).max(1200),
  excerpt: z.string().min(12).max(320).optional().nullable(),
});

type GeneratedSignal = z.infer<typeof signalSchema> & {
  excerpt: string | null;
};

/**
 * Daily Intelligence Pipeline - 2:00 AM
 * Simple sequence: users -> podcasts -> episodes -> transcripts -> signals
 */
export const dailyIntelligencePipeline = inngest.createFunction(
  { id: "daily-intelligence-pipeline" },
  { cron: "0 2 * * *" },
  async ({ step, logger }) => {
    const now = new Date();
    const lookbackWindowMs = PIPELINE_LOOKBACK_HOURS * 60 * 60 * 1000;
    const lookbackStart = new Date(now.getTime() - lookbackWindowMs);

    logger.info(
      `Running daily intelligence pipeline (lookback=${PIPELINE_LOOKBACK_HOURS}h)`,
    );

    // 1. Get all users
    const users = await step.run("get-all-users", async () => {
      return await db
        .select({ userId: podcast.userId })
        .from(podcast)
        .groupBy(podcast.userId);
    });

    logger.info(`Found ${users.length} users with podcasts`);

    let totalSignals = 0;

    // Process each user
    for (const user of users) {
      const signals = await step.run(
        `process-user-${user.userId}`,
        async () => {
          // 2. Get user's list of podcasts
          const userPodcasts = await db
            .select({ id: podcast.id })
            .from(podcast)
            .where(eq(podcast.userId, user.userId));

          logger.info(
            `User ${user.userId}: Found ${userPodcasts.length} podcasts`,
          );

          if (userPodcasts.length === 0) return 0;

          // 3. Process last 24 hours published episodes from podcasts
          const recentEpisodes = await db
            .select()
            .from(episode)
            .where(
              and(
                inArray(
                  episode.podcastId,
                  userPodcasts.map((p) => p.id),
                ),
                gte(episode.publishedAt, lookbackStart),
              ),
            );

          logger.info(
            `User ${user.userId}: Found ${recentEpisodes.length} recent episodes`,
          );

          // 4. Process transcripts of each episode
          for (const ep of recentEpisodes) {
            if (ep.status === "processed") continue; // Skip already processed

            try {
              const episodeRecord = {
                ...ep,
                createdAt: new Date(ep.createdAt),
                updatedAt: new Date(ep.updatedAt),
                publishedAt: ep.publishedAt ? new Date(ep.publishedAt) : null,
              };

              // Ensure transcript exists
              await ensureEpisodeTranscript({
                db,
                episode: episodeRecord,
                force: false,
              });

              // Chunk transcript (400-800 words, speaker turns)
              await chunkEpisodeTranscript({
                db,
                episode: episodeRecord,
                minTokens: CHUNK_SETTINGS.minWords,
                maxTokens: CHUNK_SETTINGS.maxWords,
              });

              // Update status
              await db
                .update(episode)
                .set({ status: "processed" })
                .where(eq(episode.id, ep.id));
            } catch (error) {
              console.error(`Failed to process episode ${ep.id}:`, error);
              await db
                .update(episode)
                .set({ status: "failed" })
                .where(eq(episode.id, ep.id));
            }
          }

          // 5. Generate embeddings and score signals for this user
          const signals = await generateUserSignals(user.userId);
          logger.info(`User ${user.userId}: Generated ${signals} signals`);
          return signals;
        },
      );

      totalSignals += signals;
    }

    return {
      date: now.toISOString().split("T")[0],
      usersProcessed: users.length,
      signalsGenerated: totalSignals,
    };
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
  episodePublishedAt: Date | string | null;
  podcastTitle: string | null;
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
      episodePublishedAt: episode.publishedAt,
      podcastTitle: podcast.title,
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

    const similarity = cosineSimilarity(chunkEmbedding, userEmbedding);
    const score = normalizeScore(similarity);
    console.log(`Chunk ${chunk.id}: similarity ${similarity}, score ${score}`);
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

  const generated: Array<{ chunk: ScoredChunk; signal: GeneratedSignal }> = [];

  for (const chunk of newChunks) {
    try {
      const signal = await generateSignalFromChunk(chunk);
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
        content: buildSignalPrompt({ chunk, publishedDate, trimmedContent }),
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
  };
}

interface SignalPromptContext {
  chunk: ScoredChunk;
  publishedDate: string;
  trimmedContent: string;
}

function buildSignalPrompt({
  chunk,
  publishedDate,
  trimmedContent,
}: SignalPromptContext): string {
  const podcastTitle = chunk.podcastTitle ?? "Unknown Podcast";
  const episodeTitle = chunk.episodeTitle ?? chunk.episodeId;

  return [
    `Podcast: ${podcastTitle}`,
    `Episode: ${episodeTitle}`,
    `Published: ${publishedDate}`,
    "",
    "Transcript excerpt:",
    trimmedContent,
    "",
    "Instructions:",
    "- Produce a compelling title (≤12 words) that captures the operator takeaway.",
    "- Write a 2-4 sentence summary focused on why this matters for decision makers.",
    "- Highlight any quantitative data, strategic implications, or contrasting viewpoints.",
    "- Provide a short excerpt or quote (≤200 characters) that anchors the insight.",
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

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}
