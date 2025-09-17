import { api } from "@chatwithpodcast/backend/convex/_generated/api";
import type { Id } from "@chatwithpodcast/backend/convex/_generated/dataModel";
import { generateId, tool, type UIMessageStreamWriter } from "ai";
import { ConvexHttpClient } from "convex/browser";
import z from "zod/v4";
import type { MyUIMessage } from "@/ai/schema";

export const createSearchTool = ({
  writer,
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
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
    execute: async ({ query, limit = 16, podcastExternalId, episodeId }) => {
      const id = generateId();

      writer.write({
        id,
        type: "data-vector-search",
        data: {
          status: "processing",
          text: `Searching for ${query}`,
        },
      });

      // Mock data for now
      const mockResults = Array.from(
        { length: Math.min(limit, 3) },
        (_, i) => ({
          text: `Mock search result ${i + 1} for query: ${query}`,
          score: 0.9 - i * 0.1,
          startMs: i * 30000,
          endMs: (i + 1) * 30000,
          episodeId: episodeId || `mock-episode-${i + 1}`,
        }),
      );

      writer.write({
        id,
        type: "data-vector-search",
        data: {
          status: "complete",
          text: `Searched for ${query}`,
        },
      });

      return {
        results: mockResults,
      };
    },
  });
};

export const createEpisodeDetailsTool = ({
  writer,
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
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
      .refine(
        (v) => Boolean(v.episodeId || (v.episodeIds && v.episodeIds.length)),
        {
          message: "Provide episodeId or episodeIds",
        },
      ),
    execute: async ({ episodeId, episodeIds, query, limit = 6 }) => {
      const id = generateId();

      writer.write({
        id,
        type: "data-episode-details",
        data: {
          status: "processing",
          text: "Getting episode details...",
        },
      });

      try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
        const client = new ConvexHttpClient(convexUrl);

        const ids: string[] = episodeId
          ? [episodeId]
          : (episodeIds as string[]);

        type EpisodeSummary = {
          title: string;
          createdAt?: number;
          durationSeconds: number;
          durationMinutes: number;
          thumbnail?: string;
          podcastExternalId: string;
          podcastName?: string;
          highlights?: Array<{
            text: string;
            startMs: string | number;
            endMs: string | number;
            score: number;
          }>;
        };

        const results: Array<EpisodeSummary> = [];

        for (const rawId of ids) {
          const eid = rawId as Id<"episodes">;
          const ep = await client.query(api.episodes.getById, { id: eid });
          if (!ep) continue;

          const podcast = await client.query(api.podcasts.getByExternalId, {
            externalId: ep.podcastExternalId,
          });

          const summary: EpisodeSummary = {
            title: ep.title,
            createdAt: ep.createdAt,
            durationSeconds: ep.durationSeconds,
            durationMinutes: ep.durationMinutes,
            thumbnail: ep.thumbnail,
            podcastExternalId: ep.podcastExternalId,
            podcastName: podcast?.name,
          };

          if (query) {
            const searchRes = await client.action(
              api.embeddings.searchTranscript,
              {
                query,
                limit,
                episodeId: eid,
              },
            );

            const highlights = (searchRes.items || []).map(
              (r: {
                _score: number;
                segment: {
                  text: string;
                  startMs: string | number;
                  endMs: string | number;
                };
              }) => ({
                text: r.segment.text,
                startMs: r.segment.startMs,
                endMs: r.segment.endMs,
                score: r._score,
              }),
            );

            summary.highlights = highlights;
          }

          results.push(summary);
        }

        if (results.length === 0) {
          writer.write({
            id,
            type: "data-episode-details",
            data: {
              status: "error",
              text: "No episodes found",
            },
          });
          return { error: "No episodes found or access denied" };
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
      } catch (error) {
        writer.write({
          id,
          type: "data-episode-details",
          data: {
            status: "error",
            text: "Failed to get episode details",
          },
        });
        throw error;
      }
    },
  });
};
