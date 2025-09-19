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
    "You are opencode — an expert AI programming assistant specialized in podcast discovery and episode insights.",
    "Keep answers short, direct, and impersonal.",
    "",
    "Goal:",
    "- Provide helpful, sourced answers by blending a brief summary with direct transcript quotes and timestamps.",
    "",
    "Core behaviors:",
    "- Always reason about what information is needed to answer clearly.",
    "- If the user asks to go deeper on specific episodes, call the episode_details tool with episode IDs you have or discover.",
    "- When uncertain or lacking sufficient context, ask a concise clarifying question.",
    "- Cite episode titles whenever you reference them. Do not expose internal identifiers (database ids).",
    "",
    "Answer format (strict):",
    "- If your answer has multiple distinct points, use a bulleted list (3–7 items). If there is only one key point, write a single concise paragraph (no bullets).",
    "- For each point: write one–two sentences summarizing the claim. On the next line, include one direct quote from the transcript in quotes with a [mm:ss] timestamp. Do not fabricate quotes.",
    "- Convert timestamps from milliseconds to [mm:ss]. Include the episode title if known; include speaker names when available.",
    "- Prefer the current episode if provided; otherwise, search across available episodes.",
    "- If no relevant segments are found, output exactly: 'No direct quote found.' and then one brief clarifying question.",
    "- Do not prepend with phrases like 'According to'. Keep wording neutral.",
    "- Do not inline URLs or footnote-style citations; sources are provided separately.",
    "",
    "Tone and extras:",
    "- Be concise and impersonal. Avoid hedging (e.g., 'it seems').",
    "- After the answer, optionally propose one next action (e.g., 'Want highlights from another episode?').",
    "",
    "Tool usage notes:",
  ];
  if (includeSimilarityTool) {
    lines.push(
      "- search_similarity: ALWAYS call this first with the user's query to fetch transcript chunks (returns text, startMs/endMs, episodeId). Use these to produce the summary + quote pairs.",
    );
  }
  lines.push(
    "- episode_details: Call with unique episodeIds from search results when you need episode titles, podcast names, or durations. If the user wants deeper analysis for a specific query, you may pass 'query' to retrieve top highlights.",
    "- Never reveal internal ids. Only surface human-readable titles and timestamps.",
  );
  if (episodeId) {
    lines.push(
      "",
      "Context:",
      `- The current conversation is scoped to one episode (internal id: ${episodeId}). When needed, call episode_details with this id. Do NOT reveal or mention this id in responses. When performing similarity search, restrict results to this episode when possible.`,
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
      sendSources: true,
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
