import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  savedChunk,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";
import { inngest } from "../client";

/**
 * Update user preferences when they save or skip a signal
 * This is the core of the continuous learning system
 */
export const updateUserPreferences = inngest.createFunction(
  { id: "update-user-preferences" },
  { event: "signal/actioned" },
  async ({ event, step }) => {
    const { signalId, action } = event.data; // action: "saved" | "skipped"

    // Step 1: Get the signal and its associated chunk
    const signalData = await step.run("fetch-signal-data", async () => {
      const signals = await db
        .select({
          id: dailySignal.id,
          userId: dailySignal.userId,
          chunkId: dailySignal.chunkId,
          relevanceScore: dailySignal.relevanceScore,
          embedding: transcriptChunk.embedding,
          content: transcriptChunk.content,
        })
        .from(dailySignal)
        .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
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

    // Step 3: If saved, create a saved chunk record
    if (action === "saved") {
      await step.run("create-saved-chunk", async () => {
        await db.insert(savedChunk).values({
          id: randomUUID(),
          chunkId: signalData.chunkId,
          userId: signalData.userId,
          tags: null,
          notes: null,
        });
      });
    }

    // Step 4: Update user preferences centroid (only for saves)
    if (action === "saved") {
      await step.run("update-user-centroid", async () => {
        await updateUserCentroid(
          signalData.userId,
          signalData.embedding as number[],
        );
      });
    } else if (action === "skipped") {
      // Just increment skip counter, don't affect centroid
      await step.run("update-skip-counter", async () => {
        const prefs = await ensureUserPreferencesRow(signalData.userId);
        await db
          .update(userPreferences)
          .set({
            totalSkipped: prefs.totalSkipped + 1,
            lastUpdated: new Date(),
          })
          .where(eq(userPreferences.userId, signalData.userId));
      });
    }

    return {
      message: "User preferences updated successfully",
      signalId,
      action,
      userId: signalData.userId,
    };
  },
);

/**
 * Update user centroid using incremental learning
 * Only positive feedback (saves) - skips are ignored per Karpathy's advice
 */
async function updateUserCentroid(
  userId: string,
  chunkEmbedding: number[],
): Promise<void> {
  const prefs = await ensureUserPreferencesRow(userId);
  const currentCentroid =
    (prefs.centroidEmbedding as number[]) || new Array(1536).fill(0);

  // Fixed learning rate of 0.1 as recommended by Karpathy
  const learningRate = 0.1;

  // Move centroid towards saved content (positive feedback only)
  const newCentroid = currentCentroid.map(
    (current, i) => current + learningRate * (chunkEmbedding[i] - current),
  );

  // Update counters
  await db
    .update(userPreferences)
    .set({
      centroidEmbedding: newCentroid,
      totalSaved: prefs.totalSaved + 1,
      lastUpdated: new Date(),
    })
    .where(eq(userPreferences.userId, userId));
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

  const emptyVector = new Array(1536).fill(0);
  await db.insert(userPreferences).values({
    id: randomUUID(),
    userId,
    centroidEmbedding: emptyVector,
    totalSaved: 0,
    totalSkipped: 0,
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

/**
 * Clean up old signals to keep the database lean
 * Runs monthly on the 1st at 4:00 AM
 */
export const monthlyCleanup = inngest.createFunction(
  {
    id: "monthly-signal-cleanup",
    concurrency: 1,
  },
  { cron: "0 4 1 * *" }, // 1st of every month at 4:00 AM
  async ({ step }) => {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    // Delete old signals that were never acted upon
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
