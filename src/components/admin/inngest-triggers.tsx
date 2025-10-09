"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/server/trpc/client";

export function InngestTriggers() {
  const trpc = useTRPC();
  const [podcastId, setPodcastId] = useState("");
  const [userId, setUserId] = useState("");

  // Feed Processing
  const refreshFeed = useMutation(
    trpc.admin.refreshPodcastFeed.mutationOptions(),
  );
  const bulkRefreshFeeds = useMutation(
    trpc.admin.bulkRefreshFeeds.mutationOptions(),
  );

  // Episode Processing
  const processUser = useMutation(trpc.admin.processUser.mutationOptions());

  // Monitoring
  const episodeStatusMonitor = useMutation(
    trpc.admin.episodeStatusMonitor.mutationOptions(),
  );
  const userEngagementAnalyzer = useMutation(
    trpc.admin.userEngagementAnalyzer.mutationOptions(),
  );
  const feedHealthChecker = useMutation(
    trpc.admin.feedHealthChecker.mutationOptions(),
  );

  // Maintenance
  const monthlyCleanup = useMutation(
    trpc.admin.monthlyCleanup.mutationOptions(),
  );

  return (
    <div className="space-y-6">
      {/* Feed Processing Section */}
      <Card>
        <CardHeader>
          <CardTitle>Feed Processing</CardTitle>
          <CardDescription>
            Refresh podcast RSS feeds to discover new episodes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="podcastId">Podcast ID (optional)</Label>
              <Input
                id="podcastId"
                placeholder="Leave empty for bulk refresh"
                value={podcastId}
                onChange={(e) => setPodcastId(e.target.value)}
              />
            </div>
            <Button
              onClick={() => {
                if (podcastId) {
                  refreshFeed.mutate({ podcastId });
                } else {
                  bulkRefreshFeeds.mutate({});
                }
              }}
              disabled={refreshFeed.isPending || bulkRefreshFeeds.isPending}
            >
              {refreshFeed.isPending || bulkRefreshFeeds.isPending
                ? "Refreshing..."
                : podcastId
                  ? "Refresh Feed"
                  : "Bulk Refresh All Feeds"}
            </Button>
          </div>

          {(refreshFeed.isSuccess || bulkRefreshFeeds.isSuccess) && (
            <div className="text-sm text-green-600 dark:text-green-400">
              ✓ Feed refresh triggered successfully
            </div>
          )}

          {(refreshFeed.error || bulkRefreshFeeds.error) && (
            <div className="text-sm text-red-600 dark:text-red-400">
              ✗ Error:{" "}
              {refreshFeed.error?.message || bulkRefreshFeeds.error?.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Episode Processing Section */}
      <Card>
        <CardHeader>
          <CardTitle>Episode Processing</CardTitle>
          <CardDescription>
            Process episodes and generate signals for users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="userId">User ID (optional)</Label>
              <Input
                id="userId"
                placeholder="Leave empty to process all users"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
            <Button
              onClick={() => {
                processUser.mutate({ userId: userId || undefined });
              }}
              disabled={processUser.isPending}
            >
              {processUser.isPending ? "Processing..." : "Process Episodes"}
            </Button>
          </div>

          {processUser.isSuccess && (
            <div className="text-sm text-green-600 dark:text-green-400">
              ✓ Episode processing triggered successfully
            </div>
          )}

          {processUser.error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              ✗ Error: {processUser.error.message}
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>This will:</p>
            <ul className="list-disc list-inside pl-2">
              <li>Find all pending episodes from the last 24-72 hours</li>
              <li>Fetch transcripts and chunk them</li>
              <li>Identify speakers using AI</li>
              <li>Generate embeddings</li>
              <li>Create personalized signals</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Monitoring Section */}
      <Card>
        <CardHeader>
          <CardTitle>System Monitoring</CardTitle>
          <CardDescription>Run analytics and health checks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Episode Status</h4>
              <Button
                onClick={() => episodeStatusMonitor.mutate({})}
                disabled={episodeStatusMonitor.isPending}
                variant="outline"
                className="w-full"
              >
                {episodeStatusMonitor.isPending ? "Running..." : "Check Status"}
              </Button>
              {episodeStatusMonitor.isSuccess && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  ✓ Complete
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">User Engagement</h4>
              <Button
                onClick={() => userEngagementAnalyzer.mutate({})}
                disabled={userEngagementAnalyzer.isPending}
                variant="outline"
                className="w-full"
              >
                {userEngagementAnalyzer.isPending ? "Running..." : "Analyze"}
              </Button>
              {userEngagementAnalyzer.isSuccess && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  ✓ Complete
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Feed Health</h4>
              <Button
                onClick={() => feedHealthChecker.mutate({})}
                disabled={feedHealthChecker.isPending}
                variant="outline"
                className="w-full"
              >
                {feedHealthChecker.isPending ? "Running..." : "Check Health"}
              </Button>
              {feedHealthChecker.isSuccess && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  ✓ Complete
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Section */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
          <CardDescription>
            Database cleanup and maintenance tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Monthly Cleanup</h4>
              <p className="text-sm text-muted-foreground">
                Delete signals older than 90 days that were never actioned
              </p>
            </div>
            <Button
              onClick={() => monthlyCleanup.mutate({})}
              disabled={monthlyCleanup.isPending}
              variant="destructive"
            >
              {monthlyCleanup.isPending ? "Cleaning..." : "Run Cleanup"}
            </Button>
          </div>

          {monthlyCleanup.isSuccess && (
            <div className="text-sm text-green-600 dark:text-green-400">
              ✓ Cleanup completed successfully
            </div>
          )}

          {monthlyCleanup.error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              ✗ Error: {monthlyCleanup.error.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
