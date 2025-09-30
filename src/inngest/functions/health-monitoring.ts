import { randomUUID } from "node:crypto";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { dailySignal, episode, podcast } from "@/server/db/schema";
import { inngest } from "../client";

/**
 * Health Check Function - Every 6 hours
 * Monitors for stuck episodes, failed signals, and system health
 */
export const healthCheck = inngest.createFunction(
  { id: "health-check" },
  { cron: "0 */6 * * *" }, // Every 6 hours
  async ({ step, logger }) => {
    const now = new Date();
    const healthCheckId = randomUUID();

    logger.info(`Running health check (id=${healthCheckId})`);

    // Check for episodes stuck in "pending" status for more than 24 hours
    const stuckEpisodes = await step.run("check-stuck-episodes", async () => {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      return await db
        .select({
          id: episode.id,
          title: episode.title,
          status: episode.status,
          createdAt: episode.createdAt,
          podcastTitle: podcast.title,
        })
        .from(episode)
        .innerJoin(podcast, eq(episode.podcastId, podcast.id))
        .where(
          and(eq(episode.status, "pending"), lt(episode.createdAt, oneDayAgo)),
        )
        .limit(100); // Limit to avoid overwhelming logs
    });

    // Check for users without recent signals
    const usersWithoutSignals = await step.run(
      "check-users-without-signals",
      async () => {
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        const activeUsers = await db
          .select({ userId: podcast.userId })
          .from(podcast)
          .groupBy(podcast.userId);

        const usersWithRecentSignals = await db
          .select({ userId: dailySignal.userId })
          .from(dailySignal)
          .where(gte(dailySignal.signalDate, threeDaysAgo))
          .groupBy(dailySignal.userId);

        const activeUserIds = new Set(activeUsers.map((u) => u.userId));
        const usersWithSignalsIds = new Set(
          usersWithRecentSignals.map((u) => u.userId),
        );

        const usersWithoutRecentSignals = [...activeUserIds].filter(
          (userId) => !usersWithSignalsIds.has(userId),
        );

        return usersWithoutRecentSignals.slice(0, 50); // Limit to avoid overwhelming logs
      },
    );

    // Check for failed episodes in the last 24 hours
    const recentFailures = await step.run("check-recent-failures", async () => {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [result] = await db
        .select({ count: count() })
        .from(episode)
        .where(
          and(eq(episode.status, "failed"), gte(episode.updatedAt, oneDayAgo)),
        );

      return Number(result?.count ?? 0);
    });

    // Log health check results
    if (stuckEpisodes.length > 0) {
      logger.warn(
        `Health check ${healthCheckId}: Found ${stuckEpisodes.length} episodes stuck in pending status`,
        {
          stuckEpisodes: stuckEpisodes.slice(0, 10).map((ep) => ({
            id: ep.id,
            title: ep.title,
            podcastTitle: ep.podcastTitle,
            daysSincCreated: Math.floor(
              (now.getTime() - new Date(ep.createdAt).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          })),
        },
      );
    }

    if (usersWithoutSignals.length > 0) {
      logger.warn(
        `Health check ${healthCheckId}: Found ${usersWithoutSignals.length} users without signals in last 3 days`,
        {
          usersWithoutSignals: usersWithoutSignals.slice(0, 10),
        },
      );
    }

    if (recentFailures > 0) {
      logger.warn(
        `Health check ${healthCheckId}: Found ${recentFailures} episode failures in last 24 hours`,
      );
    }

    // Auto-recovery: Reset episodes stuck for more than 3 days back to pending
    if (stuckEpisodes.length > 0) {
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const veryStuckEpisodes = stuckEpisodes.filter(
        (ep) => new Date(ep.createdAt).getTime() < threeDaysAgo.getTime(),
      );

      if (veryStuckEpisodes.length > 0) {
        await step.run("reset-very-stuck-episodes", async () => {
          const episodeIds = veryStuckEpisodes.map((ep) => ep.id);

          await db
            .update(episode)
            .set({
              status: "pending",
              updatedAt: now,
            })
            .where(sql`${episode.id} = ANY(${episodeIds})`);

          logger.info(
            `Health check ${healthCheckId}: Reset ${veryStuckEpisodes.length} very stuck episodes back to pending`,
          );

          return veryStuckEpisodes.length;
        });
      }
    }

    logger.info(`Health check ${healthCheckId} completed`, {
      stuckEpisodesCount: stuckEpisodes.length,
      usersWithoutSignalsCount: usersWithoutSignals.length,
      recentFailuresCount: recentFailures,
      timestamp: now.toISOString(),
    });

    return {
      healthCheckId,
      stuckEpisodesCount: stuckEpisodes.length,
      usersWithoutSignalsCount: usersWithoutSignals.length,
      recentFailuresCount: recentFailures,
      timestamp: now.toISOString(),
    };
  },
);
