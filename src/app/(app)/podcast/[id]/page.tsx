"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, ExternalLink, Rss } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/server/trpc/client";

export default function PodcastDetailPage(props: PageProps<"/podcast/[id]">) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const params = use(props.params);

  const podcast = useQuery(
    trpc.podcasts.get.queryOptions({
      podcastId: params.id,
    }),
  );

  const parseFeedMutation = useMutation({
    ...trpc.podcasts.parseFeed.mutationOptions(),
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.get.queryKey({ podcastId: params.id }),
      });
    },
  });

  if (podcast.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-6" />
          <div className="flex gap-6 mb-8">
            <div className="h-32 w-32 bg-muted rounded-lg" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (podcast.error) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Podcasts
        </Link>
        <div className="text-center py-12">
          <div className="text-destructive mb-4">Podcast not found</div>
          <p className="text-sm text-muted-foreground">
            The podcast you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const podcastData = podcast.data;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Back Navigation */}
      <Link
        href="/podcasts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Podcasts
      </Link>

      {/* Podcast Header */}
      <div className="flex gap-6 mb-8">
        <div className="h-32 w-32 rounded-lg bg-muted flex-shrink-0">
          {podcastData?.imageUrl ? (
            // biome-ignore lint/performance/noImgElement: **
            <img
              src={podcastData.imageUrl}
              alt={podcastData.title}
              className="h-full w-full rounded-lg object-cover"
            />
          ) : (
            <div className="h-full w-full rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-2">{podcastData?.title}</h1>
          {podcastData?.description && (
            <p className="text-muted-foreground mb-4 line-clamp-3">
              {podcastData.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Added{" "}
              {new Date(podcastData?.createdAt || "").toLocaleDateString(
                "en-US",
                {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                },
              )}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {podcastData?.episodes?.length || 0} episodes
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {podcastData?.feedUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={podcastData.feedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                RSS Feed
              </a>
            </Button>
          )}
          {podcastData?.feedUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                parseFeedMutation.mutate({
                  podcastId: params.id,
                })
              }
              disabled={parseFeedMutation.isPending}
            >
              <Rss className="h-4 w-4 mr-2" />
              {parseFeedMutation.isPending ? "Parsing..." : "Parse Feed"}
            </Button>
          )}
        </div>
      </div>

      {/* Feed Parsing Progress */}
      {parseFeedMutation.isPending && (
        <div className="mb-6 rounded-lg border bg-muted/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Parsing Feed</span>
          </div>
          <div className="mb-2 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary animate-pulse w-full" />
          </div>
          <p className="text-xs text-muted-foreground">
            Processing feed and episodes...
          </p>
        </div>
      )}

      {/* Episodes List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Episodes</h2>

        {podcastData?.episodes && podcastData.episodes.length > 0 ? (
          <div className="space-y-3">
            {podcastData.episodes.map((episode) => (
              <Link
                key={episode.id}
                href={`/episode/${episode.id}`}
                className="flex items-start gap-4 rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 hover:text-primary">
                    {episode.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {episode.publishedAt
                        ? new Date(episode.publishedAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        : new Date(episode.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                    </span>
                    {episode.durationSec && (
                      <span>{Math.floor(episode.durationSec / 60)} min</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-muted-foreground mb-2">No episodes found</div>
            <p className="text-sm text-muted-foreground">
              Episodes will appear here once they're ingested.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
