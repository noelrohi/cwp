"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { type RouterOutput, useTRPC } from "@/server/trpc/client";

function getDateGroup(date: string | null): string {
  if (!date) return "Unknown";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const episodeDate = new Date(date);

  if (episodeDate.toDateString() === today.toDateString()) {
    return "Today";
  } else if (episodeDate.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return episodeDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }
}

function EpisodeCard({
  episode,
}: {
  episode: RouterOutput["episodes"]["getUnprocessed"][number];
}) {
  return (
    <div className="flex gap-4 mb-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      {/* Podcast Image */}
      <div className="relative h-16 w-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
        {episode.podcast?.imageUrl ? (
          <Image
            src={episode.podcast.imageUrl}
            alt={episode.podcast.title}
            fill
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-xs text-muted-foreground">No Image</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold leading-tight line-clamp-2 mb-1">
          {episode.title}
        </h3>
        <p className="text-muted-foreground text-sm">
          {episode.podcast?.title}
        </p>
      </div>

      <div className="flex items-center">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/episode/${episode.id}`}>
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const trpc = useTRPC();
  const { data: unprocessedEpisodes, isLoading } = useQuery(
    trpc.episodes.getUnprocessed.queryOptions({ limit: 50 }),
  );

  const groupedEpisodes = useMemo(() => {
    if (!unprocessedEpisodes) return {};

    return unprocessedEpisodes.reduce(
      (groups, episode) => {
        const dateGroup = getDateGroup(episode.publishedAt);
        if (!groups[dateGroup]) {
          groups[dateGroup] = [];
        }
        groups[dateGroup].push(episode);
        return groups;
      },
      {} as Record<string, typeof unprocessedEpisodes>,
    );
  }, [unprocessedEpisodes]);

  const totalEpisodes = unprocessedEpisodes?.length || 0;

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-3">
                <div className="h-16 w-16 bg-muted rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8">
        Hi! What are we breaking down today?
      </h1>

      {totalEpisodes > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedEpisodes)
            .sort(([a], [b]) => {
              // Sort by priority: Today, Yesterday, then chronologically
              const order = { Today: 0, Yesterday: 1 };
              const aOrder = order[a as keyof typeof order] ?? 2;
              const bOrder = order[b as keyof typeof order] ?? 2;

              if (aOrder !== bOrder) return aOrder - bOrder;
              if (aOrder === 2 && bOrder === 2) {
                // For other dates, sort by the actual date (most recent first)
                const aDate = new Date(a);
                const bDate = new Date(b);
                return bDate.getTime() - aDate.getTime();
              }
              return 0;
            })
            .map(([dateGroup, episodes]) => (
              <div key={dateGroup}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">{dateGroup}</h3>
                  <Button variant="ghost" className="text-xs underline" asChild>
                    <Link
                      href={`/episode/process?${episodes.map((ep) => `episodes=${ep.id}`).join("&")}`}
                    >
                      Process {episodes.length} episodes
                    </Link>
                  </Button>
                </div>
                <div className="space-y-0">
                  {episodes.map((episode) => (
                    <EpisodeCard key={episode.id} episode={episode} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-4">
            No unprocessed episodes found
          </div>
          <p className="text-sm text-muted-foreground">
            All episodes have been processed!
          </p>
        </div>
      )}
    </main>
  );
}
