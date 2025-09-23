import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { quotesSchema } from "@/ai/schema";
import type { db as dbInstance } from "@/server/db";
import { qaAnswer, qaCitation, qaQuery } from "@/server/db/schema/podcast";
import { findRelevantChunks, formatTimestamp } from "./generate";

type DB = typeof dbInstance;

function buildSourcesBlock(
  chunks: Awaited<ReturnType<typeof findRelevantChunks>>,
): string {
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

export async function generateQuotesAnswer(args: {
  db: DB;
  queryId: string;
  question: string;
  episodeId?: string;
}) {
  const { db, queryId, question, episodeId } = args;

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
    // Find relevant chunks
    const chunks = await findRelevantChunks({
      db,
      text: question,
      episodeId,
      limit: 8,
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

    const sourcesBlock = buildSourcesBlock(chunks);

    // Generate quotes using AI
    const { object } = await generateObject({
      model: openrouter.chat("x-ai/grok-4-fast:free", {
        reasoning: { enabled: true, effort: "high" },
      }),
      schema: quotesSchema,
      system:
        "You extract quotes from podcast transcripts that are relevant to the question. IMPORTANT: Always copy quotes verbatim as contiguous spans that appear in the provided Sources. Do NOT paraphrase, summarize, or add words that aren't present in the Sources. Do NOT merge multiple speakers into one quote.",
      prompt:
        `Question: ${question}\n\n` +
        `Sources:\n${sourcesBlock}\n\n` +
        `Instructions:\n` +
        `- Extract 1-3 quotes from different speakers (guest/host) that best address the question.\n` +
        `- Quotes must be exact, verbatim substrings from the Sources text above. No rewording, trimming, or added context.\n` +
        `- Include the speaker's name and episode title from the sources.\n` +
        `- Do not combine words from different speakers into one quote.`,
      temperature: 0.2,
      maxRetries: 2,
    });

    const quotes = object.quotes;

    // Validate/repair quotes and match them to chunks
    const quoteData: Array<{
      quote: (typeof quotes)[number];
      chunk: (typeof chunks)[number];
    }> = [];

    for (let i = 0; i < quotes.length; i++) {
      const q = quotes[i];
      // Use different chunks for each quote to avoid duplicate key constraint
      const bestChunk = chunks[i] || chunks[0];
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

    // Build answer text with block quotes
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

    // Store answer
    const answerId = nanoid();
    await db.insert(qaAnswer).values({
      answerId,
      queryId,
      answerText,
    });

    // Save citations
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

    // Mark query as succeeded
    try {
      await db
        .update(qaQuery)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(qaQuery.queryId, queryId));
    } catch {}

    return { answerId, quotes };
  } catch (error) {
    console.error("Quote generation failed:", error);

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

    return { answerId, quotes: [] };
  }
}
