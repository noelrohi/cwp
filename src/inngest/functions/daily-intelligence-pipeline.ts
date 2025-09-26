import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import Parser from "rss-parser";
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

const rssParser = new Parser();

type RSSFeed = Awaited<ReturnType<typeof rssParser.parseURL>>;
type RSSFeedItem = RSSFeed["items"][number];

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

const HOST_PATTERNS: RegExp[] = [
  /hosted by ([^.;\n]+)/gi,
  /hosts?:\s*([^.;\n]+)/gi,
  /with (?:your\s+)?hosts? ([^.;\n]+)/gi,
  /co-hosts?:\s*([^.;\n]+)/gi,
];

const TITLE_GUEST_PATTERNS: RegExp[] = [
  /\bwith\s+([^:-]+?)(?:$|[:-])/gi,
  /\bfeat(?:\.|uring)?\s+([^:-]+?)(?:$|[:-])/gi,
  /\bft\.\s+([^:-]+?)(?:$|[:-])/gi,
];

const DESCRIPTION_GUEST_PATTERNS: RegExp[] = [
  /special guests?[:\-\s]+([^\n.!]+)/gi,
  /guest[s]?[:\-\s]+([^\n.!]+)/gi,
  /featur(?:ing|es)\s+([^\n.!]+)/gi,
  /joined by\s+([^\n.!]+)/gi,
  /conversation with\s+([^\n.!]+)/gi,
  /interview(?:s)? with\s+([^\n.!]+)/gi,
  /speaks with\s+([^\n.!]+)/gi,
];

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
  const speakerMappings = await buildSpeakerMappings(newChunks);

  await db.insert(dailySignal).values(
    newChunks.map((chunk) => {
      const mappingForEpisode = chunk.speaker
        ? speakerMappings.get(chunk.episodeId)
        : null;
      const inferredSpeakerName =
        chunk.speaker && mappingForEpisode
          ? (mappingForEpisode.get(chunk.speaker) ?? null)
          : null;
      const speakerName = inferredSpeakerName
        ? inferredSpeakerName
        : chunk.speaker
          ? deriveDefaultSpeakerLabel(chunk.speaker)
          : null;

      return {
        id: randomUUID(),
        chunkId: chunk.id,
        userId,
        signalDate,
        relevanceScore: chunk.relevanceScore,
        title: null,
        summary: null,
        excerpt: null,
        speakerName,
        userAction: null,
        presentedAt: null,
        actionedAt: null,
      };
    }),
  );
}

async function buildSpeakerMappings(
  chunks: ScoredChunk[],
): Promise<Map<string, Map<string, string>>> {
  const episodes = new Map<
    string,
    {
      episodeId: string;
      podcastFeedUrl: string | null;
      episodeTitle: string | null;
      podcastTitle: string | null;
      speakerIds: Set<string>;
    }
  >();

  for (const chunk of chunks) {
    let context = episodes.get(chunk.episodeId);
    if (!context) {
      context = {
        episodeId: chunk.episodeId,
        podcastFeedUrl: chunk.podcastFeedUrl ?? null,
        episodeTitle: chunk.episodeTitle ?? null,
        podcastTitle: chunk.podcastTitle ?? null,
        speakerIds: new Set<string>(),
      };
      episodes.set(chunk.episodeId, context);
    }

    if (chunk.speaker && chunk.speaker.trim() !== "") {
      context.speakerIds.add(chunk.speaker.trim());
    }
  }

  const mappings = new Map<string, Map<string, string>>();
  const feedCache = new Map<string, RSSFeed | null>();

  for (const context of episodes.values()) {
    const speakerIds = Array.from(context.speakerIds);
    if (speakerIds.length === 0) {
      mappings.set(context.episodeId, new Map());
      continue;
    }

    const feed =
      context.podcastFeedUrl && /^https?:\/\//i.test(context.podcastFeedUrl)
        ? await getFeedData(context.podcastFeedUrl, feedCache)
        : null;

    const speakerMap = inferSpeakerMapFromFeed({
      feed,
      speakerIds,
      episodeTitle: context.episodeTitle,
      podcastTitle: context.podcastTitle,
    });

    mappings.set(context.episodeId, speakerMap);
  }

  return mappings;
}

async function getFeedData(
  feedUrl: string,
  cache: Map<string, RSSFeed | null>,
): Promise<RSSFeed | null> {
  if (cache.has(feedUrl)) {
    return cache.get(feedUrl) ?? null;
  }

  try {
    const feed = await rssParser.parseURL(feedUrl);
    cache.set(feedUrl, feed);
    return feed;
  } catch (error) {
    console.warn(`Unable to parse RSS feed ${feedUrl}:`, error);
    cache.set(feedUrl, null);
    return null;
  }
}

function inferSpeakerMapFromFeed(params: {
  feed: RSSFeed | null;
  speakerIds: string[];
  episodeTitle: string | null;
  podcastTitle: string | null;
}): Map<string, string> {
  const { feed, speakerIds, episodeTitle, podcastTitle } = params;
  const mapping = new Map<string, string>();

  if (speakerIds.length === 0) {
    return mapping;
  }

  const sortedSpeakerIds = [...speakerIds].sort(compareSpeakerIds);
  const hostNames = dedupeNames(extractHostNames({ feed, podcastTitle }));

  const episodeItem =
    feed && episodeTitle ? findEpisodeItem(feed, episodeTitle) : null;

  const guestNames = dedupeNames(
    extractGuestNames({ episodeItem, episodeTitle, hostNames }),
  );

  const hostQueue = [...hostNames];
  const hostLower = new Set(hostQueue.map((name) => name.toLowerCase()));
  const guestQueue = guestNames.filter(
    (name) => !hostLower.has(name.toLowerCase()),
  );

  if (sortedSpeakerIds.includes("0")) {
    const primaryHost = hostQueue.shift();
    if (primaryHost) {
      mapping.set("0", primaryHost);
    }
  }

  const remainingNames = [...hostQueue, ...guestQueue];
  let nameIndex = 0;

  for (const speakerId of sortedSpeakerIds) {
    if (speakerId === "0") continue;
    const candidate = remainingNames[nameIndex];
    if (candidate) {
      mapping.set(speakerId, candidate);
      nameIndex += 1;
    }
  }

  return mapping;
}

function findEpisodeItem(
  feed: RSSFeed,
  episodeTitle: string,
): RSSFeedItem | null {
  const normalizedTarget = normalizeForComparison(episodeTitle);

  const exactMatch = feed.items.find(
    (item) =>
      typeof item.title === "string" &&
      normalizeForComparison(item.title) === normalizedTarget,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = feed.items.find(
    (item) =>
      typeof item.title === "string" &&
      normalizeForComparison(item.title).includes(normalizedTarget),
  );

  return partialMatch ?? null;
}

function extractHostNames(params: {
  feed: RSSFeed | null;
  podcastTitle: string | null;
}): string[] {
  const { feed, podcastTitle } = params;
  const candidates: string[] = [];

  const feedAuthor = feed?.itunes?.author;
  if (typeof feedAuthor === "string") {
    candidates.push(...splitCandidateNames(feedAuthor));
  }

  const ownerName = feed?.itunes?.owner?.name;
  if (typeof ownerName === "string") {
    candidates.push(...splitCandidateNames(ownerName));
  }

  const feedSummary = feed?.itunes?.summary;
  if (typeof feedSummary === "string") {
    candidates.push(...extractNamesByPatterns(feedSummary, HOST_PATTERNS));
  }

  if (typeof feed?.description === "string") {
    candidates.push(...extractNamesByPatterns(feed.description, HOST_PATTERNS));
  }

  if (podcastTitle) {
    candidates.push(...extractNamesFromPodcastTitle(podcastTitle));
  }

  return dedupeNames(candidates);
}

function extractGuestNames(params: {
  episodeItem: RSSFeedItem | null;
  episodeTitle: string | null;
  hostNames: string[];
}): string[] {
  const { episodeItem, episodeTitle, hostNames } = params;
  const candidates: string[] = [];

  if (episodeTitle) {
    candidates.push(
      ...extractNamesByPatterns(episodeTitle, TITLE_GUEST_PATTERNS),
    );
  }

  if (episodeItem) {
    const descriptionFields = [
      episodeItem.content,
      episodeItem.contentSnippet,
      episodeItem.summary,
      (episodeItem as { description?: unknown }).description,
    ];

    for (const field of descriptionFields) {
      if (typeof field === "string" && field.trim() !== "") {
        const cleaned = stripHtml(decodeEntities(field));
        candidates.push(
          ...extractNamesByPatterns(cleaned, DESCRIPTION_GUEST_PATTERNS),
        );
      }
    }

    if (typeof episodeItem.creator === "string") {
      candidates.push(...splitCandidateNames(episodeItem.creator));
    }

    const itemAuthor = (episodeItem as { author?: unknown }).author;
    if (typeof itemAuthor === "string") {
      candidates.push(...splitCandidateNames(itemAuthor));
    }

    const itunesAuthor = (episodeItem as { itunes?: { author?: unknown } })
      .itunes?.author;
    if (typeof itunesAuthor === "string") {
      candidates.push(...splitCandidateNames(itunesAuthor));
    }
  }

  const hostLower = new Set(hostNames.map((name) => name.toLowerCase()));
  return dedupeNames(
    candidates.filter((name) => !hostLower.has(name.toLowerCase())),
  );
}

function extractNamesByPatterns(text: string, patterns: RegExp[]): string[] {
  const names: string[] = [];

  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g")
      ? pattern.flags
      : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match = regex.exec(text);

    while (match !== null) {
      if (match?.[1]) {
        names.push(...splitCandidateNames(match[1]));
      }
      match = regex.exec(text);
    }
  }

  return names;
}

function extractNamesFromPodcastTitle(title: string): string[] {
  const patterns = [
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:Podcast|Show)/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)'s\s+(?:Podcast|Show)/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(title);
    if (match?.[1]) {
      return splitCandidateNames(match[1]);
    }
  }

  return [];
}

function splitCandidateNames(value: string): string[] {
  const sanitized = decodeEntities(stripHtml(value))
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022•]/g, " ");

  return sanitized
    .split(/,|&|\band\b|\bwith\b|\bfeaturing\b|\bfeat\.\b|\bx\b|\+|\r?\n|\//i)
    .map((segment) => segment.replace(/\((.*?)\)/g, " "))
    .map((segment) =>
      segment.replace(
        /\b(host|hosts|co-hosts?|cohosts?|guest|guests|special guest|special guests)\b/gi,
        "",
      ),
    )
    .map((segment) => segment.replace(/^[\s:;\-–—\u2022•]+/, ""))
    .map((segment) => segment.replace(/[\s:;\-–—\u2022•]+$/, ""))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter(isLikelyPersonName)
    .map((segment) => segment.replace(/\s+/g, " "));
}

function isLikelyPersonName(value: string): boolean {
  const tokens = value.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length < 2) {
    return false;
  }

  let hasCoreName = false;
  for (const token of tokens) {
    const normalized = token.replace(/[,]/g, "");
    const lower = normalized.toLowerCase();

    if (
      [
        "dr",
        "dr.",
        "mr",
        "mr.",
        "mrs",
        "mrs.",
        "ms",
        "ms.",
        "prof",
        "prof.",
        "sir",
        "dame",
      ].includes(lower)
    ) {
      continue;
    }

    if (["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"].includes(lower)) {
      continue;
    }

    if (/^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?$/.test(normalized)) {
      hasCoreName = true;
      continue;
    }

    if (/^[A-Z]\.$/.test(normalized)) {
      hasCoreName = true;
      continue;
    }

    return false;
  }

  return hasCoreName;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === "") continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compareSpeakerIds(a: string, b: string): number {
  const aNum = Number.parseInt(a, 10);
  const bNum = Number.parseInt(b, 10);

  const aHas = !Number.isNaN(aNum);
  const bHas = !Number.isNaN(bNum);

  if (aHas && bHas) {
    return aNum - bNum;
  }

  if (aHas) return -1;
  if (bHas) return 1;

  return a.localeCompare(b);
}

function deriveDefaultSpeakerLabel(speakerId: string): string {
  if (speakerId === "0") {
    return "Host";
  }

  const parsed = Number.parseInt(speakerId, 10);
  if (!Number.isNaN(parsed)) {
    return parsed === 1 ? "Guest" : `Guest ${parsed}`;
  }

  return `Speaker ${speakerId}`;
}

function normalizeScore(raw: number): number {
  const clamped = Math.max(-1, Math.min(1, raw));
  return (clamped + 1) / 2;
}
