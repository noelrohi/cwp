import "server-only";

import { openai } from "@ai-sdk/openai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { embed, streamObject } from "ai";
import { and, cosineDistance, desc, eq, type SQL, sql } from "drizzle-orm";

import { citationSchema } from "@/ai/schema";
import { db } from "@/server/db";
import { episode, transcriptChunk } from "@/server/db/schema";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { prompt, effectiveEpisodeId, podcastExternalId } = await req.json();

  const { embedding: queryEmbedding } = await embed({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    value: prompt.replaceAll("\n", " "),
  });

  // similarity = 1 - cosine_distance
  const similarity = sql<number>`1 - (${cosineDistance(
    transcriptChunk.embedding,
    queryEmbedding,
  )})`;

  const filters: SQL<unknown>[] = [];
  if (effectiveEpisodeId) {
    filters.push(eq(transcriptChunk.episodeId, effectiveEpisodeId));
  }

  const needJoin = Boolean(podcastExternalId);
  const base = db
    .select({
      text: transcriptChunk.text,
      startSec: transcriptChunk.startSec,
      endSec: transcriptChunk.endSec,
      episodeId: transcriptChunk.episodeId,
      similarity,
    })
    .from(transcriptChunk);

  const qb = needJoin
    ? base.leftJoin(episode, eq(episode.id, transcriptChunk.episodeId))
    : base;
  if (podcastExternalId) {
    filters.push(eq(episode.series, podcastExternalId));
  }

  const rows = await qb
    .where(filters.length ? and(...filters) : undefined)
    .orderBy((t) => desc(t.similarity))
    .limit(20);

  const results = rows.map((r) => ({
    text: r.text,
    score: Number(r.similarity ?? 0),
    startMs: r.startSec ? Number(r.startSec) * 1000 : 0,
    endMs: r.endSec ? Number(r.endSec) * 1000 : 0,
    episodeId: r.episodeId,
  }));

  const result = streamObject({
    model: openrouter("x-ai/grok-4-fast:free"),
    schema: citationSchema,
    system: `You are an asisstant.

      <context>
      ${JSON.stringify(results, null, 2)}
      </context>`,
    prompt: `Generate a well-researched paragraph about ${prompt} with proper citations.

    Include:
    - A comprehensive paragraph with inline citations marked as [1], [2], etc.
    - 2-3 citations with realistic source information
    - Each citation should have a title, URL, and optional description/quote
    - Make the content informative and the sources credible

    Format citations as numbered references within the text.`,
  });

  return result.toTextStreamResponse();
}
