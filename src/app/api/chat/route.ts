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
    searchedSnips: {
      query: string;
      snips: Array<{
        id: string;
        front: string;
        back: string;
        tags: string[];
        source: string;
        createdAt: Date;
        episode?: {
          title: string;
          podcast?: string;
        };
        article?: {
          title: string;
        };
      }>;
      totalFound: number;
    };
    retrievedSignals: {
      signals: Array<{
        id: string;
        content: string;
        savedAt: Date;
        tags: string[];
        notes: string | null;
        episode?: {
          title: string;
          podcast?: string;
          speaker: string | null;
          timestamp: string;
          startTimeSec: number | null;
          endTimeSec: number | null;
          audioUrl: string | null;
        };
        article?: {
          title: string;
        };
      }>;
      totalFound: number;
    };
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
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
    useSnipsTool = false,
    useSignalsTool = false,
    modelId = "z-ai/glm-4.6:exacto",
  }: {
    messages: UIMessage[];
    episodeId?: string;
    articleId?: string;
    useSnipsTool?: boolean;
    useSignalsTool?: boolean;
    modelId?: string;
  } = await req.json();
  console.log(`📨 [Chat API] Received ${messages.length} messages`);
  console.log(`🤖 [Chat API] Using model: ${modelId}`);
  if (episodeId) {
    console.log(`🎧 [Chat API] Episode context: ${episodeId}`);
  }
  if (articleId) {
    console.log(`📰 [Chat API] Article context: ${articleId}`);
  }
  if (useSnipsTool) {
    console.log(`📝 [Chat API] Snips tool enabled`);
  }
  if (useSignalsTool) {
    console.log(`⭐ [Chat API] Signals tool enabled`);
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

  const baseSystemPrompt = `You are a helpful AI assistant that helps users discover and understand insights from their saved podcast content, snips, and signals.

Core identity:
- You have access to the user's saved snips (flashcards/notes) and signals (saved highlights from podcasts/articles)
- You can search across all episodes in their podcast library
- You retrieve actual content with proper attribution and context
- You focus on concrete, actionable insights from real conversations

IMPORTANT - Understanding user intent:
- When user mentions "saved signals", "saved highlights", "what I saved", "my bookmarks" → Use get_saved_signals tool
- When user mentions "snips", "flashcards", "my notes" → Use search_saved_snips tool (no query needed to get all)
- When user wants to "search for X" or "find episodes about Y" → Use search_all_content tool
- NEVER use search_all_content when user is asking about their saved content

Behavioral guidelines:
- Cite your sources with [podcast name - episode title (timestamp)] for podcast content
- Use direct quotes from transcripts when available
- If no relevant content is found, say so clearly
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
- You can still use other tools if the user asks to compare with saved snips, signals, or search the library
- Keep responses concise — users want insights, not essays
- Never fabricate content or timestamps`;

  const toolUsageInstructions = hasContext
    ? `

Available tools:
- get_content: Retrieve the full ${contextType} content. Use this FIRST when analyzing this ${contextType}
${useSnipsTool ? "- search_saved_snips: Get saved snips. Call with no parameters to retrieve all, or with query to search" : ""}
${useSignalsTool ? "- get_saved_signals: Get saved signals/highlights. Call with optional limit parameter" : ""}
- search_all_content: Search the entire podcast library (NOT for saved content)
${contextType === "episode" ? "- Always include timestamps in [mm:ss] or [h:mm:ss] format" : ""}`
    : `

Available tools:
${useSnipsTool ? "- search_saved_snips: Get saved snips. Call with no parameters to retrieve all, or with query to search specific snips" : ""}
${useSignalsTool ? "- get_saved_signals: Get saved signals/highlights. Call with optional limit parameter (default 20, max 50)" : ""}
- search_all_content: Search the entire podcast library for new content (NOT for retrieving saved content)
- Always include timestamps in [mm:ss] or [h:mm:ss] format for podcast content`;

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
        model: openrouter(modelId),
        messages: convertToModelMessages(messages),
        system: systemPrompt,
        tools: createTools(
          trpc,
          writer,
          episodeId,
          articleId,
          useSnipsTool,
          useSignalsTool,
        ),
        experimental_transform: smoothStream({ chunking: "word" }),
        stopWhen: stepCountIs(10),
        onFinish: ({ text, toolCalls, finishReason, usage }) => {
          console.log({ text });
          console.log("\n✨ [Chat API] Stream finished");
          console.log(`   Finish reason: ${finishReason}`);
          console.log(`   Tool calls: ${toolCalls?.length ?? 0}`);
          console.log(`   Response length: ${text?.length ?? 0} chars`);
          console.log(`   Usage: ${JSON.stringify(usage)}`);

          // Send usage data to client
          if (usage && writer) {
            writer.write({
              type: "data-usage",
              data: {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
                reasoningTokens: usage.reasoningTokens,
                cachedInputTokens: usage.cachedInputTokens,
              },
            });
          }
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
