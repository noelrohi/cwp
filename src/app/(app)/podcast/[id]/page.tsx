"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Clock01Icon,
  Link01Icon,
  RssIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { use } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTRPC } from "@/server/trpc/client";

const signals = ["all", "with-signals", "without-signals"] as const;
const EPISODE_PAGE_SIZE = 20;

export default function PodcastDetailPage(props: PageProps<"/podcast/[id]">) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const params = use(props.params);
  const [filterBySignals, setFilterBySignals] = useQueryState(
    "filter",
    parseAsStringLiteral(signals).withDefault("all"),
  );

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
      queryClient.invalidateQueries(
        trpc.podcasts.episodesInfinite.infiniteQueryFilter({
          podcastId: params.id,
        }),
      );
    },
  });

  const episodesQuery = useInfiniteQuery({
    ...trpc.podcasts.episodesInfinite.infiniteQueryOptions({
      podcastId: params.id,
      filterBySignals,
      limit: EPISODE_PAGE_SIZE,
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  if (podcast.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
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
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to Podcasts
        </Link>
        <div className="text-center py-8 sm:py-12">
          <div className="text-destructive mb-4">Podcast not found</div>
          <p className="text-sm text-muted-foreground">
            The podcast you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const podcastData = podcast.data;
  const episodes =
    episodesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const isEpisodesLoading = episodesQuery.isPending && episodes.length === 0;
  const episodeListEmpty = !isEpisodesLoading && episodes.length === 0;
  const totalEpisodes = podcastData?.episodeCount ?? 0;
  const episodesError =
    episodesQuery.error instanceof Error ? episodesQuery.error.message : null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Back Navigation */}
      <Link
        href="/podcasts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        Back to Podcasts
      </Link>

      {/* Podcast Header */}
      <div className="space-y-4">
        <div className="flex gap-4">
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

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold mb-2">
                {podcastData?.title}
              </h1>
              {podcastData?.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {podcastData.description}
                </p>
              )}
            </div>

            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Calendar03Icon} size={14} />
                <dt className="sr-only">Added</dt>
                <dd>
                  Added{" "}
                  {new Date(podcastData?.createdAt || "").toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} size={14} />
                <dt className="sr-only">Episodes</dt>
                <dd>{totalEpisodes} episodes</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-x-visible">
          {podcastData?.feedUrl && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() =>
                parseFeedMutation.mutate({
                  podcastId: params.id,
                })
              }
              disabled={parseFeedMutation.isPending}
            >
              <HugeiconsIcon icon={RssIcon} size={16} />
              {parseFeedMutation.isPending ? "Parsing..." : "Parse Feed"}
            </Button>
          )}
          {podcastData?.feedUrl && (
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <a
                href={podcastData.feedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <HugeiconsIcon icon={Link01Icon} size={16} />
                RSS Feed
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Feed Parsing Progress */}
      {parseFeedMutation.isPending && (
        <div className="rounded-lg border bg-muted/50 p-4">
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base sm:text-lg font-semibold">Episodes</h2>
          <Select
            value={filterBySignals}
            onValueChange={(v: (typeof signals)[number]) =>
              setFilterBySignals(v)
            }
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue placeholder="Filter episodes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Episodes</SelectItem>
              <SelectItem value="with-signals">With Signals</SelectItem>
              <SelectItem value="without-signals">Without Signals</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {episodesQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load episodes.
            {episodesError ? ` ${episodesError}` : " Please try again."}
          </div>
        ) : isEpisodesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 w-full animate-pulse rounded-lg border bg-muted/70"
              />
            ))}
          </div>
        ) : !episodeListEmpty ? (
          <>
            <div className="space-y-2">
              {episodes.map((episode) => (
                <Link
                  key={episode.id}
                  href={`/episode/${episode.id}`}
                  className="block rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
                >
                  <h3 className="font-medium text-base mb-1.5 hover:text-primary">
                    {episode.title}
                  </h3>

                  <div className="flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Calendar03Icon} size={14} />
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
                    </div>
                    {episode.durationSec && (
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Clock01Icon} size={14} />
                        <span>{Math.floor(episode.durationSec / 60)} min</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {episodesQuery.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => episodesQuery.fetchNextPage()}
                  disabled={episodesQuery.isFetchingNextPage}
                >
                  {episodesQuery.isFetchingNextPage
                    ? "Loading..."
                    : "Load more"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-base text-muted-foreground mb-2">
              No episodes found
            </div>
            <p className="text-base text-muted-foreground">
              Episodes will appear here once they're ingested.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
