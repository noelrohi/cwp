import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { openrouter } from "@/ai/models";
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
    retrievedContent: {
      content: string;
      type: "episode" | "article";
      title?: string;
      status: "loading" | "complete";
    };
  }
>;

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

  const {
    messages,
    episodeId,
    articleId,
  }: { messages: UIMessage[]; episodeId?: string; articleId?: string } =
    await req.json();
  console.log(`📨 [Chat API] Received ${messages.length} messages`);
  if (episodeId) {
    console.log(`🎧 [Chat API] Episode context: ${episodeId}`);
  }
  if (articleId) {
    console.log(`📰 [Chat API] Article context: ${articleId}`);
  }
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

  // Build dynamic system prompt based on context
  const hasContext = Boolean(episodeId || articleId);
  const contextType = episodeId ? "episode" : articleId ? "article" : null;

  const baseSystemPrompt = `You are a helpful AI assistant that helps users discover and understand insights from their saved podcast content.

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
- Never fabricate content or timestamps`;

  const contextSystemPrompt = `You are a helpful AI assistant analyzing a specific ${contextType} for the user.

Context awareness:
- The user is currently viewing a specific ${contextType}
- You have access to the full ${contextType === "episode" ? "transcript" : "content"} via the get_content tool
- Focus your responses on this specific ${contextType} unless the user explicitly asks about other content

Behavioral guidelines:
- ALWAYS use the get_content tool first to retrieve the full ${contextType === "episode" ? "transcript" : "content"}
- After retrieving content, answer questions based on what's actually in the ${contextType}
- Cite specific sections with ${contextType === "episode" ? "timestamps [mm:ss] or [h:mm:ss]" : "direct quotes"}
- You can still use search_saved_content if the user asks to compare with other saved content
- Keep responses concise — users want insights, not essays
- Never fabricate content or timestamps`;

  const toolUsageInstructions = hasContext
    ? `
Tool usage:
- get_content: Use this FIRST to retrieve the full ${contextType} content before answering any questions
- search_saved_content: Use this if the user asks to find similar content or compare with other saved items
- search_all_content: Use this when user asks to search beyond their saved content
${contextType === "episode" ? "- Always include timestamps in [mm:ss] or [h:mm:ss] format" : ""}`
    : `
Tool usage:
- search_saved_content: Use this for most queries about podcast topics
- search_all_content: Use this when user asks to search beyond their saved content
- Always include timestamps in [mm:ss] or [h:mm:ss] format`;

  const systemPrompt =
    (hasContext ? contextSystemPrompt : baseSystemPrompt) +
    toolUsageInstructions +
    `

Tone:
- Direct and practical
- Conversational but not chatty
- Emphasize what was actually said over your interpretations`;

  const stream = createUIMessageStream<ChatUIMessage>({
    execute: ({ writer }) => {
      console.log("📡 [Chat API] Streaming response...\n");

      const result = streamText({
        model: openrouter("x-ai/grok-4-fast", {
          reasoning: {
            enabled: true,
            effort: "medium",
          },
        }),
        messages: convertToModelMessages(messages),
        system: systemPrompt,
        tools: createTools(trpc, writer, episodeId, articleId),
        prepareStep: ({ model }) => {
          if (hasContext) {
            console.log("Step skipping search tool as we have context");
            return {
              model,
              activeTools: ["get_content"],
            };
          }
        },
        experimental_transform: smoothStream({ chunking: "word" }),
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
