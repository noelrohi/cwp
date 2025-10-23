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
        "Search the user's saved snips (flashcards/notes). Returns snips with their front (question/title), back (answer/content), tags, and source. Use this when user asks about their notes, flashcards, or study materials.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Search query to find relevant snips by content or tags"),
      }),
      execute: async ({ query }: { query: string }) => {
        console.log(`\n🔍 [Tool: search_saved_snips] Executing...`);
        console.log(`   Query: "${query}"`);

        try {
          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Searching your snips for "${query}"...`,
                type: "info",
              },
              transient: true,
            });
          }

          const startTime = Date.now();
          const results = await trpc.flashcards.search({ query });
          const duration = Date.now() - startTime;

          console.log(
            `✅ [Tool: search_saved_snips] Found ${results.length} snips in ${duration}ms`,
          );

          if (writer) {
            writer.write({
              type: "data-status",
              data: {
                message: `Found ${results.length} snip${results.length !== 1 ? "s" : ""}`,
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
                query,
                snips: formattedResults,
                totalFound: results.length,
              },
            });
          }

          console.log(
            `📤 [Tool: search_saved_snips] Returning ${formattedResults.length} snips\n`,
          );
          return {
            snips: formattedResults,
            totalFound: results.length,
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
        "Retrieve the user's saved signals/highlights from podcast episodes and articles. Returns saved content chunks with context. Use this when user asks about their saved content, highlights, or bookmarks.",
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
            id: signal.savedChunkId || signal.id,
            content: signal.chunkContent || signal.highlightExtractedQuote || "",
            savedAt: signal.savedAt,
            tags: signal.tags?.split(",").filter(Boolean) || [],
            notes: signal.notes || null,
            episode: signal.episodeId
              ? {
                  title: signal.episodeTitle,
                  podcast: signal.podcastTitle,
                  speaker: signal.speaker,
                  timestamp: formatTimestamp(signal.startTimeSec),
                  startTimeSec: signal.startTimeSec,
                  endTimeSec: signal.endTimeSec,
                  audioUrl: signal.episodeAudioUrl,
                }
              : undefined,
            article: signal.articleId
              ? {
                  title: signal.articleTitle,
                }
              : undefined,
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

  // Always include get_content
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

  return baseTools;
}
