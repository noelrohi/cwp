import { randomUUID } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  podcast,
  savedChunk,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";
import { inngest } from "../client";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Update user preferences when they save or skip a signal
 * Now uses simple behavioral tracking instead of embedding centroids
 */
export const updateUserPreferences = inngest.createFunction(
  { id: "update-user-preferences" },
  { event: "signal/actioned" },
  async ({ event, step }) => {
    const { signalId, action } = event.data; // action: "saved" | "skipped"

    // Step 1: Get the signal and its associated chunk with podcast info
    const signalData = await step.run("fetch-signal-data", async () => {
      const signals = await db
        .select({
          id: dailySignal.id,
          userId: dailySignal.userId,
          chunkId: dailySignal.chunkId,
          relevanceScore: dailySignal.relevanceScore,
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          podcastId: episode.podcastId,
          podcastTitle: podcast.title,
          episodeTitle: episode.title,
          contentLength: sql<number>`LENGTH(${transcriptChunk.content})`,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
        .innerJoin(episode, eq(transcriptChunk.episodeId, episode.id))
        .innerJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(eq(dailySignal.id, signalId))
        .limit(1);

      if (signals.length === 0) {
        throw new Error(`Signal ${signalId} not found`);
      }

      return signals[0];
    });

    // Step 2: Update the signal record with the user action
    await step.run("update-signal-record", async () => {
      await db
        .update(dailySignal)
        .set({
          userAction: action,
          actionedAt: new Date(),
        })
        .where(eq(dailySignal.id, signalId));
    });

    // Step 3: If saved, create a saved chunk record and extract highlight
    if (action === "saved") {
      const savedChunkId = await step.run("create-saved-chunk", async () => {
        const chunkId = randomUUID();
        await db.insert(savedChunk).values({
          id: chunkId,
          chunkId: signalData.chunkId,
          userId: signalData.userId,
          tags: null,
          notes: null,
        });
        return chunkId;
      });

      await step.run("extract-highlight", async () => {
        try {
          const highlightQuote = await extractImpactfulQuote({
            content: signalData.content,
            speaker: signalData.speaker,
            podcastTitle: signalData.podcastTitle,
            episodeTitle: signalData.episodeTitle,
          });

          if (highlightQuote) {
            await db
              .update(savedChunk)
              .set({
                highlightExtractedQuote: highlightQuote,
                highlightExtractedAt: new Date(),
              })
              .where(eq(savedChunk.id, savedChunkId));
          }
        } catch (error) {
          console.error("Failed to extract highlight:", error);
        }
      });
    }

    // Step 4: Update behavioral preferences based on action
    await step.run("update-behavioral-preferences", async () => {
      await updateUserBehavioralPreferences(signalData.userId, action, {
        podcastId: signalData.podcastId || "",
        speaker: signalData.speaker,
        contentLength: signalData.contentLength,
        podcastTitle: signalData.podcastTitle,
      });
    });

    return {
      message: "User preferences updated successfully",
      signalId,
      action,
      userId: signalData.userId,
    };
  },
);

/**
 * Update user behavioral preferences based on save/skip actions
 * Much simpler than centroid approach - just tracks what users engage with
 */
async function updateUserBehavioralPreferences(
  userId: string,
  action: "saved" | "skipped",
  signalData: {
    podcastId: string;
    speaker: string | null;
    contentLength: number;
    podcastTitle: string | null;
  },
): Promise<void> {
  const prefs = await ensureUserPreferencesRow(userId);

  if (action === "saved") {
    // Update preferred podcasts
    const currentPodcasts = JSON.parse(
      prefs.preferredPodcasts || "[]",
    ) as string[];
    if (!currentPodcasts.includes(signalData.podcastId)) {
      currentPodcasts.push(signalData.podcastId);
      // Keep only top 10 preferred podcasts
      if (currentPodcasts.length > 10) {
        currentPodcasts.shift();
      }
    }

    // Update preferred speakers
    const currentSpeakers = JSON.parse(
      prefs.preferredSpeakers || "[]",
    ) as string[];
    if (signalData.speaker && !currentSpeakers.includes(signalData.speaker)) {
      currentSpeakers.push(signalData.speaker);
      // Keep only top 10 preferred speakers
      if (currentSpeakers.length > 10) {
        currentSpeakers.shift();
      }
    }

    // Update preferred content length
    let preferredLength: "short" | "medium" | "long" = "medium";
    if (signalData.contentLength < 300) preferredLength = "short";
    else if (signalData.contentLength > 1000) preferredLength = "long";

    // Update engagement score (simple average of save rate)
    const totalActions = prefs.totalSaved + prefs.totalSkipped + 1;
    const newSaveCount = prefs.totalSaved + 1;
    const newEngagementScore = newSaveCount / totalActions;

    await db
      .update(userPreferences)
      .set({
        preferredPodcasts: JSON.stringify(currentPodcasts),
        preferredSpeakers: JSON.stringify(currentSpeakers),
        preferredContentLength: preferredLength,
        averageEngagementScore: newEngagementScore,
        totalSaved: prefs.totalSaved + 1,
        lastUpdated: new Date(),
      })
      .where(eq(userPreferences.userId, userId));
  } else if (action === "skipped") {
    // Just update counters and engagement score
    const totalActions = prefs.totalSaved + prefs.totalSkipped + 1;
    const newEngagementScore = prefs.totalSaved / totalActions;

    await db
      .update(userPreferences)
      .set({
        totalSkipped: prefs.totalSkipped + 1,
        averageEngagementScore: newEngagementScore,
        lastUpdated: new Date(),
      })
      .where(eq(userPreferences.userId, userId));
  }
}

async function ensureUserPreferencesRow(userId: string) {
  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Initialize with simple defaults - no embeddings needed
  await db.insert(userPreferences).values({
    id: randomUUID(),
    userId,
    totalSaved: 0,
    totalSkipped: 0,
    preferredPodcasts: "[]",
    preferredSpeakers: "[]",
    preferredContentLength: "medium",
    averageEngagementScore: 0.5,
    lastUpdated: new Date(),
    createdAt: new Date(),
  });

  const [created] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (!created) {
    throw new Error(`Unable to initialize user preferences for ${userId}`);
  }

  return created;
}

async function extractImpactfulQuote(context: {
  content: string;
  speaker: string | null;
  podcastTitle: string;
  episodeTitle: string;
}): Promise<string | null> {
  const prompt = `You are an expert at extracting impactful, quotable insights from podcast transcripts.

Context:
- Podcast: ${context.podcastTitle}
- Episode: ${context.episodeTitle}
${context.speaker ? `- Speaker: ${context.speaker}` : ""}

Transcript chunk:
"""
${context.content}
"""

Extract a 1-2 sentence quote that is:
- Highly impactful and memorable
- Perfect for sharing in a newsletter or social media
- Captures a key insight, surprising fact, or actionable advice
- Stands alone without needing additional context
- Avoids filler words or rambling

If the chunk contains no quotable insight, respond with "NO_QUOTE".

Return ONLY the extracted quote, nothing else.`;

  const result = await generateText({
    model: openrouter("anthropic/claude-3.5-sonnet"),
    prompt,
  });

  const quote = result.text.trim();

  if (quote === "NO_QUOTE" || quote.length < 20) {
    return null;
  }

  return quote;
}

/**
 * Clean up old signals to keep the database lean
 * Runs monthly on the 1st at 4:00 AM
 */
export const monthlyCleanup = inngest.createFunction(
  {
    id: "monthly-signal-cleanup",
    concurrency: 1,
  },
  { cron: "0 4 1 * *" },
  async ({ step }) => {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const deletedSignals = await step.run("cleanup-old-signals", async () => {
      const result = await db
        .delete(dailySignal)
        .where(
          and(
            sql`${dailySignal.signalDate} < ${cutoffDate}`,
            sql`${dailySignal.userAction} IS NULL`,
          ),
        );

      return result.rowCount || 0;
    });

    return {
      message: "Monthly cleanup completed",
      deletedSignals,
      cutoffDate: cutoffDate.toISOString(),
    };
  },
);
