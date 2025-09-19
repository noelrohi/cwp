import { openai } from "@ai-sdk/openai";
import { embed, generateId, tool, type UIMessageStreamWriter } from "ai";
import {
  and,
  cosineDistance,
  desc,
  eq,
  inArray,
  type SQL,
  sql,
} from "drizzle-orm";
import z from "zod/v4";
import type { MyUIMessage } from "@/ai/schema";
import { db } from "@/db";
import { episode, podcast, transcriptChunk } from "@/db/schema/podcast";

export const createSearchTool = ({
  writer,
  defaultEpisodeId,
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
  defaultEpisodeId?: string;
}) => {
  return tool({
    description:
      "Similarity search across podcast episode knowledge. Use this to discover relevant content.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().int().min(1).max(256).optional().default(16),
      podcastExternalId: z
        .string()
        .optional()
        .describe("Filter to a specific podcast by external id"),
      episodeId: z
        .string()
        .optional()
        .describe("Filter to a specific episode id"),
    }),
    execute: async ({ query, limit = 16, episodeId, podcastExternalId }) => {
      const id = generateId();
      const startTime = Date.now();
      const effectiveEpisodeId = episodeId ?? defaultEpisodeId;

      writer.write({
        id,
        type: "data-vector-search",
        data: {
          status: "processing",
          text: `🔍 Searching for: "${query}"`,
          query,
          limit,
          episodeId: effectiveEpisodeId,
          podcastExternalId,
        },
      });

      // Generate embedding for the query
      const { embedding: queryEmbedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: query.replaceAll("\n", " "),
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

      // Always join episode to enrich results with metadata (title, audio url)
      const qb = db
        .select({
          text: transcriptChunk.text,
          startSec: transcriptChunk.startSec,
          endSec: transcriptChunk.endSec,
          episodeId: transcriptChunk.episodeId,
          similarity,
          episodeTitle: episode.title,
          audioUrl: episode.audioUrl,
        })
        .from(transcriptChunk)
        .leftJoin(episode, eq(episode.id, transcriptChunk.episodeId));
      if (podcastExternalId) {
        filters.push(eq(episode.series, podcastExternalId));
      }

      const rows = await qb
        .where(filters.length ? and(...filters) : undefined)
        .orderBy((t) => desc(t.similarity))
        .limit(limit);

      const results = rows.map((r) => ({
        text: r.text,
        score: Number(r.similarity ?? 0),
        startMs: r.startSec ? Number(r.startSec) * 1000 : 0,
        endMs: r.endSec ? Number(r.endSec) * 1000 : 0,
        episodeId: r.episodeId,
        episodeTitle: r.episodeTitle ?? undefined,
        audioUrl: r.audioUrl ?? undefined,
      }));

      const duration = Date.now() - startTime;

      writer.write({
        id,
        type: "data-vector-search",
        data: {
          status: "complete",
          text: `Found ${results.length} relevant segments (${duration}ms)`,
          items: results,
          query,
          limit,
          episodeId: effectiveEpisodeId,
          podcastExternalId,
          duration,
          totalResults: results.length,
        },
      });

      // Emit a few source URLs for UI consumption (if we have audio URLs)
      const toMMSS = (ms: number) => {
        const sec = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(sec / 60)
          .toString()
          .padStart(2, "0");
        const s = (sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
      };
      for (const r of results.slice(0, Math.min(results.length, 5))) {
        if (r.audioUrl) {
          const seconds = Math.floor((r.startMs ?? 0) / 1000);
          const url = `${r.audioUrl}#t=${seconds}`;
          writer.write({
            type: "source-url",
            sourceId: generateId(),
            url,
            title: r.episodeTitle
              ? `${r.episodeTitle} — ${toMMSS(r.startMs ?? 0)}`
              : undefined,
          });
        }
      }

      return { results };
    },
  });
};

export const createEpisodeDetailsTool = ({
  writer,
  defaultEpisodeId,
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
  defaultEpisodeId?: string;
}) => {
  return tool({
    description:
      "Get episode details by id. Optionally search within that episode for top matching transcript segments (no full transcript).",
    inputSchema: z
      .object({
        episodeId: z.string().optional(),
        episodeIds: z.array(z.string()).optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(64).optional().default(6),
      })
      .refine((v) => Boolean(v.episodeId || v.episodeIds?.length), {
        message: "Provide episodeId or episodeIds",
      }),
    execute: async ({ episodeId, episodeIds, query, limit = 6 }) => {
      const id = generateId();

      writer.write({
        id,
        type: "data-episode-details",
        data: {
          status: "processing",
          text: "📡 Getting episode details...",
        },
      });

      const ids: string[] =
        (episodeId ?? defaultEpisodeId)
          ? [episodeId ?? (defaultEpisodeId as string)]
          : (episodeIds as string[]) || [];

      type EpisodeSummary = {
        title: string;
        createdAt?: number;
        durationSeconds: number;
        durationMinutes: number;
        thumbnail?: string;
        podcastExternalId: string | null;
        podcastName?: string;
        highlights?: Array<{
          text: string;
          startMs: number;
          endMs: number;
          score: number;
        }>;
      };
      if (ids.length === 0) {
        writer.write({
          id,
          type: "data-episode-details",
          data: {
            status: "error",
            text: "No episode id provided",
          },
        });
        return { episodes: [] };
      }

      // Fetch base episode details
      const epRows = await db
        .select({
          id: episode.id,
          title: episode.title,
          durationSec: episode.durationSec,
          publishedAt: episode.publishedAt,
          thumbnailUrl: episode.thumbnailUrl,
          audioUrl: episode.audioUrl,
          podcastExternalId: episode.series,
          podcastName: podcast.title,
        })
        .from(episode)
        .leftJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(inArray(episode.id, ids));

      const results: Array<EpisodeSummary> = [];
      for (const row of epRows) {
        const summary: EpisodeSummary = {
          title: row.title ?? "Untitled Episode",
          createdAt: row.publishedAt
            ? Number(new Date(row.publishedAt))
            : undefined,
          durationSeconds: row.durationSec ?? 0,
          durationMinutes: Math.round((row.durationSec ?? 0) / 60),
          thumbnail: row.thumbnailUrl ?? undefined,
          podcastExternalId: row.podcastExternalId ?? null,
          podcastName: row.podcastName ?? undefined,
        };

        if (query) {
          const { embedding: qEmbedding } = await embed({
            model: openai.textEmbeddingModel("text-embedding-3-small"),
            value: query.replaceAll("\n", " "),
          });
          const sim = sql<number>`1 - (${cosineDistance(
            transcriptChunk.embedding,
            qEmbedding,
          )})`;
          const highlights = await db
            .select({
              text: transcriptChunk.text,
              startSec: transcriptChunk.startSec,
              endSec: transcriptChunk.endSec,
              score: sim,
            })
            .from(transcriptChunk)
            .where(eq(transcriptChunk.episodeId, row.id))
            .orderBy((t) => desc(t.score))
            .limit(limit);
          summary.highlights = highlights.map((h) => ({
            text: h.text,
            startMs: h.startSec ? Number(h.startSec) * 1000 : 0,
            endMs: h.endSec ? Number(h.endSec) * 1000 : 0,
            score: Number(h.score ?? 0),
          }));
        }

        results.push(summary);
      }

      // Before writing details, also emit source URLs for top highlights
      const toMMSS = (ms: number) => {
        const sec = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(sec / 60)
          .toString()
          .padStart(2, "0");
        const s = (sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
      };
      for (let i = 0; i < epRows.length; i++) {
        const row = epRows[i]!;
        const episodeTitle = row.title ?? undefined;
        const audioUrl = row.audioUrl ?? undefined;
        if (!audioUrl) continue;
        const hls = results[i]?.highlights;
        if (!hls || hls.length === 0) continue;
        for (const h of hls.slice(0, Math.min(hls.length, 5))) {
          const seconds = Math.floor((h.startMs ?? 0) / 1000);
          const url = `${audioUrl}#t=${seconds}`;
          writer.write({
            type: "source-url",
            sourceId: generateId(),
            url,
            title: episodeTitle
              ? `${episodeTitle} — ${toMMSS(h.startMs ?? 0)}`
              : undefined,
          });
        }
      }

      writer.write({
        id,
        type: "data-episode-details",
        data: {
          status: "complete",
          text: `Retrieved ${results.length} episode${
            results.length > 1 ? "s" : ""
          }${query ? " with highlights" : ""}`,
          results,
        },
      });

      return { episodes: results };
    },
  });
};
