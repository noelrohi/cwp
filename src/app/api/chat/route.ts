import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createTools } from "@/ai/tools";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/root";

// Define custom message type with data parts
export type ChatUIMessage = UIMessage<
  never,
  {
    status: {
      message: string;
      type: "info" | "success" | "error";
    };
    searchResults: {
      query: string;
      totalFound: number;
      status: "searching" | "complete";
    };
    retrievedChunks: {
      chunks: Array<{
        content: string;
        podcast: string;
        episode: string;
        speaker: string;
        timestamp: string;
        citation: string;
        similarity: number;
        relevanceScore?: number;
        startTimeSec?: number;
        endTimeSec?: number;
        episodeAudioUrl?: string;
      }>;
    };
  }
>;

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  console.log("\n🚀 [Chat API] POST request received");

  // Get the session to ensure user is authenticated
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    console.log("❌ [Chat API] Unauthorized - no session");
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`✅ [Chat API] Authenticated user: ${session.user.id}`);

  const { messages }: { messages: UIMessage[] } = await req.json();
  console.log(`📨 [Chat API] Received ${messages.length} messages`);
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    console.log(
      `📝 [Chat API] Last message: ${JSON.stringify(lastMsg).slice(0, 150)}...`,
    );
  }

  // Create tRPC caller for RAG operations
  const createCaller = createCallerFactory(appRouter);
  const trpc = createCaller({
    db,
    session: session.session,
    user: session.user,
  });
  console.log("🔧 [Chat API] tRPC caller created");

  console.log("🤖 [Chat API] Initializing UI message stream...");

  const stream = createUIMessageStream<ChatUIMessage>({
    execute: ({ writer }) => {
      console.log("📡 [Chat API] Streaming response...\n");

      const result = streamText({
        model: openai("gpt-4.1-mini"),
        messages: convertToModelMessages(messages),
        system: `You are a helpful AI assistant that helps users discover and understand insights from their saved podcast content.

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
        tools: createTools(trpc, writer),
        stopWhen: stepCountIs(10),
        onFinish: ({ text, toolCalls, finishReason, usage }) => {
          console.log({ text });
          console.log("\n✨ [Chat API] Stream finished");
          console.log(`   Finish reason: ${finishReason}`);
          console.log(`   Tool calls: ${toolCalls?.length ?? 0}`);
          console.log(`   Response length: ${text?.length ?? 0} chars`);
          console.log(`   Usage: ${JSON.stringify(usage)}`);
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
