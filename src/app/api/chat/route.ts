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
import {
  createPodcastSystemPrompt,
  createFollowupPrompt,
  createTranscriptCitationPrompt,
  createQualityAssurancePrompt,
} from "@/lib/prompt-utils";

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
  const basePrompt = createPodcastSystemPrompt({
    includeSimilarityTool,
    episodeId,
  });
  const citationPrompt = createTranscriptCitationPrompt();
  const qualityPrompt = createQualityAssurancePrompt();

  return `${basePrompt}\n\n${citationPrompt}\n\n${qualityPrompt}`;
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
      const dataPartId = crypto.randomUUID();

      writer.write({
        id: dataPartId,
        type: "reasoning-start",
      })
      const modelMessages = convertToModelMessages(messages);
      const effectiveSearchMode =
        searchMode ?? (webSearch ? "sonar" : undefined);
      const model = resolveModel({
        modelId: selectedModelId,
        searchMode: effectiveSearchMode,
      });
      console.log("Streaming initial messages.");
      console.log("Using model" + model.modelId);
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
    prepareStep: (step) => {
      console.log(JSON.stringify(step))
      return step
    },
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
      sendSources: true,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { totalUsage: part.totalUsage };
        }
      },
      onFinish({ messages,  }) {
        // console.log(JSON.stringify(messages, null, 2));
      },
    }),
  );
  // Wait for the model response to complete and return the response messages
  const response = await result.response;
  console.log(JSON.stringify(result.steps, null, 2))
  return response.messages as ModelMessage[];
}

function resolveModel({
  modelId,
  searchMode,
}: {
  modelId?: string;
  searchMode?: "similarity" | "sonar";
}): LanguageModelV2 {
  if (process.env.NODE_ENV !== "production") {
    return openrouter.chat("openrouter/sonoma-dusk-alpha", {
      reasoning: {
        enabled: true,
        effort: "high",
      },
      // plugins: [{ id: "web" }],
    });
  }
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
      plugins: [{ id: "web" }],
    });
  }

  // Default model: Sonoma Dusk with higher reasoning by default
  if (id === "openrouter/sonoma-dusk-alpha") {
    return openrouter.chat(id, {
      reasoning: { enabled: true, effort: "high" },
    });
  }

  // Fallback to requested model without extra options
  return openrouter.chat(id, {
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
