"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/server/trpc/client";

export default function PodcastDetailPage(props: PageProps<"/podcast/[id]">) {
  const trpc = useTRPC();
  const params = use(props.params);

  const podcast = useQuery(
    trpc.podcasts.get.queryOptions({
      podcastId: params.id,
    }),
  );

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
      </div>

      {/* Episodes List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Episodes</h2>

        {podcastData?.episodes && podcastData.episodes.length > 0 ? (
          <div className="space-y-3">
            {podcastData.episodes.map((episode) => (
              <div
                key={episode.id}
                className="flex items-start gap-4 rounded-lg border bg-background p-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1">{episode.title}</h3>
                  {episode.guest && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Guest: {episode.guest}
                    </p>
                  )}
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
              </div>
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
