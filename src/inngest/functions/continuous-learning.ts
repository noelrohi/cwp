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

    // Step 4: Update user preferences centroid
    await step.run("update-user-centroid", async () => {
      await updateUserCentroid(
        signalData.userId,
        signalData.embedding as number[],
        action,
      );
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
 * Weekly background optimization to recompute user centroids
 * Runs every Sunday at 3:00 AM
 */
export const weeklyPreferencesOptimization = inngest.createFunction(
  {
    id: "weekly-preferences-optimization",
    concurrency: 1,
  },
  { cron: "0 3 * * 0" }, // Sunday at 3:00 AM
  async ({ step }) => {
    // Get all active users
    const activeUsers = await step.run("fetch-active-users", async () => {
      return await db
        .select({ userId: userPreferences.userId })
        .from(userPreferences);
    });

    let optimizedUsers = 0;

    // Step 2: Recompute centroid for each user
    for (const user of activeUsers) {
      await step.run(`optimize-user-${user.userId}`, async () => {
        await recomputeUserCentroid(user.userId);
        optimizedUsers++;
      });
    }

    return {
      message: "Weekly preferences optimization completed",
      optimizedUsers,
      date: new Date().toISOString(),
    };
  },
);

/**
 * Update user centroid using incremental learning
 * Weighted average based on positive/negative feedback
 */
async function updateUserCentroid(
  userId: string,
  chunkEmbedding: number[],
  action: string,
): Promise<void> {
  const prefs = await ensureUserPreferencesRow(userId);
  const currentCentroid =
    (prefs.centroidEmbedding as number[]) || new Array(1536).fill(0);

  // Learning rate decreases as user provides more feedback
  const totalFeedback = prefs.totalSaved + prefs.totalSkipped;
  const learningRate = Math.max(0.01, 1.0 / (1.0 + totalFeedback * 0.1));

  // Compute new centroid
  let newCentroid: number[];

  if (action === "saved") {
    // Move centroid towards saved content (positive feedback)
    newCentroid = currentCentroid.map(
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
  } else if (action === "skipped") {
    // Move centroid away from skipped content (negative feedback)
    newCentroid = currentCentroid.map(
      (current, i) =>
        current - learningRate * 0.5 * (chunkEmbedding[i] - current),
    );

    // Update counters
    await db
      .update(userPreferences)
      .set({
        centroidEmbedding: newCentroid,
        totalSkipped: prefs.totalSkipped + 1,
        lastUpdated: new Date(),
      })
      .where(eq(userPreferences.userId, userId));
  }
}

/**
 * Recompute user centroid from scratch based on all historical feedback
 * Used for weekly optimization
 */
export async function recomputeUserCentroid(userId: string): Promise<void> {
  // Get all saved chunks for this user
  await ensureUserPreferencesRow(userId);

  const savedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  // Get all skipped signals for this user
  const skippedSignals = await db
    .select({
      embedding: transcriptChunk.embedding,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(dailySignal.userId, userId),
        eq(dailySignal.userAction, "skipped"),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  if (savedChunks.length === 0 && skippedSignals.length === 0) {
    // No feedback yet, keep default centroid
    return;
  }

  let newCentroid = new Array(1536).fill(0);

  // Compute positive centroid (from saved chunks)
  if (savedChunks.length > 0) {
    for (const chunk of savedChunks) {
      const embedding = chunk.embedding as number[];
      for (let i = 0; i < embedding.length; i++) {
        newCentroid[i] += embedding[i];
      }
    }

    // Average the positive feedback
    for (let i = 0; i < newCentroid.length; i++) {
      newCentroid[i] /= savedChunks.length;
    }
  }

  // Adjust centroid away from negative feedback (skipped content)
  if (skippedSignals.length > 0 && savedChunks.length > 0) {
    // Compute negative centroid
    const negativeCentroid = new Array(1536).fill(0);

    for (const signal of skippedSignals) {
      const embedding = signal.embedding as number[];
      for (let i = 0; i < embedding.length; i++) {
        negativeCentroid[i] += embedding[i];
      }
    }

    // Average the negative feedback
    for (let i = 0; i < negativeCentroid.length; i++) {
      negativeCentroid[i] /= skippedSignals.length;
    }

    // Move away from negative centroid
    const negativeWeight = 0.3; // How much to weight negative feedback
    for (let i = 0; i < newCentroid.length; i++) {
      newCentroid[i] = newCentroid[i] - negativeWeight * negativeCentroid[i];
    }
  }

  // Normalize the centroid vector
  const magnitude = Math.sqrt(
    newCentroid.reduce((sum, val) => sum + val * val, 0),
  );
  if (magnitude > 0) {
    newCentroid = newCentroid.map((val) => val / magnitude);
  }

  // Update user preferences
  await db
    .update(userPreferences)
    .set({
      centroidEmbedding: newCentroid,
      totalSaved: savedChunks.length,
      totalSkipped: skippedSignals.length,
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
