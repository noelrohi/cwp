#!/usr/bin/env tsx

import "dotenv/config";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/server/db";
import {
  episode,
  qaAnswer,
  qaCitation,
  qaQuery,
} from "@/server/db/schema/podcast";
import { findRelevantChunks, formatTimestamp } from "@/server/qa/generate";

// Question and target episode title fragment (can be overridden via -q / --question)
const DEFAULT_QUESTION = "How does Tomasz Tunguz manage podcast overload?";
let QUESTION = DEFAULT_QUESTION;

function parseCliQuestion(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-q" || a === "--question") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        console.error("Expected a value after -q/--question");
        process.exit(1);
      }
      return v;
    }
    const prefix = "--question=";
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return undefined;
}

{
  const cliQ = parseCliQuestion(process.argv.slice(2));
  if (cliQ && cliQ.trim().length > 0) QUESTION = cliQ.trim();
}
const TITLE_MATCH =
  "how to digest 36 weekly podcasts without spending 36 hours listening";

type EpisodeRow = {
  id: string;
  episodeId: string;
  title: string;
  audioUrl?: string | null;
  guest?: string | null;
  hostName?: string | null;
};

async function findEpisodeByTitle(): Promise<EpisodeRow | null> {
  const titleLike = `%${TITLE_MATCH.toLowerCase()}%`;
  const altLike = `%${"tomasz tunguz"}%`;

  const rows = await db
    .select({
      id: episode.id,
      episodeId: episode.episodeId,
      title: episode.title,
      audioUrl: episode.audioUrl,
      guest: episode.guest,
      hostName: episode.hostName,
    })
    .from(episode)
    .where(
      sql`lower(${episode.title}) like ${titleLike} or lower(${episode.title}) like ${altLike}`,
    )
    .orderBy((t) => desc(t.title))
    .limit(5);

  if (rows.length === 0) return null;

  // Prefer the strongest match containing the long phrase
  const exactish = rows.find((r) =>
    (r.title ?? "").toLowerCase().includes(TITLE_MATCH),
  );
  return exactish ?? rows[0];
}

async function logTopChunks(
  chunks: Awaited<ReturnType<typeof findRelevantChunks>>,
) {
  console.log("\nTop relevant chunks (by similarity):\n");
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const preview = (c.text ?? "").trim().slice(0, 160).replace(/\s+/g, " ");
    console.log(
      `(${i + 1}) [${formatTimestamp(c.startSec)} - ${formatTimestamp(c.endSec)}] score=${c.similarity.toFixed(3)}\n    ${preview}${preview.length === 160 ? "…" : ""}\n`,
    );
  }
}

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

async function generateAudioClip(
  audioUrl: string,
  startSec: number,
  endSec: number,
  outputFilename: string,
): Promise<string> {
  const publicDir = path.join(process.cwd(), "public", "mp3");
  const outputPath = path.join(publicDir, outputFilename);
  const clipUrl = `/mp3/${outputFilename}`;

  try {
    // Ensure the public/mp3 directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Use ffmpeg to clip the audio
    const ffmpegCommand = `ffmpeg -ss ${startSec} -i "${audioUrl}" -t ${endSec - startSec} -c copy "${outputPath}" -y`;

    console.log(
      `🎵 Generating clip: ${outputFilename} (${formatTimestamp(startSec)} - ${formatTimestamp(endSec)})`,
    );
    execSync(ffmpegCommand, { stdio: "pipe" });

    return clipUrl;
  } catch (error) {
    console.error(`Failed to generate clip ${outputFilename}:`, error);
    return "";
  }
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY in environment.");
    process.exit(1);
  }

  const openrouter = createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer": "https://chatwithpodcast.com",
      "X-Title": "Chat with Podcasts",
    },
  });
  console.log("🔎 Finding target episode by title fragment…");
  const ep = await findEpisodeByTitle();
  if (!ep) {
    console.error(
      "Could not find the episode. Ensure you've ingested it into the DB.",
    );
    process.exit(1);
  }

  console.log(`🎯 Episode: ${ep.title}`);
  console.log(`❓ Question: ${QUESTION}`);

  console.log("\n📚 Running vector search for relevant transcript chunks…");
  let chunks = await findRelevantChunks({
    db,
    text: QUESTION,
    episodeId: ep.id,
    limit: 8,
    threshold: 0.2,
  });

  if (chunks.length === 0) {
    console.error("No relevant chunks found above threshold.");
    process.exit(1);
  }

  // Augment with a targeted search for the distinctive term mentioned by the user
  try {
    const extra = await findRelevantChunks({
      db,
      text: "parakeet podcast processor",
      episodeId: ep.id,
      limit: 4,
      threshold: 0.0,
    });
    if (extra.length > 0) {
      const seen = new Set(chunks.map((c) => c.chunkId));
      const merged = chunks.concat(extra.filter((c) => !seen.has(c.chunkId)));
      // Keep the original ranking first, then extras by their similarity
      const originalIds = new Set(chunks.map((c) => c.chunkId));
      merged.sort((a, b) => {
        const aOrig = originalIds.has(a.chunkId) ? 1 : 0;
        const bOrig = originalIds.has(b.chunkId) ? 1 : 0;
        if (aOrig !== bOrig) return bOrig - aOrig; // originals first
        return (b.similarity ?? 0) - (a.similarity ?? 0);
      });
      // Cap the list to a reasonable size for the prompt
      chunks = merged.slice(0, 12);
    }
  } catch {}

  await logTopChunks(chunks);

  const sourcesBlock = buildSourcesBlock(chunks);

  console.log("\n🤖 Generating structured answer with AI SDK…\n");
  const schema = z.object({
    quotes: z
      .array(
        z.object({
          speaker: z.enum(["guest", "host"]),
          speakerName: z.string().min(2).max(100),
          quote: z.string().min(20).max(500),
          episodeTitle: z.string().min(5).max(200),
        }),
      )
      .min(1)
      .max(3),
  });

  const { object } = await generateObject({
    model: openrouter.chat("x-ai/grok-4-fast:free", {
      reasoning: { enabled: true, effort: "high" },
    }),
    schema,
    system:
      "You extract quotes from podcast transcripts that are relevant to the question. IMPORTANT: Always copy quotes verbatim as contiguous spans that appear in the provided Sources. Do NOT paraphrase, summarize, or add words that aren't present in the Sources. Do NOT merge multiple speakers into one quote.",
    prompt:
      `Question: ${QUESTION}\n\n` +
      `Sources:\n${sourcesBlock}\n\n` +
      `Instructions:\n` +
      `- Extract 1-3 quotes from different speakers (guest/host) that best address the question.\n` +
      `- Quotes must be exact, verbatim substrings from the Sources text above. No rewording, trimming, or added context.\n` +
      `- If the phrase 'parakeet podcast processor' appears, prefer including it exactly as said.\n` +
      `- Include the speaker's name and episode title from the sources.\n` +
      `- Do not combine words from different speakers into one quote.`,
    temperature: 0.2,
    maxRetries: 2,
  });

  type Quote = z.infer<typeof schema>["quotes"][number];
  const quotes: Quote[] = object.quotes;

  // Post-process to enforce verbatim quotes against the matched chunk text
  function normalize(s: string): string {
    return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function splitSentences(text: string): string[] {
    const t = (text ?? "").replace(/\n+/g, " ").trim();
    if (!t) return [];
    // naive sentence split; good enough for transcript spans
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

      // Small bonus if sentence contains the distinctive term "parakeet"
      if (/\bparakeet\b/i.test(s)) overlap += 3;

      if (overlap > bestScore) {
        bestScore = overlap;
        best = s.trim();
      }
    }
    return best.trim();
  }

  // Validate/repair quotes and match them to chunks for basic timestamps
  const quoteData: Array<{
    quote: Quote;
    chunk: (typeof chunks)[number];
  }> = [];

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    // Use different chunks for each quote to avoid duplicate key constraint
    // Fall back to first chunk if we don't have enough chunks
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

    const repaired: Quote = { ...q, quote: fixedQuote };
    quotes[i] = repaired;
    quoteData.push({ quote: repaired, chunk: bestChunk });
  }

  console.log("===== Key Quotes =====\n");

  for (let i = 0; i < quotes.length; i++) {
    const quote = quotes[i];
    const data = quoteData[i];
    const timestamp = data?.chunk
      ? `(${formatTimestamp(data.chunk.startSec)}-${formatTimestamp(data.chunk.endSec)})`
      : "(~)";
    console.log(`> ${quote.quote}`);
    console.log(`- ${quote.speakerName}, ${quote.episodeTitle} ${timestamp}\n`);
  }
  console.log("====================================================\n");

  // Persist question, answer and citations
  console.log("🗄️  Saving question, answer and citations to the database…");

  // 1) Create a question scoped to this episode
  const queryId = nanoid();
  await db.insert(qaQuery).values({
    queryId,
    mode: "episode",
    episodeId: ep.id,
    queryText: QUESTION,
    status: "queued",
  });

  // 2) Build answer text with block quotes
  const answerLines: string[] = [];

  // Add quotes in block format
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

  const answerId = nanoid();
  await db.insert(qaAnswer).values({
    answerId,
    queryId,
    answerText,
  });

  // 3) Save citations: map each quote to a chunk for basic timestamp reference
  console.log("🎵 Generating audio clips for citations...");

  for (let i = 0; i < quotes.length; i++) {
    const quote = quotes[i];
    const data = quoteData[i];
    if (!data?.chunk) continue;

    const startSec = data.chunk.startSec ?? 0;
    const endSec = data.chunk.endSec ?? startSec + 30; // Use chunk boundaries

    let clipUrl = null;

    // Generate audio clip if audioUrl is available
    if (ep.audioUrl) {
      const clipFilename = `${answerId}_citation_${i}.mp3`;
      clipUrl = await generateAudioClip(
        ep.audioUrl,
        startSec,
        endSec,
        clipFilename,
      );
    }

    await db.insert(qaCitation).values({
      answerId,
      chunkId: data.chunk.chunkId,
      startSec: String(startSec),
      endSec: String(endSec),
      rank: i,
      clipUrl,
      speakerName: quote.speakerName,
    });
  }

  // 4) Mark query as succeeded
  try {
    await db
      .update(qaQuery)
      .set({ status: "succeeded", updatedAt: new Date() })
      .where(sql`${qaQuery.queryId} = ${queryId}`);
  } catch {}

  console.log(`✅ Stored query ${queryId} with answer ${answerId}.`);
  console.log("💬 Ready for feedback. Tell me what to tweak.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
