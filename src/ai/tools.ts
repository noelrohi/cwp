import { generateId, tool, type UIMessageStreamWriter } from "ai";
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
    execute: async ({ query, limit = 16, episodeId }) => {
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
          text: "Getting episode details...",
        },
      });

      const ids: string[] = episodeId ? [episodeId] : (episodeIds as string[]);

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

      // Mock data for now
      const results: Array<EpisodeSummary> = ids.map((_, i) => {
        const summary: EpisodeSummary = {
          title: `Mock Episode ${i + 1}`,
          createdAt: Date.now() - i * 86400000,
          durationSeconds: 3600 + i * 300,
          durationMinutes: 60 + i * 5,
          thumbnail: `https://via.placeholder.com/300x300?text=Episode+${i + 1}`,
          podcastExternalId: `mock-podcast-${i + 1}`,
          podcastName: `Mock Podcast ${i + 1}`,
        };

        if (query) {
          summary.highlights = Array.from(
            { length: Math.min(limit, 3) },
            (_, j) => ({
              text: `Mock highlight ${j + 1} for query: ${query}`,
              startMs: j * 30000,
              endMs: (j + 1) * 30000,
              score: 0.9 - j * 0.1,
            }),
          );
        }

        return summary;
      });

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
