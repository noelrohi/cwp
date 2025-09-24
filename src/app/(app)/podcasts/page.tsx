"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Loader2,
  MoreHorizontal,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { AddPodcastDialog } from "@/components/blocks/podcasts/add-podcast-dialog";
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
  const [sortBy, setSortBy] = useQueryState("sort", { defaultValue: "date" });

  // Debounce search query to avoid too many API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Get podcasts (saved or filtered by search query)
  const { data, isLoading, error } = useQuery(
    trpc.podcasts.list.queryOptions({
      limit: 50,
      query: debouncedSearchQuery.trim() || undefined,
      sortBy: sortBy as "date" | "title",
    }),
  );

  // Mutations
  const removePodcast = useMutation(trpc.podcasts.remove.mutationOptions());
  const handleRemovePodcast = async (podcastId: string) => {
    try {
      await removePodcast.mutateAsync({ podcastId });
      qc.invalidateQueries({ queryKey: trpc.podcasts.list.queryKey() });
      qc.invalidateQueries({ queryKey: trpc.podcasts.stats.queryKey() });
    } catch (error) {
      console.error("Failed to remove podcast:", error);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold font-serif">Your Podcast List</h1>

        <AddPodcastDialog>
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Podcast
          </Button>
        </AddPodcastDialog>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Sort by Date</SelectItem>
            <SelectItem value="title">Sort by Title</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Podcasts List */}
      <div className="space-y-3">
        {isLoading ? (
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
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              Failed to load podcasts
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {error.message ||
                "An error occurred while loading your podcasts."}
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : data?.data && data.data.length > 0 ? (
          data.data.map((podcast) => (
            <Link
              key={podcast.id}
              href={`/podcast/${podcast.id}`}
              className="flex items-center gap-4 rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
            >
              {/* Podcast Thumbnail */}
              <div className="h-12 w-12 rounded-lg bg-muted flex-shrink-0">
                {podcast.imageUrl ? (
                  // biome-ignore lint/performance/noImgElement: **
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
                <h3 className="font-medium text-sm truncate">
                  {podcast.title}
                </h3>
                <p className="text-xs text-muted-foreground">
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
                    <MoreHorizontal className="h-4 w-4" />
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
                    <TrashIcon className="h-4 w-4 mr-2" />
                    {removePodcast.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Remove"
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Link>
          ))
        ) : (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              {debouncedSearchQuery
                ? "No podcasts found."
                : "No podcasts in your library yet."}
            </div>
            {!debouncedSearchQuery && (
              <p className="text-sm text-muted-foreground">
                Add podcasts to your library to get started.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data?.data && data.data.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing 1 to {Math.min(5, data.data.length)} of {data.data.length}{" "}
            results
          </p>
          <div className="flex gap-1">
            <Button variant="default" size="sm" className="h-8 w-8 p-0">
              1
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              2
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
