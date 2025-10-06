import type { UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { AppRouter } from "@/server/trpc/root";
import type { ChatUIMessage } from "@/app/api/chat/route";

// Helper function to format timestamps for citations
function formatTimestamp(seconds: number | null): string {
  if (seconds === null) return "unknown time";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Type for the tRPC caller - using 'any' to avoid complex type inference
type TRPCCaller = any;

export function createTools(
  trpc: TRPCCaller,
  writer?: UIMessageStreamWriter<ChatUIMessage>,
) {
  const baseTools = {
    search_saved_content: {
      description:
        "Search the user's saved podcast content semantically. Returns transcript chunks with full context (episode, podcast, speaker, timestamp). Use this when the user asks about topics they've saved or want to remember.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("The semantic search query - be specific and focused"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe("Number of results to return (default: 5)"),
        minRelevanceScore: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            "Minimum AI relevance score filter (0-1). Higher = more selective",
          ),
      }),
      execute: async ({
        query,
        limit,
        minRelevanceScore,
      }: {
        query: string;
        limit: number;
        minRelevanceScore?: number;
      }) => {
        console.log(`\n🔍 [Tool: search_saved_content] Executing...`);
        console.log(`   Query: "${query}"`);
        console.log(`   Limit: ${limit}`);
        console.log(`   Min relevance: ${minRelevanceScore ?? "none"}`);

        try {
          // Stream status: Starting search
          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Searching your saved content for "${query}"...`,
                type: "info",
              },
              transient: true,
            });

            writer.write({
              type: "data-searchResults",
              id: "search-1",
              data: { query, totalFound: 0, status: "searching" },
            });
          }

          const startTime = Date.now();
          const results = await trpc.rag.searchSaved({
            query,
            limit,
            minRelevanceScore,
          });
          const duration = Date.now() - startTime;

          console.log(
            `✅ [Tool: search_saved_content] Found ${results.length} results in ${duration}ms`,
          );

          if (results.length > 0) {
            console.log(
              `   Top result: ${results[0].episodeTitle} (similarity: ${results[0].similarity})`,
            );
          }

          // Stream status: Search complete
          if (writer) {
            writer.write({
              type: "data-searchResults",
              id: "search-1",
              data: { query, totalFound: results.length, status: "complete" },
            });

            writer.write({
              type: "data-status",
              data: {
                message: `Found ${results.length} result${results.length !== 1 ? "s" : ""}`,
                type: "success",
              },
              transient: true,
            });
          }

          const formattedResults = {
            results: results.map((r: any) => ({
              content: r.content,
              podcast: r.podcastTitle,
              episode: r.episodeTitle,
              speaker: r.speaker || "Unknown",
              timestamp: formatTimestamp(r.startTimeSec),
              citation: r.citation,
              similarity: Number(r.similarity?.toFixed(3) || 0),
              relevanceScore: r.relevanceScore,
              startTimeSec: r.startTimeSec ?? undefined,
              endTimeSec: r.endTimeSec ?? undefined,
              episodeAudioUrl: r.episodeAudioUrl ?? undefined,
            })),
            totalFound: results.length,
          };

          // Stream the retrieved chunks for UI display
          if (writer && results.length > 0) {
            writer.write({
              type: "data-retrievedChunks",
              id: "chunks-1",
              data: {
                chunks: formattedResults.results,
              },
            });
          }

          console.log(
            `📤 [Tool: search_saved_content] Returning result with ${formattedResults.totalFound} items\n`,
          );
          return formattedResults;
        } catch (error) {
          console.error("❌ [Tool: search_saved_content] ERROR:", error);
          console.error("   Error details:", JSON.stringify(error, null, 2));

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                type: "error",
              },
              transient: true,
            });
          }

          throw error;
        }
      },
    },
    search_all_content: {
      description:
        "Search ALL podcast episodes in the user's library (not just saved content). Use when user explicitly asks to search beyond their saved content or when saved search returns no results.",
      inputSchema: z.object({
        query: z.string().describe("The semantic search query"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Number of results to return (default: 10)"),
        podcastIds: z
          .array(z.string())
          .optional()
          .describe("Optional: filter by specific podcast IDs"),
      }),
      execute: async ({
        query,
        limit,
        podcastIds,
      }: {
        query: string;
        limit: number;
        podcastIds?: string[];
      }) => {
        console.log(`\n🔍 [Tool: search_all_content] Executing...`);
        console.log(`   Query: "${query}"`);
        console.log(`   Limit: ${limit}`);
        console.log(`   Podcast IDs: ${podcastIds?.length ?? "all"}`);

        try {
          // Stream status: Starting search
          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Searching all episodes for "${query}"...`,
                type: "info",
              },
              transient: true,
            });

            writer.write({
              type: "data-searchResults",
              id: "search-all-1",
              data: { query, totalFound: 0, status: "searching" },
            });
          }

          const startTime = Date.now();
          const results = await trpc.rag.searchAll({
            query,
            limit,
            podcastIds,
          });
          const duration = Date.now() - startTime;

          console.log(
            `✅ [Tool: search_all_content] Found ${results.length} results in ${duration}ms`,
          );

          if (results.length > 0) {
            console.log(
              `   Top result: ${results[0].episodeTitle} (similarity: ${results[0].similarity})`,
            );
          }

          // Stream status: Search complete
          if (writer) {
            writer.write({
              type: "data-searchResults",
              id: "search-all-1",
              data: { query, totalFound: results.length, status: "complete" },
            });

            writer.write({
              type: "data-status",
              data: {
                message: `Found ${results.length} result${results.length !== 1 ? "s" : ""}`,
                type: "success",
              },
              transient: true,
            });
          }

          const formattedResults = {
            results: results.map((r: any) => ({
              content: r.content,
              podcast: r.podcastTitle,
              episode: r.episodeTitle,
              speaker: r.speaker || "Unknown",
              timestamp: formatTimestamp(r.startTimeSec),
              citation: r.citation,
              similarity: Number(r.similarity?.toFixed(3) || 0),
              startTimeSec: r.startTimeSec ?? undefined,
              endTimeSec: r.endTimeSec ?? undefined,
              episodeAudioUrl: r.episodeAudioUrl ?? undefined,
            })),
            totalFound: results.length,
          };

          // Stream the retrieved chunks for UI display
          if (writer && results.length > 0) {
            writer.write({
              type: "data-retrievedChunks",
              id: "chunks-all-1",
              data: {
                chunks: formattedResults.results,
              },
            });
          }

          console.log(
            `📤 [Tool: search_all_content] Returning result with ${formattedResults.totalFound} items\n`,
          );
          return formattedResults;
        } catch (error) {
          console.error("❌ [Tool: search_all_content] ERROR:", error);
          console.error("   Error details:", JSON.stringify(error, null, 2));

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                type: "error",
              },
              transient: true,
            });
          }

          throw error;
        }
      },
    },
  };

  return baseTools;
}
