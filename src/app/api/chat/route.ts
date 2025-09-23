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
import { auth } from "@/lib/auth";
import {
  createFollowupPrompt,
  createPodcastSystemPrompt,
} from "@/lib/prompt-utils";
import { db } from "@/server/db";
import { chatSession } from "@/server/db/schema/chat";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "https://chatwithpodcast.com",
    "X-Title": "Chat with Podcasts",
  },
});

const baseModel = openrouter.chat("x-ai/grok-4-fast:free", {
  reasoning: {
    enabled: true,
    effort: "high",
  },
  // plugins: [{ id: "web" }],
});

const BodySchema = z.object({
  messages: z.any(),
  model: z.string().optional(),
  webSearch: z.boolean().optional(),
  episodeId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const {
    messages,
    model: selectedModelId,
    webSearch,
    episodeId,
  } = BodySchema.parse(json);

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = convertToModelMessages(messages);
      const model = resolveModel({
        modelId: selectedModelId,
        webSearchEnabled: webSearch,
      });
      console.log("Streaming initial messages.");
      console.log(`Using model: ${model.modelId}`);
      const messagesFromResponse = await streamInitialMessages({
        writer,
        modelMessages,
        model,
        episodeId: episodeId ?? "ep_eb98jyg3z4kyjmga",
      });

      const followupSuggestions = generateFollowupSuggestions({
        model,
        modelMessages: [...modelMessages, ...messagesFromResponse],
      });

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
  const system = createPodcastSystemPrompt({ episodeId });

  const tools = {
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
      chunking: "word",
    }),
  });
  writer.merge(
    result.toUIMessageStream({
      sendStart: false,
      sendReasoning: true,
      sendSources: true,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { totalUsage: part.totalUsage };
        }
      },
      onFinish() {
        // console.log(JSON.stringify(messages, null, 2));
      },
    }),
  );
  // Wait for the model response to complete and return the response messages
  const response = await result.response;
  return response.messages as ModelMessage[];
}

function resolveModel({
  modelId,
  webSearchEnabled = false,
}: {
  modelId?: string;
  webSearchEnabled?: boolean;
}): LanguageModelV2 {
  if (process.env.NODE_ENV !== "production") {
    return baseModel;
  }
  // If Sonar search is selected, use Perplexity Sonar model.
  if (webSearchEnabled) {
    return openrouter.chat("x-ai/grok-4-fast:free", {
      reasoning: {
        enabled: true,
        effort: "high",
      },
      plugins: [{ id: "web" }],
    });
  }

  const id = modelId ?? "x-ai/grok-4-fast:free";

  // Fallback to requested model without extra options
  return openrouter.chat(id, {
    reasoning: {
      enabled: true,
      effort: "high",
    },
  });
}

// Create and stream follow-up suggestions (array of strings)
function generateFollowupSuggestions({
  modelMessages,
  model,
}: {
  modelMessages: ModelMessage[];
  model: LanguageModelV2;
}) {
  const followupPrompt = createFollowupPrompt();

  return streamObject({
    model,
    messages: [
      ...modelMessages,
      {
        role: "user",
        content: followupPrompt,
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
