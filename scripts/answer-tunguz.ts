#!/usr/bin/env tsx

import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { desc, sql } from "drizzle-orm";
import ffmpegPath from "ffmpeg-static";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { episode, qaAnswer, qaCitation, qaQuery } from "@/db/schema/podcast";
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
type Word = { start: number; end: number; word: string };
type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: Word[];
};
type PodscanEpisode = {
  episode?: {
    episode_title?: string;
    episode_audio_url?: string;
    episode_transcript_word_level_timestamps?: { segments?: Segment[] } | false;
  };
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
        }${(c.text ?? "").replaceAll("\n", " ").slice(0, 450)}`,
    )
    .join("\n\n");
}

async function fetchPodscanSegments(
  episodeId: string,
  token: string,
): Promise<Segment[]> {
  const url = new URL(`https://podscan.fm/api/v1/episodes/${episodeId}`);
  url.searchParams.set("show_full_podcast", "true");
  url.searchParams.set("word_level_timestamps", "true");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok)
    throw new Error(`Podscan request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as PodscanEpisode;
  const segs = data.episode?.episode_transcript_word_level_timestamps;
  if (!segs || !Array.isArray(segs.segments)) return [];
  return segs.segments as Segment[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(s: string): string[] {
  const parts = s
    .split(/[.!?]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [s.trim()];
}

function findQuoteStartSec(
  quote: string,
  segments: Segment[],
): number | undefined {
  const sentences = splitSentences(quote);
  for (const sent of sentences) {
    const norm = normalize(sent);
    if (!norm || norm.length < 6) continue;
    for (const seg of segments) {
      const segNorm = normalize(seg.text ?? "");
      if (segNorm.includes(norm)) return seg.start;
    }
    const tokens = norm.split(" ");
    const n = Math.max(5, Math.min(10, tokens.length));
    for (let i = 0; i <= tokens.length - n; i++) {
      const window = tokens.slice(i, i + n).join(" ");
      for (const seg of segments) {
        const segNorm = normalize(seg.text ?? "");
        if (segNorm.includes(window)) return seg.start;
      }
    }
  }
  return undefined;
}

function findChunkForQuote(
  quote: string,
  chunks: Awaited<ReturnType<typeof findRelevantChunks>>,
  quoteStartSec?: number,
) {
  const normQuote = normalize(quote);
  // 1) Direct containment
  const direct = chunks.find((c) =>
    normalize(c.text ?? "").includes(normQuote),
  );
  if (direct) return direct;

  // 2) Sliding window token containment (5..10 words)
  const tokens = normQuote.split(" ").filter(Boolean);
  const n = Math.max(5, Math.min(10, tokens.length));
  for (let i = 0; i <= tokens.length - n; i++) {
    const window = tokens.slice(i, i + n).join(" ");
    const hit = chunks.find((c) => normalize(c.text ?? "").includes(window));
    if (hit) return hit;
  }

  // 3) Time containment if we have a timestamp
  if (typeof quoteStartSec === "number") {
    const byTime = chunks.find(
      (c) => quoteStartSec >= c.startSec && quoteStartSec <= c.endSec,
    );
    if (byTime) return byTime;
  }

  // 4) Fallback to the best ranked (first) chunk
  return chunks[0];
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
  const chunks = await findRelevantChunks({
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

  await logTopChunks(chunks);

  const sourcesBlock = buildSourcesBlock(chunks);

  // Fetch exact segments for precise timestamps
  const podscanToken =
    process.env.PODSCAN_TOKEN ?? process.env.PODSCAN_API_TOKEN;
  let segments: Segment[] = [];
  if (podscanToken) {
    try {
      segments = await fetchPodscanSegments(ep.episodeId, podscanToken);
      console.log(
        `\n📼 Loaded ${segments.length} word-level segments for alignment.`,
      );
    } catch (_e) {
      console.warn(
        "Failed to load Podscan segments — falling back to chunk starts.",
      );
    }
  } else {
    console.warn("PODSCAN_TOKEN not set — falling back to chunk starts.");
  }

  console.log("\n🤖 Generating structured answer with AI SDK…\n");
  const schema = z.object({
    items: z
      .array(
        z.object({
          bullet: z.string().min(8).max(220),
          quote: z.string().min(6).max(400),
          speaker: z.enum(["guest", "host"]).optional().nullable(),
        }),
      )
      .min(3)
      .max(5),
  });

  const { object } = await generateObject({
    model: openrouter.chat("x-ai/grok-4-fast:free", {
      reasoning: { enabled: true, effort: "high" },
    }),
    schema,
    system:
      "You write short, direct answers as bullet points. Use only the provided sources. For each bullet, include exactly one sentence in the field 'quote' copied verbatim from the sources. Also set 'speaker' to 'guest' or 'host' for who said the quote.",
    prompt:
      `Question: ${QUESTION}\n\n` +
      `Sources (id, start time, text):\n${sourcesBlock}\n\n` +
      `Instructions:\n` +
      `- Produce 3–5 bullets summarizing how he manages podcast overload.\n` +
      `- For each bullet, set 'quote' to an exact sentence from the sources (no paraphrase).\n` +
      `- Also set 'speaker' to 'guest' or 'host' for who said that exact quote. If truly uncertain, make your best guess.\n` +
      `- Keep bullets practical and specific.`,
    temperature: 0.2,
    maxRetries: 2,
  });

  type Item = z.infer<typeof schema>["items"][number];
  const items: Item[] = object.items;

  console.log("===== AI Answer (precise timestamps when found) =====\n");
  for (const it of items) {
    const t = segments.length
      ? findQuoteStartSec(it.quote, segments)
      : undefined;
    const tag = t !== undefined ? `[${formatTimestamp(t)}]` : "[~]";
    console.log(`- ${it.bullet}`);
    const sp = it.speaker ? ` (${it.speaker})` : "";
    console.log(`  "${it.quote}" ${tag}${sp}`);
  }
  console.log("\n====================================================\n");

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

  // 2) Build a single answer text combining bullets + quotes (+ timestamps)
  const answerLines: string[] = [];
  const startTimes: Array<number | undefined> = [];
  for (const it of items) {
    const t = segments.length
      ? findQuoteStartSec(it.quote, segments)
      : undefined;
    startTimes.push(t);
    const tag = t !== undefined ? `[${formatTimestamp(t)}]` : "[~]";
    answerLines.push(`- ${it.bullet}`);
    // Keep answer text unchanged (quote + timestamp only)
    answerLines.push(`  "${it.quote}" ${tag}`);
    answerLines.push("");
  }
  const answerText = answerLines.join("\n").trim();

  const answerId = nanoid();
  await db.insert(qaAnswer).values({
    answerId,
    queryId,
    answerText,
  });

  // 3) Save citations: map each quote to the best chunk and timestamp range
  // Use a short clip window when we have exact quote start; otherwise fall back to the chunk range
  const seenChunkIds = new Set<string>();
  const clipRanges: Array<{
    index: number;
    startSec: number;
    endSec: number;
    chunkId: string;
    clipUrl: string;
  }> = [];
  // Determine filename base for clip URLs once
  const clipBase = (() => {
    if (ep.episodeId) return ep.episodeId;
    try {
      const last =
        new URL(ep.audioUrl ?? "").pathname.split("/").pop() ?? "audio";
      return last.replace(/\.[a-z0-9]+$/i, "");
    } catch {
      return "audio";
    }
  })();
  // Helper to resolve a human-readable speaker name from role
  function resolveSpeakerName(
    role: "guest" | "host" | null | undefined,
    ep: EpisodeRow,
  ): string | null {
    if (role === "guest") return ep.guest ?? null;
    if (role === "host") return ep.hostName ?? null;
    return ep.guest ?? ep.hostName ?? null;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const quoteStart = startTimes[i];
    const chosen = findChunkForQuote(it.quote, chunks, quoteStart);
    if (!chosen) continue;

    // Avoid duplicate (answerId, chunkId) PK conflicts
    if (seenChunkIds.has(chosen.chunkId)) continue;
    seenChunkIds.add(chosen.chunkId);

    const startSec =
      typeof quoteStart === "number" ? quoteStart : (chosen.startSec ?? 0);
    const defaultClipSeconds = 12;
    const endSecCandidate =
      typeof quoteStart === "number"
        ? quoteStart + defaultClipSeconds
        : (chosen.endSec ?? startSec + defaultClipSeconds);
    const endSec = Math.max(
      Math.min(endSecCandidate, chosen.endSec ?? endSecCandidate),
      startSec,
    );

    const clipUrl = `/mp3/${clipBase}-${answerId}-${i + 1}.mp3`;

    await db.insert(qaCitation).values({
      answerId,
      chunkId: chosen.chunkId,
      startSec: String(startSec),
      endSec: String(endSec),
      rank: i,
      clipUrl,
      speakerName: resolveSpeakerName(it.speaker ?? null, ep),
    });

    clipRanges.push({
      index: i,
      startSec,
      endSec,
      chunkId: chosen.chunkId,
      clipUrl,
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

  // 5) Snip the MP3 into mini clips under /public/mp3 using Mediabunny
  if (!ep.audioUrl) {
    console.warn("⚠️  Episode has no audioUrl; skipping MP3 clipping.");
    console.log("💬 Ready for feedback. Tell me what to tweak.");
    return;
  }

  try {
    mkdirSync("public/mp3", { recursive: true });
  } catch {}

  // Debug: log audio URL and basic headers
  try {
    console.log("🎯 Audio URL:", ep.audioUrl);
    const head = await fetch(ep.audioUrl, { method: "HEAD" });
    console.log("🔎 HEAD", head.status, head.statusText, {
      contentType: head.headers.get("content-type"),
      acceptRanges: head.headers.get("accept-ranges"),
      contentLength: head.headers.get("content-length"),
    });
  } catch (e) {
    console.warn("HEAD check failed:", e);
  }

  // Helper to persist the remote audio locally when URL-based parsing fails on some hosts
  async function ensureLocalAudio(
    inputUrl: string,
    baseName: string,
  ): Promise<string> {
    const { createWriteStream, existsSync } = await import("node:fs");
    const fsPromises = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(".cache", "audio");
    mkdirSync(dir, { recursive: true });
    let ext = "";
    try {
      const u = new URL(inputUrl);
      const last = u.pathname.split("/").pop() ?? "audio";
      ext = last.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
    } catch {}
    const filePath = path.join(dir, `${baseName}${ext || ".bin"}`);
    if (existsSync(filePath)) return filePath;

    const res = await fetch(inputUrl);
    if (!res.ok || !res.body)
      throw new Error(`Failed to download audio: ${res.status}`);
    const ws = createWriteStream(filePath);
    // Pipe Web ReadableStream to Node Writable
    const reader = res.body.getReader();
    await new Promise<void>((resolve, reject) => {
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await new Promise<void>((res2, rej2) =>
              ws.write(value, (e) => (e ? rej2(e) : res2())),
            );
          }
          ws.end(resolve);
        } catch (e) {
          ws.destroy();
          reject(e);
        }
      })();
    });
    await fsPromises.chmod(filePath, 0o644).catch(() => {});
    return filePath;
  }

  // Helper to write a clip using ffmpeg
  async function writeClip(
    inputUrl: string,
    start: number,
    end: number,
    outPath: string,
  ) {
    const ff = (ffmpegPath as string) || "ffmpeg";
    const startStr = Math.max(0, start).toFixed(3);
    const endStr = Math.max(start + 0.1, end).toFixed(3);
    const run = async (args: string[]) =>
      await new Promise<void>((resolve, reject) => {
        const cp = spawn(ff, args, { stdio: ["ignore", "pipe", "pipe"] });
        let err = "";
        cp.stderr.on("data", (d) => {
          err += String(d);
        });
        cp.on("error", reject);
        cp.on("close", (code) => {
          if (code === 0) resolve();
          else
            reject(new Error(err.trim() || `ffmpeg exited with code ${code}`));
        });
      });
    // 1) Try remote URL with stream copy
    try {
      await run([
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        startStr,
        "-to",
        endStr,
        "-i",
        inputUrl,
        "-map",
        "0:a:0?",
        "-c:a",
        "copy",
        "-y",
        outPath,
      ]);
      return;
    } catch {}

    // 2) Fallback: download locally then copy
    const localBase = clipBase || "audio";
    const localPath = await ensureLocalAudio(inputUrl, localBase);
    try {
      await run([
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        startStr,
        "-to",
        endStr,
        "-i",
        localPath,
        "-map",
        "0:a:0?",
        "-c:a",
        "copy",
        "-y",
        outPath,
      ]);
      return;
    } catch {}

    // 3) Last resort: re-encode locally
    await run([
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      startStr,
      "-to",
      endStr,
      "-i",
      localPath,
      "-map",
      "0:a:0?",
      "-vn",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "3",
      "-y",
      outPath,
    ]);
  }

  console.log("🎧 Creating MP3 snippets in public/mp3 …");
  for (const { index, startSec, endSec, clipUrl, chunkId } of clipRanges) {
    const outPath = `public${clipUrl}`;
    const label = `${formatTimestamp(startSec)}–${formatTimestamp(endSec)}`;
    process.stdout.write(`  • [${index + 1}] ${label} → ${outPath} `);
    try {
      await writeClip(ep.audioUrl, startSec, endSec, outPath);
      process.stdout.write("✓\n");
    } catch (e) {
      process.stdout.write("✗\n");
      console.warn(`     Failed to write clip:`, e);
      // Graceful fallback: point clipUrl at the source audio with a time offset
      try {
        const remoteOffsetUrl = `${ep.audioUrl}#t=${Math.floor(startSec)},${Math.floor(endSec)}`;
        await db
          .update(qaCitation)
          .set({ clipUrl: remoteOffsetUrl })
          .where(
            sql`${qaCitation.answerId} = ${answerId} and ${qaCitation.chunkId} = ${chunkId}`,
          );
      } catch {}
    }
  }

  console.log("💬 Ready for feedback. Tell me what to tweak.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
