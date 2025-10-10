import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { jsonrepair } from "jsonrepair";
import * as z from "zod/v4";
import type { TranscriptData } from "@/types/transcript";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "X-Title": "cwp",
  },
});

export async function generateEpisodeSummary(
  transcript: TranscriptData,
  episodeTitle: string,
): Promise<string> {
  const transcriptText = formatTranscriptForSummary(transcript);

  const model = openrouter("openai/gpt-4.1-mini", {
    reasoning: {
      enabled: true,
      effort: "medium",
    },
  });

  const prompt = `I want a quick overview summary of this episode, which outlines the key takeaways, examples and lessons in bite sized form. Also cherry pick the most impactful quotes from the episode.

Episode: "${episodeTitle}"

Transcript:
${transcriptText}
`;

  const result = await generateObject({
    model,
    schema: z.object({
      markdown: z.string(),
    }),
    experimental_repairText: async ({ text }) => {
      return jsonrepair(text);
    },
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  return result.object.markdown;
}

export async function generateArticleSummary(
  content: string,
  articleTitle: string,
): Promise<string> {
  const model = openrouter("openai/gpt-4.1-mini", {
    reasoning: {
      enabled: true,
      effort: "medium",
    },
  });

  const prompt = `I want a quick overview summary of this article, which outlines the key takeaways, examples and lessons in bite sized form. Also cherry pick the most impactful quotes from the article.

Article: "${articleTitle}"

Content:
${content}
`;

  const result = await generateObject({
    model,
    schema: z.object({
      markdown: z.string(),
    }),
    experimental_repairText: async ({ text }) => {
      return jsonrepair(text);
    },
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  return result.object.markdown;
}

function formatTranscriptForSummary(transcript: TranscriptData): string {
  return transcript
    .map((utterance) => {
      const speaker = utterance.speaker ? `Speaker ${utterance.speaker}: ` : "";
      return `${speaker}${utterance.transcript.trim()}`;
    })
    .join("\n\n");
}
