"use client";

import {
  Add01Icon,
  Alert01Icon,
  Delete01Icon,
  Loading03Icon,
  MoreHorizontalCircle01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { AddPodcastDialog } from "@/components/blocks/podcasts/add-podcast-dialog";
import { AddYouTubeChannelDialog } from "@/components/blocks/podcasts/add-youtube-channel-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useTRPC } from "@/server/trpc/client";

export default function Podcasts() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useQueryState("q", {
    defaultValue: "",
  });
  const [searchMode, setSearchMode] = useQueryState("mode", {
    defaultValue: "podcasts",
  });
  const [sortBy, setSortBy] = useQueryState("sort", { defaultValue: "date" });
  const [page, setPage] = useQueryState("page", {
    defaultValue: 1,
    parse: (value) => Number(value) || 1,
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data, isLoading, error } = useQuery(
    trpc.podcasts.list.queryOptions({
      page,
      limit: 20,
      query: debouncedSearchQuery.trim() || undefined,
      sortBy: sortBy as "date" | "title",
    }),
  );

  const {
    data: episodesData,
    isLoading: episodesLoading,
    error: episodesError,
  } = useQuery({
    ...trpc.episodes.searchGlobal.queryOptions({
      query: debouncedSearchQuery.trim(),
      limit: 50,
    }),
    enabled:
      searchMode === "episodes" && debouncedSearchQuery.trim().length > 0,
  });

  // Mutations
  const removePodcast = useMutation(trpc.podcasts.remove.mutationOptions());
  const parseFeed = useMutation(trpc.podcasts.parseFeed.mutationOptions());

  const handleRemovePodcast = async (podcastId: string) => {
    try {
      await removePodcast.mutateAsync({ podcastId });
      qc.invalidateQueries({ queryKey: trpc.podcasts.list.queryKey() });
      qc.invalidateQueries({ queryKey: trpc.podcasts.stats.queryKey() });
      toast.success("Podcast removed from library");
    } catch (error) {
      console.error("Failed to remove podcast:", error);
      toast.error("Failed to remove podcast");
    }
  };

  const _handleParseFeed = async (podcastId: string) => {
    try {
      const result = await parseFeed.mutateAsync({ podcastId });
      qc.invalidateQueries({ queryKey: trpc.podcasts.list.queryKey() });
      qc.invalidateQueries({ queryKey: trpc.podcasts.stats.queryKey() });
      toast.success(result.message || "Episodes parsed successfully");
    } catch (error) {
      console.error("Failed to parse feed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to parse feed",
      );
    }
  };

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold font-serif">
          Your Podcast List
        </h1>

        <div className="flex gap-2">
          <AddPodcastDialog>
            <Button className="flex-1 sm:flex-none">
              <HugeiconsIcon icon={Add01Icon} size={16} />
              Add Podcast
            </Button>
          </AddPodcastDialog>
          <AddYouTubeChannelDialog>
            <Button variant="outline" className="flex-1 sm:flex-none">
              <HugeiconsIcon icon={Add01Icon} size={16} />
              Add YouTube
            </Button>
          </AddYouTubeChannelDialog>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder={
              searchMode === "podcasts"
                ? "Search podcasts..."
                : "Search episodes..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-32"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Select value={searchMode} onValueChange={setSearchMode}>
              <SelectTrigger
                size="sm"
                className="w-28 border-0 bg-secondary hover:bg-secondary/80"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="podcasts">Podcasts</SelectItem>
                <SelectItem value="episodes">Episodes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Sort by Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Sort by Date</SelectItem>
            <SelectItem value="title">Sort by Title</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results List */}
      {searchMode === "episodes" && debouncedSearchQuery ? (
        // Episodes Search Results
        episodesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-4 rounded-lg border bg-background p-4"
              >
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : episodesError ? (
          <div className="text-center py-12">
            <div className="flex items-center justify-center mb-4">
              <HugeiconsIcon
                icon={Alert01Icon}
                size={32}
                className="text-destructive"
              />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Failed to search episodes
            </h3>
            <p className="text-base text-muted-foreground">
              {episodesError.message || "An error occurred while searching."}
            </p>
          </div>
        ) : episodesData && episodesData.length > 0 ? (
          <>
            <div className="space-y-3">
              {episodesData.map((episode) => (
                <Link
                  key={episode.id}
                  href={`/episode/${episode.id}`}
                  className="flex items-center gap-4 rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
                >
                  {/* Episode/Podcast Thumbnail */}
                  <div className="h-12 w-12 rounded-lg bg-muted flex-shrink-0">
                    {episode.thumbnailUrl || episode.podcastImageUrl ? (
                      <img
                        src={
                          episode.thumbnailUrl || episode.podcastImageUrl || ""
                        }
                        alt={episode.title}
                        className="h-full w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-full w-full rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
                    )}
                  </div>

                  {/* Episode Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base line-clamp-2">
                      {episode.itunesTitle || episode.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {episode.podcastTitle}
                      {(episode.publishedAt || episode.createdAt) && (
                        <>
                          {" • "}
                          {new Date(
                            episode.publishedAt || episode.createdAt,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </>
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            {episodesData.length >= 50 && (
              <div className="flex justify-center pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing first 50 results. Refine your search for more specific
                  results.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-base text-muted-foreground mb-4">
              No episodes found matching "{debouncedSearchQuery}"
            </div>
            <p className="text-base text-muted-foreground">
              Try searching with different keywords or guest names.
            </p>
          </div>
        )
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-lg border bg-background p-4"
            >
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="flex items-center justify-center mb-4">
            <HugeiconsIcon
              icon={Alert01Icon}
              size={32}
              className="text-destructive"
            />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Failed to load podcasts
          </h3>
          <p className="text-base text-muted-foreground mb-4">
            {error.message || "An error occurred while loading your podcasts."}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <div className="space-y-3">
          {data.data.map((podcast) => (
            <Link
              key={podcast.id}
              href={`/podcast/${podcast.id}`}
              className="flex items-center gap-4 rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
            >
              {/* Podcast Thumbnail */}
              <div className="h-12 w-12 rounded-lg bg-muted flex-shrink-0">
                {podcast.imageUrl ? (
                  <img
                    src={podcast.imageUrl}
                    alt={podcast.title}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-full w-full rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
                )}
              </div>

              {/* Podcast Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base line-clamp-2">
                  {podcast.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(podcast.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.preventDefault()}
                  >
                    <HugeiconsIcon
                      icon={MoreHorizontalCircle01Icon}
                      size={16}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      handleRemovePodcast(podcast.podcastId);
                    }}
                    disabled={removePodcast.isPending}
                    className="text-destructive"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={16} />
                    {removePodcast.isPending ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      "Remove"
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-base text-muted-foreground mb-4">
            {debouncedSearchQuery
              ? "No podcasts found."
              : "No podcasts in your library yet."}
          </div>
          {!debouncedSearchQuery && (
            <div className="space-y-4">
              <p className="text-base text-muted-foreground">
                Add podcasts to your library to get started.
              </p>
              <AddPodcastDialog>
                <Button variant="outline">
                  <HugeiconsIcon icon={Add01Icon} size={16} />
                  Add Your First Podcast
                </Button>
              </AddPodcastDialog>
            </div>
          )}
        </div>
      )}

      {searchMode === "podcasts" && data?.data && data.data.length > 0 && (
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-muted-foreground">
            Showing {(page - 1) * data.pagination.limit + 1} to{" "}
            {(page - 1) * data.pagination.limit + data.data.length} of{" "}
            {data.pagination.total} results
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="flex items-center px-3 text-sm">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={!data.pagination.hasMore}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
