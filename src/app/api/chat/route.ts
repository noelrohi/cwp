import {
  createOpenRouter,
  type LanguageModelV2,
} from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  smoothStream,
  stepCountIs,
  streamObject,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { MyUIMessage } from "@/ai/schema";
import { createEpisodeDetailsTool, createSearchTool } from "@/ai/tools";
import { db } from "@/db";
import { chatSession } from "@/db/schema/chat";
import { auth } from "@/lib/auth";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "https://chatwithpodcast.com",
    "X-Title": "Chat with Podcasts",
  },
});

const BodySchema = z.object({
  messages: z.any(),
  model: z.string().optional(),
  webSearch: z.boolean().optional(),
  searchMode: z.enum(["similarity", "sonar"]).optional(),
  episodeId: z.string().optional(),
});

// Build a system prompt that conditionally includes the similarity search tool guidance
function getSystemPrompt({
  includeSimilarityTool,
  episodeId,
}: {
  includeSimilarityTool: boolean;
  episodeId?: string;
}) {
  const lines: string[] = [
    "You are Learn with Podcasts — a helpful research assistant specialized in podcast discovery and episode insights.",
    "",
    "Core behaviors:",
    "- Always reason about what information is needed to answer the user clearly.",
    "- If the user asks to go deeper on one or more specific episodes, call the episode_details tool with the episode IDs you have or that you discover.",
    "- When uncertain or lacking sufficient context, ask clarifying questions.",
    '- Keep answers concise, cite episode titles when you reference them, and propose next actions (e.g., "Want me to pull details for episode X?").',
    "- Never expose internal identifiers (e.g., database ids). Do not include episode ids or database ids in responses.",
    "",
    "Strict output policy:",
    "- The 'answer' MUST consist ONLY of direct quotes from the episode transcript, each paired with a timestamp.",
    "- Do NOT summarize or hedge (avoid phrases like 'there seems to be relevant answers').",
    "- Use the tools to retrieve transcript segments, then output 3–7 of the best matches as a list of quotes.",
    "- Format each line exactly as: - [mm:ss] \"QUOTE_TEXT\" and, if known, append ' — EPISODE TITLE'.",
    "- Prefer the current episode if provided; otherwise search across available episodes.",
    "- If no relevant segments are found, output exactly: 'No direct quote found.' and then one brief clarifying question.",
    "",
    "Tool usage notes:",
  ];
  if (includeSimilarityTool) {
    lines.push(
      "- search_similarity: ALWAYS call this first with the user's query to fetch transcript chunks (it returns text + startMs/endMs in milliseconds). Use those results to produce the timestamped quotes.",
    );
  }
  lines.push(
    "- episode_details: Use when you need extra metadata about known episode IDs.",
  );
  if (episodeId) {
    lines.push(
      "",
      "Context:",
      `- The current conversation is scoped to one episode (internal id: ${episodeId}). When needed, call episode_details with this exact id. Do not reveal or mention this id in responses. When performing similarity search, restrict results to this episode if possible.`,
    );
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const {
    messages,
    model: selectedModelId,
    webSearch,
    searchMode,
    episodeId,
  } = BodySchema.parse(json);

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = convertToModelMessages(messages);
      const effectiveSearchMode =
        searchMode ?? (webSearch ? "sonar" : undefined);
      const model = resolveModel({
        modelId: selectedModelId,
        searchMode: effectiveSearchMode,
      });
      const messagesFromResponse = await streamInitialMessages({
        writer,
        modelMessages,
        model,
        episodeId,
      });

      // After the initial response is streamed, generate
      // follow-up question suggestions and stream them too.
      const followupSuggestions = generateFollowupSuggestions({
        model,
        modelMessages: [...modelMessages, ...messagesFromResponse],
      });

      console.log({ followupSuggestions });

      await streamFollowupSuggestionsToFrontend({
        followupSuggestionsResult: followupSuggestions,
        writer,
      });
    },
    originalMessages: messages,
    generateId: createIdGenerator({
      prefix: "msg",
      size: 16,
    }),
    onError(error) {
      console.error("🚨 [ API CHAT ERROR ] Stream error occurred:");
      console.error("📋 [ ERROR DETAILS ]", JSON.stringify(error, null, 2));
      console.error(
        "🔍 [ ERROR STACK ]",
        error instanceof Error ? error.stack : "No stack trace",
      );

      throw error;
    },
    onFinish: async ({ messages }) => {
      try {
        const session = await auth.api.getSession({
          headers: await headers(),
        });

        const userId = session?.user?.id;

        if (!userId) {
          console.log("[ CHAT FINISHED ] No signed-in user; skipping save.");
          return;
        }

        await db.insert(chatSession).values({
          id: crypto.randomUUID(),
          userId,
          messages,
        });

        console.log(
          `[ CHAT FINISHED ] Saved ${messages.length} messages for user ${userId}`,
        );
      } catch (err) {
        console.error("Failed to save chat messages:", err);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}

async function streamInitialMessages({
  writer,
  modelMessages,
  model,
  episodeId,
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
  modelMessages: ModelMessage[];
  model: LanguageModelV2;
  episodeId?: string;
}): Promise<ModelMessage[]> {
  // Always include the similarity tool so answers can quote transcripts
  const includeSimilarityTool = true;
  const system = getSystemPrompt({ includeSimilarityTool, episodeId });
  const tools = {
    // Provide transcript similarity search in all modes (including Sonar)
    search_similarity: createSearchTool({
      writer,
      defaultEpisodeId: episodeId,
    }),
    episode_details: createEpisodeDetailsTool({
      writer,
      defaultEpisodeId: episodeId,
    }),
  } as const;

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(10),
    experimental_transform: smoothStream({
      delayInMs: 20,
      chunking: /[^-]*---/,
    }),
  });
  writer.merge(
    result.toUIMessageStream({
      sendStart: false,
      sendReasoning: true,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { totalUsage: part.totalUsage };
        }
      },
      onFinish({ messages }) {
        console.log(JSON.stringify(messages, null, 2));
      },
    }),
  );
  // Wait for the model response to complete and return the response messages
  const response = await result.response;
  return response.messages as ModelMessage[];
}

function resolveModel({
  modelId,
  searchMode,
}: {
  modelId?: string;
  searchMode?: "similarity" | "sonar";
}): LanguageModelV2 {
  // If Sonar search is selected, use Perplexity Sonar model.
  if (searchMode === "sonar") {
    return openrouter.chat("perplexity/sonar");
  }

  const id = modelId ?? "openrouter/sonoma-dusk-alpha";

  // Map GPT-5 variants to reasoning efforts
  if (id.startsWith("openai/gpt-5")) {
    let effort: "low" | "medium" | "high" = "high";
    if (id.endsWith("-low")) effort = "low";
    else if (id.endsWith("-medium")) effort = "medium";
    else if (id.endsWith("-high")) effort = "high";

    return openrouter.chat("openai/gpt-5", {
      reasoning: { enabled: true, effort },
    });
  }

  // Default model: Sonoma Dusk with higher reasoning by default
  if (id === "openrouter/sonoma-dusk-alpha") {
    return openrouter.chat(id, {
      reasoning: { enabled: true, effort: "high" },
    });
  }

  // Fallback to requested model without extra options
  return openrouter.chat(id);
}

// Create and stream follow-up suggestions (array of strings)
function generateFollowupSuggestions({
  modelMessages,
  model,
}: {
  modelMessages: ModelMessage[];
  model: LanguageModelV2;
}) {
  return streamObject({
    model,
    messages: [
      ...modelMessages,
      {
        role: "user",
        content:
          "What question should I ask next? Return an array of suggested questions. Make it not too long.",
      },
    ],
    schema: z.object({
      suggestions: z.array(z.string()),
    }),
  });
}

async function streamFollowupSuggestionsToFrontend({
  followupSuggestionsResult,
  writer,
}: {
  followupSuggestionsResult: ReturnType<typeof generateFollowupSuggestions>;
  writer: UIMessageStreamWriter<MyUIMessage>;
}) {
  // Ensure a single data part that updates as we stream
  const dataPartId = crypto.randomUUID();

  for await (const chunk of followupSuggestionsResult.partialObjectStream) {
    writer.write({
      id: dataPartId,
      type: "data-suggestions",
      data: chunk.suggestions?.filter((s) => s !== undefined) ?? [],
    });
  }
}
