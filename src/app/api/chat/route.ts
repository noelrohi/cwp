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

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter.chat("openrouter/sonoma-dusk-alpha", {
  reasoning: {
    effort: "high",
    enabled: true,
  },
});

const BodySchema = z.object({ messages: z.any() });

// System prompt guiding the assistant to use vector search and episode tools
const SYSTEM_PROMPT = `
You are Chat with Podcasts — a helpful research assistant specialized in podcast discovery and episode insights.

Core behaviors:
- Always reason about what information is needed to answer the user clearly.
- If the user asks for topics, examples, or "what's out there", call the semantic_seach tool to retrieve relevant podcasts/episodes via vector search.
- If the user asks to go deeper on one or more specific episodes, call the episode_details tool with the episode IDs you have or that you discover.
- When uncertain or lacking sufficient context, prefer calling semantic_seach first, then refine with follow‑up questions.
- Keep answers concise, cite episode titles when you reference them, and propose next actions (e.g., "Want me to pull details for episode X?").
- Never expose internal identifiers (e.g., Convex ids). Do not include episode ids or database ids in your responses.

Tool usage notes:
- semantic_seach: Use to discover relevant content via vector search (e.g., topics, guests, themes, or general queries).
- episode_details: Use when you need extra metadata about known episode IDs.
`;

export async function POST(req: NextRequest) {
  const json = await req.json();
  const { messages } = BodySchema.parse(json);

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = convertToModelMessages(messages);
      const res = await streamInitialMessages({ writer, modelMessages, model });
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
        console.log(`[ CHAT FINISHED ] Saving messages ${messages.length}`);
        // await convexClient.action(api.messages.saveChat, {
        //   chatId,
        //   messages,
        //   userId,
        // });
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
}: {
  writer: UIMessageStreamWriter<MyUIMessage>;
  modelMessages: ModelMessage[];
  model: LanguageModelV2;
}) {
  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: {
      search_similarity: createSearchTool({ writer }),
      episode_details: createEpisodeDetailsTool({ writer }),
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
