import type { UIMessageStreamWriter } from "ai";
import { z } from "zod";
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
// biome-ignore lint/suspicious/noExplicitAny: tRPC caller type is too complex to infer
type TRPCCaller = any;

export function createTools(
  trpc: TRPCCaller,
  writer?: UIMessageStreamWriter<ChatUIMessage>,
  episodeId?: string,
  articleId?: string,
  useSnipsTool = false,
  useSignalsTool = false,
) {
  // biome-ignore lint/suspicious/noExplicitAny: tools object requires flexible typing
  const baseTools: Record<string, any> = {};

  // Conditionally add snips tool
  if (useSnipsTool) {
    baseTools.search_saved_snips = {
      description:
        "Retrieve the user's saved snips (flashcards/notes). Use this when user asks about 'snips', 'flashcards', or 'my notes'. Call without query parameter to get all snips, or with a query to search within them. Do NOT use this for searching podcast library - this retrieves already-saved snips.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "Optional search query to find relevant snips by content or tags. If not provided, returns all snips.",
          ),
      }),
      execute: async ({ query }: { query?: string }) => {
        console.log(`\n🔍 [Tool: search_saved_snips] Executing...`);
        console.log(`   Query: ${query ? `"${query}"` : "ALL SNIPS"}`);

        try {
          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: query
                  ? `Searching your snips for "${query}"...`
                  : "Retrieving all your snips...",
                type: "info",
              },
              transient: true,
            });
          }

          const startTime = Date.now();
          const results = query
            ? await trpc.flashcards.search({ query })
            : await trpc.flashcards.list();
          const duration = Date.now() - startTime;

          console.log(
            `✅ [Tool: search_saved_snips] ${query ? "Found" : "Retrieved"} ${results.length} snips in ${duration}ms`,
          );

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `${query ? "Found" : "Retrieved"} ${results.length} snip${results.length !== 1 ? "s" : ""}`,
                type: "success",
              },
              transient: true,
            });
          }

          // biome-ignore lint/suspicious/noExplicitAny: flashcard type is complex
          const formattedResults = results.map((snip: any) => ({
            id: snip.id,
            front: snip.front,
            back: snip.back,
            tags: snip.tags || [],
            source: snip.source || "No source",
            createdAt: snip.createdAt,
            // Include episode/article context if available
            episode: snip.signal?.chunk?.episode
              ? {
                  title: snip.signal.chunk.episode.title,
                  podcast: snip.signal.chunk.episode.podcast?.title,
                }
              : undefined,
            article: snip.signal?.chunk?.article
              ? {
                  title: snip.signal.chunk.article.title,
                }
              : undefined,
          }));

          // Stream the snips for UI display
          if (writer && results.length > 0) {
            writer.write({
              type: "data-searchedSnips",
              id: "snips-1",
              data: {
                query: query || "all",
                snips: formattedResults,
                totalFound: results.length,
              },
            });
          }

          console.log(
            `📤 [Tool: search_saved_snips] Returning ${formattedResults.length} snip${formattedResults.length !== 1 ? "s" : ""}\n`,
          );
          return {
            snips: formattedResults,
            totalFound: results.length,
            query: query || null,
          };
        } catch (error) {
          console.error("❌ [Tool: search_saved_snips] ERROR:", error);

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Failed to search snips: ${error instanceof Error ? error.message : "Unknown error"}`,
                type: "error",
              },
              transient: true,
            });
          }

          throw error;
        }
      },
    };
  }

  // Conditionally add signals tool
  if (useSignalsTool) {
    baseTools.get_saved_signals = {
      description:
        "Retrieve the user's saved signals/highlights from podcast episodes and articles. Use this when user asks about 'saved signals', 'saved highlights', 'what I saved', or 'my bookmarks'. Do NOT use this for searching - this retrieves already-saved content.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Number of saved signals to retrieve (default: 20)")
          .optional(),
      }),
      execute: async ({ limit = 20 }: { limit?: number }) => {
        console.log(`\n🔍 [Tool: get_saved_signals] Executing...`);
        console.log(`   Limit: ${limit}`);

        try {
          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: "Retrieving your saved signals...",
                type: "info",
              },
              transient: true,
            });
          }

          const startTime = Date.now();
          const results = await trpc.signals.saved();
          const duration = Date.now() - startTime;

          // Limit the results
          const limitedResults = results.slice(0, limit);

          console.log(
            `✅ [Tool: get_saved_signals] Retrieved ${limitedResults.length} saved signals in ${duration}ms`,
          );

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Retrieved ${limitedResults.length} saved signal${limitedResults.length !== 1 ? "s" : ""}`,
                type: "success",
              },
              transient: true,
            });
          }

          // biome-ignore lint/suspicious/noExplicitAny: saved signal type is complex
          const formattedResults = limitedResults.map((signal: any) => ({
            id: signal.id,
            content: signal.content || signal.highlightQuote || "",
            savedAt: signal.savedAt,
            tags: [],
            notes: null,
            episode: signal.episode
              ? {
                  title: signal.episode.title,
                  podcast: signal.episode.podcast?.title,
                  speaker: signal.speaker,
                  timestamp: formatTimestamp(signal.startTimeSec),
                  startTimeSec: signal.startTimeSec,
                  endTimeSec: signal.endTimeSec,
                  audioUrl: signal.episode.audioUrl,
                }
              : undefined,
            article: undefined,
          }));

          // Stream the signals for UI display
          if (writer && limitedResults.length > 0) {
            writer.write({
              type: "data-retrievedSignals",
              id: "signals-1",
              data: {
                signals: formattedResults,
                totalFound: limitedResults.length,
              },
            });
          }

          console.log(
            `📤 [Tool: get_saved_signals] Returning ${formattedResults.length} signals\n`,
          );
          return {
            signals: formattedResults,
            totalFound: limitedResults.length,
          };
        } catch (error) {
          console.error("❌ [Tool: get_saved_signals] ERROR:", error);

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Failed to retrieve signals: ${error instanceof Error ? error.message : "Unknown error"}`,
                type: "error",
              },
              transient: true,
            });
          }

          throw error;
        }
      },
    };
  }

  // Always include search_all_content
  baseTools.search_all_content = {
    description:
      "Semantic search across ALL podcast episodes in the user's library. Use ONLY when user wants to 'search for', 'find episodes about', or discover NEW content. NEVER use this when user asks about 'saved signals', 'saved highlights', 'snips', or 'what I saved' - use the dedicated saved content tools instead.",
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
          // biome-ignore lint/suspicious/noExplicitAny: search results type varies
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
  };

  // Only include get_content if there's an episode or article context
  if (episodeId || articleId) {
    baseTools.get_content = {
      description: episodeId
        ? "Retrieve the full transcript content of the current episode. Use this when the user wants to analyze, search within, or ask questions about the specific episode they're viewing."
        : "Retrieve the full markdown content of the current article. Use this when the user wants to analyze, search within, or ask questions about the specific article they're viewing.",
      inputSchema: z.object({}),
      execute: async () => {
      console.log(
        `\n📄 [Tool: get_content] Executing for ${episodeId ? "episode" : "article"}...`,
      );

      try {
        if (writer) {
          writer.write({
            type: "data-retrievedContent",
            id: "content-1",
            data: {
              content: "",
              type: episodeId ? "episode" : "article",
              title: "",
              status: "loading",
            },
          });
        }

        const startTime = Date.now();
        const result = episodeId
          ? await trpc.episodes.getContent({ episodeId })
          : await trpc.articles.getContent({ articleId });
        const duration = Date.now() - startTime;

        console.log(
          `✅ [Tool: get_content] Retrieved content (${result.content.length} chars) in ${duration}ms`,
        );

        if (writer) {
          writer.write({
            type: "data-retrievedContent",
            id: "content-1",
            data: {
              content: result.content,
              type: episodeId ? "episode" : "article",
              title: result.title,
              status: "complete",
            },
          });
        }

        return {
          content: result.content,
          length: result.content.length,
        };
      } catch (error) {
        console.error("❌ [Tool: get_content] ERROR:", error);

        if (writer) {
          writer.write({
            type: "data-status",
            data: {
              message: `Failed to retrieve content: ${error instanceof Error ? error.message : "Unknown error"}`,
              type: "error",
            },
            transient: true,
          });
        }

        throw error;
      }
    },
  };
  }

  return baseTools;
}
