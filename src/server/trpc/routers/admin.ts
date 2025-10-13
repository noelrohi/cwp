import { randomUUID } from "node:crypto";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { podcast } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

/**
 * Admin-only TRPC router for triggering Inngest functions
 * All procedures require user to have "admin" role
 */
export const adminRouter = createTRPCRouter({
  // Feed Processing
  refreshPodcastFeed: protectedProcedure
    .input(z.object({ podcastId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      await inngest.send({
        name: "app/feed-parser.podcast.refresh",
        data: {
          podcastId: input.podcastId,
        },
      });

      return { success: true, message: "Feed refresh triggered" };
    }),

  bulkRefreshFeeds: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      await inngest.send({
        name: "app/feed-parser.bulk.refresh",
        data: {
          userId: input?.userId,
        },
      });

      return { success: true, message: "Bulk feed refresh triggered" };
    }),

  // Episode Processing
  processUser: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      const lookbackStart = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();

      // If userId provided, process that user
      // If no userId provided, get all users and dispatch events
      if (input?.userId) {
        await inngest.send({
          name: "app/daily-intelligence.user.process",
          data: {
            pipelineRunId: randomUUID(),
            userId: input.userId,
            lookbackStart,
          },
        });
      } else {
        // Get all users with podcasts
        const users = await ctx.db
          .selectDistinct({ userId: podcast.userId })
          .from(podcast);

        // Dispatch events for all users
        await inngest.send(
          users.map((user) => ({
            name: "app/daily-intelligence.user.process" as const,
            data: {
              pipelineRunId: randomUUID(),
              userId: user.userId,
              lookbackStart,
            },
          })),
        );
      }

      return {
        success: true,
        message: input?.userId
          ? "User processing triggered"
          : "Bulk user processing triggered",
      };
    }),

  // Monitoring
  episodeStatusMonitor: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      await inngest.send({
        name: "app/monitor.episode-status",
        data: {},
      });

      return { success: true, message: "Episode status monitor triggered" };
    }),

  userEngagementAnalyzer: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      await inngest.send({
        name: "app/monitor.user-engagement",
        data: {},
      });

      return {
        success: true,
        message: "User engagement analyzer triggered",
      };
    }),

  feedHealthChecker: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      await inngest.send({
        name: "app/monitor.feed-health",
        data: {},
      });

      return { success: true, message: "Feed health checker triggered" };
    }),

  // Maintenance
  monthlyCleanup: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      await inngest.send({
        name: "app/cleanup.monthly",
        data: {},
      });

      return { success: true, message: "Monthly cleanup triggered" };
    }),
});
