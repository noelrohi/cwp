import { randomUUID } from "node:crypto";
import { count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { dailySignal, episode, podcast } from "@/server/db/schema";
import { inngest } from "../client";

/**
 * Episode Status Monitor
 * Monitors episode processing status and identifies bottlenecks
 * Trigger manually via "app/monitor.episode-status" event
 */
export const episodeStatusMonitor = inngest.createFunction(
  { id: "episode-status-monitor" },
  { event: "app/monitor.episode-status" },
  async ({ step, logger }) => {
    const now = new Date();
    const monitorId = randomUUID();

    logger.info(`Running episode status monitor (id=${monitorId})`);

    const statusReport = await step.run("analyze-episode-status", async () => {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get episode counts by status for different time periods
      const [dailyStats] = await db
        .select({
          pending: sql<number>`COUNT(CASE WHEN status = 'pending' THEN 1 END)`,
          processing: sql<number>`COUNT(CASE WHEN status = 'processing' THEN 1 END)`,
          processed: sql<number>`COUNT(CASE WHEN status = 'processed' THEN 1 END)`,
          failed: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
          total: count(),
        })
        .from(episode)
        .where(gte(episode.createdAt, oneDayAgo));

      const [weeklyStats] = await db
        .select({
          pending: sql<number>`COUNT(CASE WHEN status = 'pending' THEN 1 END)`,
          processing: sql<number>`COUNT(CASE WHEN status = 'processing' THEN 1 END)`,
          processed: sql<number>`COUNT(CASE WHEN status = 'processed' THEN 1 END)`,
          failed: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
          total: count(),
        })
        .from(episode)
        .where(gte(episode.createdAt, oneWeekAgo));

      // Calculate processing success rate
      const dailySuccessRate =
        dailyStats.total > 0
          ? (Number(dailyStats.processed) / Number(dailyStats.total)) * 100
          : 0;

      const weeklySuccessRate =
        weeklyStats.total > 0
          ? (Number(weeklyStats.processed) / Number(weeklyStats.total)) * 100
          : 0;

      return {
        daily: {
          ...dailyStats,
          successRate: dailySuccessRate,
        },
        weekly: {
          ...weeklyStats,
          successRate: weeklySuccessRate,
        },
      };
    });

    // Alert if success rate is below 80%
    if (statusReport.daily.successRate < 80) {
      logger.warn(
        `Episode status monitor ${monitorId}: Low daily success rate`,
        {
          dailySuccessRate: statusReport.daily.successRate,
          dailyStats: statusReport.daily,
        },
      );
    }

    logger.info(`Episode status monitor ${monitorId} completed`, {
      statusReport,
      timestamp: now.toISOString(),
    });

    return {
      monitorId,
      statusReport,
      timestamp: now.toISOString(),
    };
  },
);

/**
 * User Engagement Analyzer
 * Analyzes user interaction patterns and engagement metrics
 * Trigger manually via "app/monitor.user-engagement" event
 */
export const userEngagementAnalyzer = inngest.createFunction(
  { id: "user-engagement-analyzer" },
  { event: "app/monitor.user-engagement" },
  async ({ step, logger }) => {
    const now = new Date();
    const analysisId = randomUUID();

    logger.info(`Running user engagement analysis (id=${analysisId})`);

    const engagementReport = await step.run(
      "analyze-user-engagement",
      async () => {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Get active users (users with signals in the last week)
        const activeUsers = await db
          .select({
            userId: dailySignal.userId,
            signalCount: count(),
            savedCount: sql<number>`COUNT(CASE WHEN user_action = 'saved' THEN 1 END)`,
            skippedCount: sql<number>`COUNT(CASE WHEN user_action = 'skipped' THEN 1 END)`,
          })
          .from(dailySignal)
          .where(gte(dailySignal.signalDate, oneWeekAgo))
          .groupBy(dailySignal.userId);

        // Calculate engagement metrics
        const totalUsers = activeUsers.length;
        const engagedUsers = activeUsers.filter(
          (u) => Number(u.savedCount) > 0 || Number(u.skippedCount) > 0,
        ).length;
        const averageSignalsPerUser =
          totalUsers > 0
            ? activeUsers.reduce((sum, u) => sum + Number(u.signalCount), 0) /
              totalUsers
            : 0;

        const averageSaveRate =
          activeUsers.length > 0
            ? (activeUsers.reduce((sum, u) => {
                const total = Number(u.savedCount) + Number(u.skippedCount);
                return sum + (total > 0 ? Number(u.savedCount) / total : 0);
              }, 0) /
                activeUsers.length) *
              100
            : 0;

        // Identify most engaged users
        const topUsers = activeUsers
          .sort((a, b) => Number(b.savedCount) - Number(a.savedCount))
          .slice(0, 10);

        return {
          totalUsers,
          engagedUsers,
          engagementRate:
            totalUsers > 0 ? (engagedUsers / totalUsers) * 100 : 0,
          averageSignalsPerUser,
          averageSaveRate,
          topUsers: topUsers.map((u) => ({
            userId: u.userId,
            signals: Number(u.signalCount),
            saved: Number(u.savedCount),
            skipped: Number(u.skippedCount),
          })),
        };
      },
    );

    // Alert if engagement is low
    if (engagementReport.engagementRate < 50) {
      logger.warn(
        `User engagement analyzer ${analysisId}: Low engagement rate`,
        {
          engagementRate: engagementReport.engagementRate,
          totalUsers: engagementReport.totalUsers,
          engagedUsers: engagementReport.engagedUsers,
        },
      );
    }

    logger.info(`User engagement analysis ${analysisId} completed`, {
      engagementReport,
      timestamp: now.toISOString(),
    });

    return {
      analysisId,
      engagementReport,
      timestamp: now.toISOString(),
    };
  },
);

/**
 * Feed Health Checker
 * Validates feed URLs and checks for feed health issues
 * Trigger manually via "app/monitor.feed-health" event
 */
export const feedHealthChecker = inngest.createFunction(
  { id: "feed-health-checker" },
  { event: "app/monitor.feed-health" },
  async ({ step, logger }) => {
    const now = new Date();
    const checkId = randomUUID();

    logger.info(`Running feed health check (id=${checkId})`);

    const healthReport = await step.run("check-feed-health", async () => {
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Get feeds that haven't produced new episodes recently
      const staleFeeds = await db
        .select({
          podcastId: podcast.id,
          podcastTitle: podcast.title,
          feedUrl: podcast.feedUrl,
          lastEpisodeDate: sql<Date>`MAX(${episode.publishedAt})`,
          episodeCount: count(episode.id),
        })
        .from(podcast)
        .leftJoin(episode, eq(podcast.id, episode.podcastId))
        .where(sql`${podcast.feedUrl} IS NOT NULL AND ${podcast.feedUrl} != ''`)
        .groupBy(podcast.id, podcast.title, podcast.feedUrl)
        .having(
          sql`MAX(${episode.publishedAt}) < ${threeDaysAgo} OR MAX(${episode.publishedAt}) IS NULL`,
        );

      // Get feeds with high failure rates (if we track this)
      const problematicFeeds = staleFeeds.filter(
        (feed) => Number(feed.episodeCount) === 0,
      );

      return {
        totalFeeds:
          (
            await db
              .select({ count: count() })
              .from(podcast)
              .where(sql`${podcast.feedUrl} IS NOT NULL`)
          )[0]?.count || 0,
        staleFeeds: staleFeeds.length,
        problematicFeeds: problematicFeeds.length,
        staleFeedDetails: staleFeeds.slice(0, 20).map((feed) => ({
          podcastId: feed.podcastId,
          title: feed.podcastTitle,
          feedUrl: feed.feedUrl,
          lastEpisodeDate: feed.lastEpisodeDate,
          episodeCount: Number(feed.episodeCount),
        })),
      };
    });

    // Alert if too many feeds are stale
    const staleFeedPercentage =
      healthReport.totalFeeds > 0
        ? (healthReport.staleFeeds / Number(healthReport.totalFeeds)) * 100
        : 0;

    if (staleFeedPercentage > 20) {
      logger.warn(
        `Feed health checker ${checkId}: High percentage of stale feeds`,
        {
          staleFeedPercentage,
          staleFeeds: healthReport.staleFeeds,
          totalFeeds: healthReport.totalFeeds,
        },
      );
    }

    logger.info(`Feed health check ${checkId} completed`, {
      healthReport,
      timestamp: now.toISOString(),
    });

    return {
      checkId,
      healthReport,
      timestamp: now.toISOString(),
    };
  },
);
