import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { quotesSchema } from "@/ai/schema";
import { createPodscanClient, type Episode } from "@/lib/podscan";
import type { db as dbInstance } from "@/server/db";
import {
  episode,
  qaAnswer,
  qaCitation,
  qaQuery,
} from "@/server/db/schema/podcast";
import { findRelevantChunks, formatTimestamp } from "./generate";

type DB = typeof dbInstance;

interface EnrichedChunk {
  chunkId: string;
  episodeId: string | null;
  startSec: number;
  endSec: number;
  text: string | null;
  episodeTitle?: string;
  audioUrl?: string;
  similarity: number;
  podscanEpisodeId?: string;
  podscanData?: Episode;
}

async function fetchEpisodesFromPodscan(
  episodeIds: string[],
): Promise<Map<string, Episode>> {
  const podscanToken = process.env.PODSCAN_API_TOKEN;
  if (!podscanToken) {
    console.warn("PODSCAN_API_TOKEN not found, skipping word-level timestamps");
    return new Map();
  }

  const client = createPodscanClient(podscanToken);
  const episodeMap = new Map<string, Episode>();

  // Fetch episodes in parallel
  const fetchPromises = episodeIds.map(async (episodeId) => {
    try {
      const response = await client.getEpisode(episodeId, {
        wordLevelTimestamps: true,
        showFullPodcast: true,
      });

      if (response.episode) {
        episodeMap.set(episodeId, response.episode);
        console.log(`✅ Fetched Podscan data for episode: ${episodeId}`);
      }
    } catch (error) {
      console.warn(
        `⚠️ Failed to fetch Podscan data for episode ${episodeId}:`,
        error,
      );
    }
  });

  await Promise.all(fetchPromises);
  return episodeMap;
}

function buildSourcesBlock(chunks: EnrichedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `(${i + 1}) [${formatTimestamp(c.startSec)}] ${
          c.episodeTitle ? `${c.episodeTitle}: ` : ""
        }${(c.text ?? "").replaceAll("\n", " ").slice(0, 900)}`,
    )
    .join("\n\n");
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  const t = (text ?? "").replace(/\n+/g, " ").trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+/g);
  return parts.filter((p) => p && p.trim().length > 0);
}

function pickBestSentenceFrom(text: string, target: string): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return (text ?? "").trim();

  const targetTokens = new Set(
    normalize(target)
      .split(/[^a-z0-9']+/g)
      .filter((w) => w.length > 3),
  );

  let best = sentences[0];
  let bestScore = -1;
  for (const s of sentences) {
    const sTokens = new Set(
      normalize(s)
        .split(/[^a-z0-9']+/g)
        .filter((w) => w.length > 3),
    );
    let overlap = 0;
    for (const w of targetTokens) if (sTokens.has(w)) overlap++;

    if (overlap > bestScore) {
      bestScore = overlap;
      best = s.trim();
    }
  }
  return best.trim();
}

export async function generateGlobalQuotesAnswer(args: {
  db: DB;
  queryId: string;
  question: string;
}) {
  const { db, queryId, question } = args;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in environment");
  }

  const openrouter = createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer": "https://chatwithpodcast.com",
      "X-Title": "Chat with Podcasts",
    },
  });

  // Mark query as running
  try {
    await db
      .update(qaQuery)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(qaQuery.queryId, queryId));
  } catch (_e) {
    console.warn("Failed to update status to running", { queryId });
  }

  try {
    // 1. Get relevant chunks via vector search (no episode restriction)
    const chunks = await findRelevantChunks({
      db,
      text: question,
      limit: 15, // Get more chunks to have good coverage across episodes
      threshold: 0.2,
    });

    if (chunks.length === 0) {
      // No matches - provide graceful fallback
      const answerId = nanoid();
      await db.insert(qaAnswer).values({
        answerId,
        queryId,
        answerText:
          "No direct quote found. Want me to search all episodes or a specific one?",
      });

      try {
        await db
          .update(qaQuery)
          .set({ status: "succeeded", updatedAt: new Date() })
          .where(eq(qaQuery.queryId, queryId));
      } catch {}

      return;
    }

    // 2. Get unique episode IDs from chunks and limit to 3
    const episodeIds = Array.from(
      new Set(chunks.map((c) => c.episodeId).filter(Boolean) as string[]),
    ).slice(0, 3);

    console.log(
      `🎯 Found ${chunks.length} relevant chunks across ${episodeIds.length} episodes`,
    );

    // 3. Fetch episode details from database to get Podscan episode IDs
    const episodeRecords = await db
      .select({
        id: episode.id,
        episodeId: episode.episodeId, // This is the Podscan episode ID
        title: episode.title,
      })
      .from(episode)
      .where(inArray(episode.id, episodeIds));

    const episodeIdMap = new Map(
      episodeRecords.map((e) => [e.id, e.episodeId]),
    );

    // 4. Parallel fetch episodes using Podscan API for word-level timestamps
    const podscanEpisodeIds = episodeRecords.map((e) => e.episodeId);
    const podscanDataMap = await fetchEpisodesFromPodscan(podscanEpisodeIds);

    // 5. Enrich chunks with Podscan data
    const enrichedChunks: EnrichedChunk[] = chunks.map((chunk) => {
      const podscanEpisodeId = chunk.episodeId
        ? episodeIdMap.get(chunk.episodeId)
        : undefined;
      const podscanData = podscanEpisodeId
        ? podscanDataMap.get(podscanEpisodeId)
        : undefined;

      return {
        ...chunk,
        podscanEpisodeId,
        podscanData,
      };
    });

    const sourcesBlock = buildSourcesBlock(enrichedChunks);

    // 6. Generate quotes using AI (combining all episodes)
    const { object } = await generateObject({
      model: openrouter.chat("x-ai/grok-4-fast:free", {
        reasoning: { enabled: true, effort: "high" },
      }),
      schema: quotesSchema,
      system:
        "You extract quotes from podcast transcripts that are relevant to the question. IMPORTANT: Always copy quotes verbatim as contiguous spans that appear in the provided Sources. Do NOT paraphrase, summarize, or add words that aren't present in the Sources. Do NOT merge multiple speakers into one quote. You can use quotes from different episodes.",
      prompt:
        `Question: ${question}\n\n` +
        `Sources (from multiple episodes):\n${sourcesBlock}\n\n` +
        `Instructions:\n` +
        `- Extract 1-3 quotes from different speakers (guest/host) that best address the question.\n` +
        `- Quotes can come from different episodes - use the best quotes regardless of episode.\n` +
        `- Quotes must be exact, verbatim substrings from the Sources text above. No rewording, trimming, or added context.\n` +
        `- Include the speaker's name and episode title from the sources.\n` +
        `- Do not combine words from different speakers into one quote.`,
      temperature: 0.2,
      maxRetries: 2,
    });

    const quotes = object.quotes;

    // 7. Validate/repair quotes and match them to chunks
    const quoteData: Array<{
      quote: (typeof quotes)[number];
      chunk: EnrichedChunk;
    }> = [];

    for (let i = 0; i < quotes.length; i++) {
      const q = quotes[i];

      // Find the best matching chunk for this quote
      let bestChunk = enrichedChunks[0];
      let bestMatch = 0;

      for (const chunk of enrichedChunks) {
        const chunkText = chunk.text ?? "";
        const qNorm = normalize(q.quote);
        const cNorm = normalize(chunkText);

        if (cNorm.includes(qNorm)) {
          bestChunk = chunk;
          bestMatch = 1;
          break; // Perfect match found
        }

        // Calculate overlap for partial matches
        const qTokens = new Set(qNorm.split(/\s+/));
        const cTokens = new Set(cNorm.split(/\s+/));
        const overlap = Array.from(qTokens).filter((token) =>
          cTokens.has(token),
        ).length;

        if (overlap > bestMatch) {
          bestMatch = overlap;
          bestChunk = chunk;
        }
      }

      if (!bestChunk) continue;

      const chunkText = bestChunk.text ?? "";
      const qNorm = normalize(q.quote);
      const cNorm = normalize(chunkText);

      let fixedQuote = q.quote.trim();
      if (!cNorm.includes(qNorm)) {
        // Not verbatim; try to pick best matching sentence from the chunk
        fixedQuote = pickBestSentenceFrom(chunkText, q.quote);
        console.warn(
          `⚠️ Adjusted non-verbatim quote to transcript sentence: "${fixedQuote.slice(0, 120)}${
            fixedQuote.length > 120 ? "…" : ""
          }"`,
        );
      }

      const repaired = { ...q, quote: fixedQuote };
      quotes[i] = repaired;
      quoteData.push({ quote: repaired, chunk: bestChunk });
    }

    // 8. Build answer text with block quotes
    const answerLines: string[] = [];

    for (let i = 0; i < quotes.length; i++) {
      const quote = quotes[i];
      const data = quoteData[i];
      const timestamp = data?.chunk
        ? `(${formatTimestamp(data.chunk.startSec)}-${formatTimestamp(data.chunk.endSec)})`
        : "(~)";
      answerLines.push(`> ${quote.quote}`);
      answerLines.push(
        `- ${quote.speakerName}, ${quote.episodeTitle} ${timestamp}`,
      );
      answerLines.push("");
    }
    const answerText = answerLines.join("\n").trim();

    // 9. Store answer
    const answerId = nanoid();
    await db.insert(qaAnswer).values({
      answerId,
      queryId,
      answerText,
    });

    // 10. Save citations (from various episodes)
    for (let i = 0; i < quotes.length; i++) {
      const quote = quotes[i];
      const data = quoteData[i];
      if (!data?.chunk) continue;

      const startSec = data.chunk.startSec ?? 0;
      const endSec = data.chunk.endSec ?? startSec + 30;

      await db.insert(qaCitation).values({
        answerId,
        chunkId: data.chunk.chunkId,
        startSec: String(startSec),
        endSec: String(endSec),
        rank: i,
        speakerName: quote.speakerName,
      });
    }

    // 11. Mark query as succeeded
    try {
      await db
        .update(qaQuery)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(qaQuery.queryId, queryId));
    } catch {}

    console.log(
      `✅ Generated global quotes from ${episodeIds.length} episodes with ${quotes.length} quotes`,
    );
    return { answerId, quotes, episodeIds };
  } catch (error) {
    console.error("Global quote generation failed:", error);

    // Provide fallback answer and mark as failed
    const answerId = nanoid();
    await db.insert(qaAnswer).values({
      answerId,
      queryId,
      answerText:
        "Sorry, I encountered an error generating quotes for your question. Please try asking again.",
    });

    try {
      await db
        .update(qaQuery)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(qaQuery.queryId, queryId));
    } catch {}

    return { answerId, quotes: [], episodeIds: [] };
  }
}
