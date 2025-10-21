"use client";

import {
  Add01Icon,
  AiMicIcon,
  File02Icon,
  PodcastIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconArrowRight } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { toast } from "sonner";
import { AddPodcastDialog } from "@/components/blocks/podcasts/add-podcast-dialog";
import { SignalBadge } from "@/components/signal-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
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
  episode: RouterOutput["episodes"]["getEpisodes"][number];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const hideEpisode = useMutation(
    trpc.episodes.hideEpisode.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.getEpisodes.queryKey(),
        });
        toast.success("Episode hidden");
      },
      onError: (error) => {
        toast.error(`Failed to hide episode: ${error.message}`);
      },
    }),
  );

  // Show hide button for truly unprocessed episodes (matching SignalBadge logic)
  const isUnprocessed =
    (episode.status === "pending" &&
      !episode.summary?.markdownContent &&
      episode.signalCounts.total === 0) ||
    episode.status === "failed";

  return (
    <div className="flex gap-3 sm:gap-4 mb-3 sm:mb-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      {/* Podcast Image */}
      <Link
        href={`/episode/${episode.id}`}
        className="flex gap-3 sm:gap-4 flex-1 min-w-0"
      >
        <div className="relative h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
          {episode.podcast?.imageUrl ? (
            <Image
              src={episode.podcast.imageUrl}
              alt={episode.podcast.title}
              fill
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <HugeiconsIcon
                icon={PodcastIcon}
                size={24}
                className="text-muted-foreground"
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm sm:text-base font-semibold leading-tight line-clamp-2 flex-1">
              {episode.title}
            </h3>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {episode.podcast?.title}
          </p>
        </div>
      </Link>

      <div className="flex flex-col gap-2 items-end justify-between">
        <SignalBadge
          signalCounts={episode.signalCounts}
          status={episode.status}
          hasSummary={!!episode.summary?.markdownContent}
        />
        {isUnprocessed && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => hideEpisode.mutate({ episodeId: episode.id })}
            disabled={hideEpisode.isPending}
          >
            Hide
          </Button>
        )}
      </div>
    </div>
  );
}

function ArticleCard({
  article,
}: {
  article: RouterOutput["articles"]["list"][number];
}) {
  return (
    <Link
      href={`/post/${article.id}?tab=article`}
      className="flex gap-3 sm:gap-4 mb-3 sm:mb-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
    >
      <div className="flex gap-3 sm:gap-4 flex-1 min-w-0">
        <div className="relative h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
          <HugeiconsIcon
            icon={File02Icon}
            size={24}
            className="text-muted-foreground"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm sm:text-base font-semibold leading-tight line-clamp-2 flex-1">
              {article.title}
            </h3>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm line-clamp-1">
            {article.feed?.title ||
              article.siteName ||
              article.author ||
              "Article"}
          </p>
        </div>
      </div>

      <div className="flex items-center">
        <Button variant="ghost" size="sm" className="gap-1">
          Read
          <IconArrowRight size={16} />
        </Button>
      </div>
    </Link>
  );
}

type ContentItem = {
  id: string;
  title: string;
  publishedAt: Date | string | null;
  status: "pending" | "processing" | "processed" | "failed" | "retrying";
  type: "episode" | "article";
  episode?: RouterOutput["episodes"]["getEpisodes"][number];
  article?: RouterOutput["articles"]["list"][number];
};

export default function Dashboard() {
  const trpc = useTRPC();
  const [sourceFilter] = useQueryState("source");

  const { data: episodes, isLoading: episodesLoading } = useQuery(
    trpc.episodes.getEpisodes.queryOptions({ limit: 50 }),
  );
  const { data: articles, isLoading: articlesLoading } = useQuery(
    trpc.articles.list.queryOptions(
      sourceFilter &&
        (sourceFilter === "rss" ||
          sourceFilter === "email" ||
          sourceFilter === "readwise")
        ? { source: sourceFilter }
        : undefined,
    ),
  );

  const allContent = useMemo(() => {
    const episodeItems: ContentItem[] = sourceFilter
      ? []
      : episodes?.map((ep) => ({
          id: ep.id,
          title: ep.title,
          publishedAt: ep.publishedAt,
          status: ep.status,
          type: "episode" as const,
          episode: ep,
        })) || [];

    const articleItems: ContentItem[] =
      articles?.map((art) => ({
        id: art.id,
        title: art.title,
        publishedAt: art.publishedAt || art.createdAt,
        status: art.status,
        type: "article" as const,
        article: art,
      })) || [];

    return [...episodeItems, ...articleItems];
  }, [episodes, articles, sourceFilter]);

  const groupedContent = useMemo(() => {
    if (allContent.length === 0) return {};

    return allContent.reduce(
      (groups, item) => {
        const dateGroup = getDateGroup(
          item.publishedAt ? item.publishedAt.toString() : null,
        );
        if (!groups[dateGroup]) {
          groups[dateGroup] = [];
        }
        groups[dateGroup].push(item);
        return groups;
      },
      {} as Record<string, ContentItem[]>,
    );
  }, [allContent]);

  const totalContent = allContent.length;

  const isLoading = episodesLoading || articlesLoading;

  if (isLoading) {
    return (
      <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-muted rounded mb-6" />
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
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl sm:text-2xl font-bold">
        Hi! What are we breaking down today?
      </h1>

      {totalContent > 0 ? (
        <div className="space-y-6 sm:space-y-8">
          {Object.entries(groupedContent)
            .sort(([a, aItems], [b, bItems]) => {
              // Sort by priority: Today, Yesterday, then chronologically
              const order = { Today: 0, Yesterday: 1 };
              const aOrder = order[a as keyof typeof order] ?? 2;
              const bOrder = order[b as keyof typeof order] ?? 2;

              if (aOrder !== bOrder) return aOrder - bOrder;
              if (aOrder === 2 && bOrder === 2) {
                // For other dates, use the actual date from the first item in each group
                const aDate = aItems[0]?.publishedAt
                  ? new Date(aItems[0].publishedAt)
                  : new Date(0);
                const bDate = bItems[0]?.publishedAt
                  ? new Date(bItems[0].publishedAt)
                  : new Date(0);
                return bDate.getTime() - aDate.getTime();
              }
              return 0;
            })
            .map(([dateGroup, items]) => (
              <div key={dateGroup}>
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                  {dateGroup}
                </h3>
                <div className="space-y-0">
                  {items
                    .sort((a, b) => {
                      const aDate = a.publishedAt
                        ? new Date(a.publishedAt).getTime()
                        : 0;
                      const bDate = b.publishedAt
                        ? new Date(b.publishedAt).getTime()
                        : 0;
                      return bDate - aDate;
                    })
                    .map((item) => {
                      if (item.type === "episode" && item.episode) {
                        return (
                          <EpisodeCard key={item.id} episode={item.episode} />
                        );
                      }
                      if (item.type === "article" && item.article) {
                        return (
                          <ArticleCard key={item.id} article={item.article} />
                        );
                      }
                      return null;
                    })}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Card className="w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HugeiconsIcon
              icon={AiMicIcon}
              size={64}
              className="text-muted-foreground mb-6"
            />
            <CardTitle className="mb-2">No Content Yet</CardTitle>
            <CardDescription className="text-center mb-6 max-w-md">
              Get started by adding your first podcast or article feed. We'll
              automatically fetch and process the latest content for you to
              explore.
            </CardDescription>
            <AddPodcastDialog>
              <Button size="lg" className="gap-2">
                <HugeiconsIcon icon={Add01Icon} size={16} />
                Add Your First Podcast
              </Button>
            </AddPodcastDialog>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
