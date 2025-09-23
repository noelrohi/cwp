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

export const quotesSchema = z.object({
  quotes: z
    .array(
      z.object({
        speaker: z.enum(["guest", "host"]),
        speakerName: z.string().min(2).max(100),
        quote: z.string().min(20).max(1000),
        episodeTitle: z.string().min(5).max(200),
      }),
    )
    .min(1)
    .max(3),
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
    "citation-sources": {
      citation: {
        number: number;
        title: string;
        sources: {
          url: string;
        }[];
      }[];
    };

    suggestions: string[];
  }
>;
