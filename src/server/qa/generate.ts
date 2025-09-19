import { openai } from "@ai-sdk/openai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { embed, generateObject } from "ai";
import { and, cosineDistance, desc, eq, gt, type SQL, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { db as dbInstance } from "@/db";
import {
  episode,
  qaAnswer,
  qaCitation,
  qaQuery,
  transcriptChunk,
} from "@/db/schema/podcast";

// Build a system prompt that conditionally includes the similarity search tool guidance
function getSystemPrompt({ episodeId }: { episodeId?: string }) {
  const lines: string[] = [
    "=== ROLE ===",
    "You are an AI assistant for the learn with podcast app.",
    "Keep answers SHORT, DIRECT, and IMPERSONAL.",
    "",
    "=== GOAL ===",
    "• Provide helpful, sourced answers",
    "• Blend brief summary + direct transcript quotes + timestamps",
    "",
    "=== CORE BEHAVIORS ===",
    "• Reason about what information is needed to answer clearly",
    "• When uncertain: ask ONE concise clarifying question",
    "• Cite episode titles — NEVER expose internal database IDs",
    "",
    "=== ANSWER FORMAT (STRICT) ===",
    "• Multiple points? Use bulleted list (3-7 items max)",
    "• Single point? Write one concise paragraph (no bullets)",
    "",
    "FOR EACH POINT:",
    "  → 1-2 sentences summarizing the claim",
    "  → Next line: ONE direct quote in quotes with [mm:ss] timestamp",
    "  → NEVER fabricate quotes",
    "",
    "TIMESTAMP RULES:",
    "  → Convert ms to [mm:ss] format",
    "  → Include episode title if known",
    "  → Include speaker names when available",
    "  → Prefer current episode if provided",
    "",
    "NO MATCH? Output exactly: 'No direct quote found.' + one clarifying question",
    "",
    "STYLE RULES:",
    "  → NO 'According to' or similar prefixes",
    "  → Keep wording neutral",
    "  → NO inline URLs or footnote citations",
    "",
    "=== TONE & EXTRAS ===",
    "• Be concise and impersonal",
    "• NO hedging (avoid 'it seems', 'probably', etc.)",
    "• After answer: optionally suggest ONE next action",
    "  Example: 'Want highlights from another episode?'",
  ];
  lines.push(
    "",
    "=== IDENTITY RULES ===",
    "• NEVER reveal internal IDs",
    "• ONLY surface human-readable titles and timestamps",
  );
  if (episodeId) {
    lines.push(
      "",
      "=== CONTEXT ===",
      `• Scoped to ONE episode (internal id: ${episodeId})`,
      "• NEVER reveal or mention this id in responses",
      "• Restrict similarity search to this episode when possible",
    );
  }
  return lines.join("\n");
}

const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(
      `[QA:INFO] ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
  error: (
    message: string,
    error?: Error | unknown,
    data?: Record<string, unknown>,
  ) => {
    console.error(
      `[QA:ERROR] ${message}`,
      error,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
  debug: (message: string, data?: Record<string, unknown>) => {
    console.debug(
      `[QA:DEBUG] ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(
      `[QA:WARN] ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  },
};

type DB = typeof dbInstance;

export async function generateAnswersForQuery(args: {
  db: DB;
  queryId: string;
  numAnswers?: number;
}) {
  const { db, queryId, numAnswers = 3 } = args;
  const startTime = Date.now();

  logger.info("Starting answer generation", { queryId, numAnswers });

  const [query] = await db
    .select()
    .from(qaQuery)
    .where(eq(qaQuery.queryId, queryId));

  if (!query) {
    logger.warn("Query not found", { queryId });
    return;
  }

  logger.debug("Query retrieved", {
    queryId,
    queryText: query.queryText,
    episodeId: query.episodeId,
  });

  const chunks = await findRelevantChunks({
    db,
    text: query.queryText,
    episodeId: query.episodeId ?? undefined,
    limit: 6,
  });

  logger.info("Retrieved relevant chunks", {
    queryId,
    chunkCount: chunks.length,
    episodeFilter: query.episodeId ?? "none",
  });

  if (chunks.length === 0) {
    return [];
  }

  const numbered = chunks.map((c, i) => ({
    number: i + 1,
    ...c,
  }));

  const mmss = (sec?: number | null) => formatTimestamp(Number(sec ?? 0));

  const sourcesBlock = numbered
    .map(
      (c) =>
        `(${c.number}) [${mmss(c.startSec)} - ${mmss(c.endSec)}] ${c.episodeTitle ? `${c.episodeTitle}: ` : ""}${truncate(
          c.text ?? "",
          450,
        )}`,
    )
    .join("\n\n");

  const schema = z.object({
    answers: z
      .array(
        z.object({
          text: z
            .string()
            .describe(
              "Answer following the system prompt format. Use bulleted lists for multiple points, single paragraph for single point. Include direct quotes with [mm:ss] timestamps.",
            ),
          citations: z
            .array(
              z.object({
                sourceNumber: z.number().min(1),
                startSec: z.number().nonnegative(),
                endSec: z.number().optional(),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(5),
  });

  const model = openrouter.chat("openrouter/sonoma-dusk-alpha");

  logger.debug("Generating AI response", {
    queryId,
    model: "openrouter/sonoma-dusk-alpha",
    sourcesCount: numbered.length,
    requestedAnswers: numAnswers,
  });

  try {
    const aiStartTime = Date.now();
    const { object } = await generateObject({
      model,
      schema,
      system: getSystemPrompt({
        episodeId: query.episodeId ?? undefined,
      }),
      prompt:
        `Question: ${query.queryText}\n\n` +
        `Sources (each shows a numeric id and the time range):\n${sourcesBlock}\n\n` +
        `Instructions:\n` +
        `- Produce ${numAnswers} alternative answers following the system prompt format.\n` +
        `- Each answer must include inline timestamps like [mm:ss] placed after the specific claim they support.\n` +
        `- Use only the timestamps from the sources above.\n` +
        `- For each answer, also return a citations array where each item points to a sourceNumber and startSec/endSec used.\n` +
        `- Do not invent new timestamps.\n` +
        `- Keep the answers direct and helpful for developers.`,
      temperature: 0.2,
    });

    const aiDuration = Date.now() - aiStartTime;
    logger.info("AI response generated", {
      queryId,
      aiDurationMs: aiDuration,
      answersGenerated: object.answers.length,
    });

    const generated = object.answers.slice(0, numAnswers);

    for (const ans of generated) {
      const answerId = nanoid();

      logger.debug("Storing answer", {
        queryId,
        answerId,
        answerLength: ans.text.length,
        citationCount: ans.citations.length,
      });

      await db.insert(qaAnswer).values({
        answerId,
        queryId,
        answerText: ans.text,
      });

      // Map citations to chunk ids by sourceNumber
      // Track seen chunk IDs to avoid duplicate key violations
      const seenChunkIds = new Set<string>();
      let validCitations = 0;
      for (let i = 0; i < ans.citations.length; i++) {
        const c = ans.citations[i];
        const src = numbered.find((n) => n.number === c.sourceNumber);
        if (!src) {
          logger.warn("Citation source not found", {
            queryId,
            answerId,
            sourceNumber: c.sourceNumber,
            availableSources: numbered.map((n) => n.number),
          });
          continue;
        }

        // Skip if we've already inserted a citation for this chunk
        if (seenChunkIds.has(src.chunkId)) {
          logger.debug("Skipping duplicate citation for chunk", {
            queryId,
            answerId,
            chunkId: src.chunkId,
            sourceNumber: c.sourceNumber,
          });
          continue;
        }

        await db.insert(qaCitation).values({
          answerId,
          chunkId: src.chunkId,
          startSec: String(c.startSec ?? src.startSec ?? 0),
          endSec: String(c.endSec ?? src.endSec ?? 0),
          rank: i,
        });
        seenChunkIds.add(src.chunkId);
        validCitations++;
      }

      logger.debug("Answer stored", {
        queryId,
        answerId,
        validCitations,
        totalCitations: ans.citations.length,
      });
    }

    const totalDuration = Date.now() - startTime;
    logger.info("Answer generation completed successfully", {
      queryId,
      totalDurationMs: totalDuration,
      answersStored: generated.length,
    });
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    logger.error("Answer generation failed", err, {
      queryId,
      totalDurationMs: totalDuration,
      errorType: err instanceof Error ? err.name : typeof err,
    });

    // Minimal fallback: one stub answer without citations
    const answerId = nanoid();
    await db.insert(qaAnswer).values({
      answerId,
      queryId,
      answerText:
        "We saved your question and are preparing answers. Please retry soon.",
    });

    logger.info("Fallback answer stored", { queryId, answerId });
  }
}

export async function findRelevantChunks(args: {
  db: DB;
  text: string;
  episodeId?: string;
  limit?: number;
  threshold?: number; // similarity threshold 0..1
}) {
  const { db, text, episodeId, limit = 6, threshold = 0.5 } = args;
  const startTime = Date.now();

  logger.debug("Finding relevant chunks", {
    textLength: text.length,
    episodeId: episodeId ?? "all",
    limit,
    threshold,
  });

  // Generate query embedding (following createSearchTool pattern)
  const embeddingStartTime = Date.now();
  const { embedding: queryEmbedding } = await embed({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    value: text.replaceAll("\n", " "),
  });

  const embeddingDuration = Date.now() - embeddingStartTime;
  logger.debug("Query embedding generated", {
    embeddingDurationMs: embeddingDuration,
    embeddingDimensions: queryEmbedding.length,
  });

  // similarity = 1 - cosine_distance (same as createSearchTool)
  const similarity = sql<number>`1 - (${cosineDistance(
    transcriptChunk.embedding,
    queryEmbedding,
  )})`;

  const filters: SQL<unknown>[] = [gt(similarity, threshold)];
  if (episodeId) filters.push(eq(transcriptChunk.episodeId, episodeId));

  const searchStartTime = Date.now();

  // Join with episode table to enrich results (following createSearchTool pattern)
  const rows = await db
    .select({
      chunkId: transcriptChunk.chunkId,
      episodeId: transcriptChunk.episodeId,
      startSec: transcriptChunk.startSec,
      endSec: transcriptChunk.endSec,
      text: transcriptChunk.text,
      similarity,
      episodeTitle: episode.title,
      audioUrl: episode.audioUrl,
    })
    .from(transcriptChunk)
    .leftJoin(episode, eq(episode.id, transcriptChunk.episodeId))
    .where(and(...filters))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);

  const searchDuration = Date.now() - searchStartTime;
  const totalDuration = Date.now() - startTime;

  const results = rows.map((r) => ({
    chunkId: r.chunkId,
    episodeId: r.episodeId,
    startSec: Number(r.startSec ?? 0),
    endSec: Number(r.endSec ?? 0),
    text: r.text,
    episodeTitle: r.episodeTitle ?? undefined,
    audioUrl: r.audioUrl ?? undefined,
    similarity: Number(r.similarity ?? 0),
  }));

  logger.info("Chunk search completed", {
    searchDurationMs: searchDuration,
    totalDurationMs: totalDuration,
    resultsFound: results.length,
    requestedLimit: limit,
    threshold,
    episodeFilter: episodeId ?? "none",
    averageSimilarity:
      rows.length > 0
        ? rows.reduce((sum, r) => sum + Number(r.similarity), 0) / rows.length
        : 0,
  });

  if (results.length === 0) {
    logger.warn("No chunks found above similarity threshold", {
      threshold,
      textPreview: text.slice(0, 100),
      episodeId: episodeId ?? "all",
    });
  }

  return results;
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function formatTimestamp(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
