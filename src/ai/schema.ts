import type { UIMessage } from "ai";
import { z } from "zod";

export const citationSchema = z.object({
  content: z.string(),
  citations: z.array(
    z.object({
      number: z.string(),
      title: z.string(),
      url: z.string(),
      description: z.string().optional(),
      quote: z.string().optional(),
    }),
  ),
});

// Metadata attached to assistant messages (optional)
export const messageMetadataSchema = z.object({
  createdAt: z.number().optional(),
  model: z.string().optional(),
  totalUsage: z.object({
    inputTokens: z.nullish(z.number()),
    outputTokens: z.nullish(z.number()),
    totalTokens: z.nullish(z.number()),
    reasoningTokens: z.nullish(z.number()),
    cachedInputTokens: z.nullish(z.number()),
  }),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

// Data parts we plan to stream alongside text
export type MyUIMessage = UIMessage<
  MessageMetadata,
  {
    "vector-search": {
      status: "processing" | "complete" | "error";
      text: string;
      items?: unknown[];
      query?: string;
      limit?: number;
      episodeId?: string;
      podcastExternalId?: string;
      duration?: number;
      totalResults?: number;
    };
    "episode-details": {
      status: "processing" | "complete" | "error";
      text: string;
      results?: unknown;
    };
    // A compact list of quoted answers for a user question
    // Streamed via UIMessageStream type: 'data-answers'
    answers: {
      status: "processing" | "complete" | "error";
      text: string;
      items?: Array<{
        id: string;
        quote: string;
        guestName?: string | null;
        episodeTitle?: string | null;
        audioUrl?: string | null;
        startMs?: number | null;
        endMs?: number | null;
      }>;
      query?: string;
      total?: number;
    };
    // A single source/citation URL to show in the UI
    // Rendered via <Sources /> in the chat UI
    "source-url": {
      url: string;
      title?: string;
    };
    // Follow-up suggestions streamed from the model.
    // This will be written with UIMessageStream type: 'data-suggestions'
    // and contains a simple array of suggestion strings.
    suggestions: string[];
  }
>;
