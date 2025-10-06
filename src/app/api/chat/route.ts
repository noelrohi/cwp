import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/root";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "X-Title": "cwp",
  },
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // Get the session to ensure user is authenticated
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  // Create tRPC caller for RAG operations
  const createCaller = createCallerFactory(appRouter);
  const trpc = createCaller({
    db,
    session: session.session,
    user: session.user,
  });

  // Define tools with proper typing
  const tools = {
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
        const results = await trpc.rag.searchSaved({
          query,
          limit,
          minRelevanceScore,
        });

        return {
          results: results.map((r) => ({
            content: r.content,
            podcast: r.podcastTitle,
            episode: r.episodeTitle,
            speaker: r.speaker || "Unknown",
            timestamp: formatTimestamp(r.startTimeSec),
            citation: r.citation,
            similarity: Number(r.similarity?.toFixed(3) || 0),
            relevanceScore: r.relevanceScore,
          })),
          totalFound: results.length,
        };
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
        const results = await trpc.rag.searchAll({
          query,
          limit,
          podcastIds,
        });

        return {
          results: results.map((r) => ({
            content: r.content,
            podcast: r.podcastTitle,
            episode: r.episodeTitle,
            speaker: r.speaker || "Unknown",
            timestamp: formatTimestamp(r.startTimeSec),
            citation: r.citation,
            similarity: Number(r.similarity?.toFixed(3) || 0),
          })),
          totalFound: results.length,
        };
      },
    },
  };

  const result = streamText({
    model: openrouter("openai/gpt-5-codex"),
    messages: convertToModelMessages(messages),
    system: `You are CWP (Chat With Podcasts) — an AI assistant that helps users discover and understand insights from their saved podcast content.

Core identity:
- You have access to the user's personally curated podcast library
- You retrieve actual transcript segments with timestamps and citations
- You focus on concrete, actionable insights from real conversations

Behavioral guidelines:
- Always search the user's saved content first before answering podcast-related questions
- Cite your sources with [podcast name - episode title (timestamp)]
- Use direct quotes from transcripts when available
- If no relevant content is found, say so clearly and suggest what the user might save next
- Keep responses concise — users want insights, not essays
- Never fabricate content or timestamps

Tool usage:
- search_saved_content: Use this for most queries about podcast topics
- search_all_content: Use this when user asks to search beyond their saved content
- Always include timestamps in [mm:ss] or [h:mm:ss] format

Tone:
- Direct and practical
- Conversational but not chatty
- Emphasize what was actually said over your interpretations`,
    tools,
  });

  return result.toUIMessageStreamResponse();
}

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
