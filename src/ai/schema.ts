import type { UIMessage } from "ai";
import { z } from "zod";

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
    };
    "episode-details": {
      status: "processing" | "complete" | "error";
      text: string;
      results?: unknown;
    };
  }
>;
