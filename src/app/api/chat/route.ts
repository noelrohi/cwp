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
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { MyUIMessage } from "@/ai/schema";
import { createEpisodeDetailsTool, createSearchTool } from "@/ai/tools";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { chatSession } from "@/db/schema/chat";

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
});

// Build a system prompt that conditionally includes the similarity search tool guidance
function getSystemPrompt({ includeSimilarityTool }: { includeSimilarityTool: boolean }) {
  const lines: string[] = [
    "You are Chat with Podcasts — a helpful research assistant specialized in podcast discovery and episode insights.",
    "",
    "Core behaviors:",
    "- Always reason about what information is needed to answer the user clearly.",
    "- If the user asks to go deeper on one or more specific episodes, call the episode_details tool with the episode IDs you have or that you discover.",
    "- When uncertain or lacking sufficient context, ask clarifying questions.",
    "- Keep answers concise, cite episode titles when you reference them, and propose next actions (e.g., \"Want me to pull details for episode X?\").",
    "- Never expose internal identifiers (e.g., database ids). Do not include episode ids or database ids in responses.",
    "",
    "Tool usage notes:",
  ];
  if (includeSimilarityTool) {
    lines.push(
      "- search_similarity: Use to discover relevant content via vector similarity search (e.g., topics, guests, themes, or general queries).",
    );
  }
  lines.push("- episode_details: Use when you need extra metadata about known episode IDs.");
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const { messages, model: selectedModelId, webSearch, searchMode } =
    BodySchema.parse(json);

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = convertToModelMessages(messages);
      const effectiveSearchMode = searchMode ?? (webSearch ? "sonar" : undefined);
      const model = resolveModel({
        modelId: selectedModelId,
        searchMode: effectiveSearchMode,
      });
      const res = await streamInitialMessages({
        writer,
        modelMessages,
        model,
        searchMode: effectiveSearchMode,
      });
      res;
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
  searchMode,
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
  modelMessages: ModelMessage[];
  model: LanguageModelV2;
  searchMode?: "similarity" | "sonar";
}) {
  const includeSimilarityTool = searchMode === "similarity";
  const system = getSystemPrompt({ includeSimilarityTool });
  const tools = {
    ...(includeSimilarityTool
      ? { search_similarity: createSearchTool({ writer }) }
      : {}),
    episode_details: createEpisodeDetailsTool({ writer }),
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
  return await result.consumeStream();
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
