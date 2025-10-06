/**
 * Test script: Chat with RAG tools
 *
 * This tests the /api/chat endpoint with tool calling
 * to verify RAG search integration works end-to-end.
 *
 * Usage:
 *   tsx scripts/test-chat-with-rag.ts "What did they say about AI safety?"
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";
import { db } from "@/server/db";
import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/root";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "X-Title": "cwp-test",
  },
});

// Get query from command line
const query = process.argv[2];

if (!query) {
  console.error('❌ Usage: tsx scripts/test-chat-with-rag.ts "your question"');
  process.exit(1);
}

// Get user ID from command line or env
const userId = process.argv[3] || process.env.TEST_USER_ID;

if (!userId) {
  console.error("❌ No user ID provided. Usage:");
  console.error('   tsx scripts/test-chat-with-rag.ts "question" <userId>');
  console.error("   Or set TEST_USER_ID env var");
  process.exit(1);
}

// Helper function to format timestamps
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

async function testChatWithRAG() {
  console.log("\n🔍 Testing Chat with RAG\n");
  console.log(`Query: "${query}"`);
  console.log(`User ID: ${userId}\n`);

  // Create tRPC caller (same as in the API route)
  const createCaller = createCallerFactory(appRouter);
  const trpc = createCaller({
    db,
    session: null, // Not needed for this test
    user: { id: userId } as any, // Mock user for protectedProcedure
  });

  // Define tools (same as in the API route)
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
        console.log(`\n🔧 Tool called: search_saved_content`);
        console.log(`   Query: "${query}"`);
        console.log(`   Limit: ${limit}`);
        if (minRelevanceScore) {
          console.log(`   Min relevance: ${minRelevanceScore}`);
        }

        const results = await trpc.rag.searchSaved({
          query,
          limit,
          minRelevanceScore,
        });

        console.log(`   ✅ Found ${results.length} results\n`);

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
        console.log(`\n🔧 Tool called: search_all_content`);
        console.log(`   Query: "${query}"`);
        console.log(`   Limit: ${limit}`);
        if (podcastIds) {
          console.log(`   Podcast IDs: ${podcastIds.join(", ")}`);
        }

        const results = await trpc.rag.searchAll({
          query,
          limit,
          podcastIds,
        });

        console.log(`   ✅ Found ${results.length} results\n`);

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

  try {
    const startTime = Date.now();

    const result = await generateText({
      model: openrouter("openai/gpt-4o-mini"), // Using cheaper model for testing
      prompt: query,
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

    const duration = Date.now() - startTime;

    console.log("─".repeat(80));
    console.log("\n📝 Response:\n");
    console.log(result.text || "(empty response)");
    console.log("\n" + "─".repeat(80));

    if (result.toolResults && result.toolResults.length > 0) {
      console.log("\n🔧 Tool Results:");
      for (const toolResult of result.toolResults) {
        console.log(`\n  Tool: ${toolResult.toolName}`);
        console.log(
          `  Result:`,
          JSON.stringify(toolResult, null, 2).slice(0, 500),
        );
      }
    }

    console.log("\n📊 Stats:");
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Tool calls: ${result.toolCalls?.length || 0}`);
    console.log(`   Usage: ${JSON.stringify(result.usage, null, 2)}`);

    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log("\n🔧 Tool calls made:");
      for (const call of result.toolCalls) {
        console.log(`   - ${call.toolName}`);
      }
    }

    console.log("\n✅ Test completed successfully\n");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Run the test
testChatWithRAG().then(() => process.exit(0));
