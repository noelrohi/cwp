import { generateObject } from "ai";
import { jsonrepair } from "jsonrepair";
import * as z from "zod/v4";
import type { TranscriptData } from "@/types/transcript";
import { openrouter } from "../../ai/models";

const model = openrouter("openai/gpt-5-nano");

export async function generateEpisodeSummary(
  transcript: TranscriptData,
  episodeTitle: string,
): Promise<string> {
  const transcriptText = formatTranscriptForSummary(transcript);

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
