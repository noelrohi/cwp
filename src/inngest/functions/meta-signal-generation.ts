import { generateObject } from "ai";
import { and, desc, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { openrouter } from "@/ai/models";
import { inngest } from "@/inngest/client";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  metaSignal,
  transcriptChunk,
} from "@/server/db/schema";

const MIN_CONFIDENCE_THRESHOLD = 0.7;
const MIN_QUOTES_REQUIRED = 2;
const MAX_QUOTES_TO_CONSIDER = 10;
const MIN_CLIP_DURATION = 30; // seconds
const MAX_CLIP_DURATION = 90; // seconds

// Simplified meta-signal schema for clips
const metaSignalClipSchema = z.object({
  hook: z.string().describe("Punchy headline without emojis (10 words max)"),
  thought: z
    .string()
    .describe(
      "2-3 sentence synthesis explaining WHY this matters, with concrete examples",
    ),
  timestampStart: z.number().describe("Clip start time in seconds"),
  timestampEnd: z.number().describe("Clip end time in seconds"),
});

export const generateMetaSignalForEpisode = inngest.createFunction(
  {
    id: "generate-meta-signal-episode",
    name: "Generate Meta Signal for Episode",
    retries: 2,
  },
  { event: "meta-signal/generate.episode" },
  async ({ event, step }) => {
    const { episodeId, userId } = event.data;

    // Step 1: Get episode context
    const episodeData = await step.run("fetch-episode-context", async () => {
      const result = await db
        .select({
          id: episode.id,
          title: episode.title,
          creator: episode.creator,
          description: episode.description,
        })
        .from(episode)
        .where(eq(episode.id, episodeId))
        .limit(1);

      if (result.length === 0) {
        throw new Error(`Episode ${episodeId} not found`);
      }

      return result[0];
    });

    // Step 2: Get high-confidence signals
    const highConfidenceSignals = await step.run(
      "fetch-high-confidence-signals",
      async () => {
        const signals = await db
          .select({
            id: dailySignal.id,
            relevanceScore: dailySignal.relevanceScore,
            excerpt: dailySignal.excerpt,
            speakerName: dailySignal.speakerName,
            chunkId: dailySignal.chunkId,
            chunkContent: transcriptChunk.content,
            chunkSpeaker: transcriptChunk.speaker,
            chunkStartTimeSec: transcriptChunk.startTimeSec,
          })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(
            and(
              eq(transcriptChunk.episodeId, episodeId),
              eq(dailySignal.userId, userId),
              gte(dailySignal.relevanceScore, MIN_CONFIDENCE_THRESHOLD),
            ),
          )
          .orderBy(desc(dailySignal.relevanceScore))
          .limit(MAX_QUOTES_TO_CONSIDER);

        return signals;
      },
    );

    if (highConfidenceSignals.length < MIN_QUOTES_REQUIRED) {
      throw new Error(
        `Not enough high-confidence signals. Found ${highConfidenceSignals.length}, need at least ${MIN_QUOTES_REQUIRED}`,
      );
    }

    // Step 3: Use LLM to generate clip metadata
    const clipData = await step.run("llm-clip-generation", async () => {
      const quotesContext = highConfidenceSignals
        .map(
          (s, i) =>
            `${i + 1}. [Time: ${Math.floor((s.chunkStartTimeSec ?? 0) / 60)}:${String(Math.floor((s.chunkStartTimeSec ?? 0) % 60)).padStart(2, "0")}] [${s.speakerName || s.chunkSpeaker || "Unknown"}]:
"${s.chunkContent.trim()}"`,
        )
        .join("\n\n");

      const prompt = `You are creating viral video clip cards for senior executives - think Frame Break meets Twitter/LinkedIn short-form video.

Episode: "${episodeData.title}"
${episodeData.creator ? `Guest: ${episodeData.creator}` : ""}
${episodeData.description ? `Context: ${episodeData.description.substring(0, 300)}` : ""}

High-Quality Moments (${highConfidenceSignals.length} available):
${quotesContext}

Your task:
Create ONE banger video clip (${MIN_CLIP_DURATION}-${MAX_CLIP_DURATION} seconds) that executives will share.

Requirements:
- HOOK: Punchy headline (10 words max, NO emojis) - make them stop scrolling
- THOUGHT: 2-3 sentences explaining WHY this matters (concrete, specific, Frame Break style)
- TIMESTAMPS: Select a ${MIN_CLIP_DURATION}-${MAX_CLIP_DURATION} second segment with the best moment
- The clip should tell a complete micro-story, not feel cut off

Selection criteria:
- Look for moments with frameworks, numbers, specific examples
- Avoid generic advice or transitional talk
- Find the "money quote" that makes people go "wow"
- Ensure timestamps capture complete thoughts

Generate the clip metadata:`;

      const response = await generateObject({
        model: openrouter("x-ai/grok-4-fast"),
        schema: metaSignalClipSchema,
        prompt,
        temperature: 0.7,
      });

      return response.object;
    });

    // Step 4: Create or update meta signal with clip metadata
    const metaSignalRecord = await step.run("save-meta-signal", async () => {
      // Check if meta signal already exists
      const existing = await db
        .select()
        .from(metaSignal)
        .where(
          and(
            eq(metaSignal.episodeId, episodeId),
            eq(metaSignal.userId, userId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        const updated = await db
          .update(metaSignal)
          .set({
            title: clipData.hook,
            summary: clipData.thought,
            timestampStart: clipData.timestampStart,
            timestampEnd: clipData.timestampEnd,
            mediaType: "clip",
            llmModel: "x-ai/grok-4-fast",
            llmPromptVersion: "v3-clip-generation",
            updatedAt: new Date(),
          })
          .where(eq(metaSignal.id, existing[0].id))
          .returning();

        return updated[0];
      }

      // Create new
      const id = nanoid();
      const created = await db
        .insert(metaSignal)
        .values({
          id,
          userId,
          episodeId,
          title: clipData.hook,
          summary: clipData.thought,
          timestampStart: clipData.timestampStart,
          timestampEnd: clipData.timestampEnd,
          mediaType: "clip",
          status: "draft",
          llmModel: "x-ai/grok-4-fast",
          llmPromptVersion: "v3-clip-generation",
        })
        .returning();

      return created[0];
    });

    // Step 5: Trigger clip generation
    await step.run("trigger-clip-generation", async () => {
      await inngest.send({
        name: "meta-signal/generate.clip",
        data: {
          metaSignalId: metaSignalRecord.id,
          episodeId,
          timestampStart: clipData.timestampStart,
          timestampEnd: clipData.timestampEnd,
        },
      });
    });

    return {
      metaSignalId: metaSignalRecord.id,
      hook: clipData.hook,
      thought: clipData.thought,
      timestampStart: clipData.timestampStart,
      timestampEnd: clipData.timestampEnd,
      clipDuration: clipData.timestampEnd - clipData.timestampStart,
    };
  },
);
