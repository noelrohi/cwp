"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon, StarIcon, XIcon, YoutubeIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/server/trpc/client";

type SearchMode = "itunes" | "youtube";

type iTunesResult = {
  wrapperType: string;
  kind: string;
  collectionId: number;
  trackId: number;
  artistName: string;
  collectionName: string;
  trackName: string;
  collectionCensoredName: string;
  trackCensoredName: string;
  collectionViewUrl: string;
  feedUrl: string;
  trackViewUrl: string;
  artworkUrl30: string;
  artworkUrl60: string;
  artworkUrl100: string;
  artworkUrl600: string;
  collectionPrice: number;
  trackPrice: number;
  collectionHdPrice: number;
  releaseDate: string;
  collectionExplicitness: string;
  trackExplicitness: string;
  trackCount: number;
  country: string;
  currency: string;
  primaryGenreName: string;
  contentAdvisoryRating: string;
  genreIds: string[];
  genres: string[];
};

type YouTubePlaylistResult = {
  playlistId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelName: string;
  channelId: string | null;
  videoCount: number | null;
  playlistUrl: string;
};

export type AddPodcastResult = {
  success: boolean;
  podcast?: {
    id: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    feedUrl?: string | null;
  };
  message: string;
};

type AddPodcastDialogProps = {
  children: React.ReactNode;
};

export function AddPodcastDialog({ children }: AddPodcastDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("itunes");
  const [searchQuery, setSearchQuery] = useState("");
  const [itunesResults, setItunesResults] = useState<iTunesResult[]>([]);
  const [youtubeResults, setYoutubeResults] = useState<YouTubePlaylistResult[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [addingPodcastId, setAddingPodcastId] = useState<string | null>(null);
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState<string | null>(null);

  const { data: youtubeSearchResults, isFetching: isYoutubeSearching } =
    useQuery({
      ...trpc.podcasts.searchYouTubePlaylists.queryOptions({
        query: youtubeSearchQuery || "",
        maxResults: 20,
      }),
      enabled: !!youtubeSearchQuery && youtubeSearchQuery.trim().length > 0,
    });

  // Sync YouTube search results to state
  useEffect(() => {
    if (youtubeSearchResults) {
      setYoutubeResults(youtubeSearchResults);
    }
  }, [youtubeSearchResults]);

  const suggestedPodcasts = [
    { name: "Lenny's Podcast", query: "Lenny's Podcast" },
    { name: "Founders", query: "Founders Podcast" },
    { name: "All-In", query: "All-In Podcast" },
    { name: "Acquired", query: "Acquired Podcast" },
    { name: "My First Million", query: "My First Million" },
    { name: "The Tim Ferriss Show", query: "Tim Ferriss" },
  ];

  const parseFeed = useMutation({
    ...trpc.podcasts.parseFeed.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.episodes.getUnprocessed.queryKey(),
      });
    },
  });

  const addPodcast = useMutation({
    ...trpc.podcasts.add.mutationOptions(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.stats.queryKey(),
      });

      if (result?.success && result.podcast?.id) {
        parseFeed.mutate({ podcastId: result.podcast.id });
      }

      setIsOpen(false);
      setSearchQuery("");
      setItunesResults([]);
      setYoutubeResults([]);
      setAddingPodcastId(null);
    },
    onError: (error) => {
      console.error("Failed to add podcast:", error);
      setAddingPodcastId(null);
    },
  });

  const performSearch = (query: string, mode: SearchMode) => {
    if (!query.trim()) return;

    if (mode === "itunes") {
      startSearchTransition(async () => {
        try {
          const response = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(
              query,
            )}&media=podcast`,
          );
          const data = await response.json();
          setItunesResults(data.results || []);
          setYoutubeResults([]);
        } catch (error) {
          console.error("Failed to search podcasts:", error);
        }
      });
    } else {
      // Trigger YouTube search via useQuery
      setYoutubeSearchQuery(query);
      setItunesResults([]);
    }
  };

  const handleSearch = () => {
    performSearch(searchQuery, searchMode);
  };

  const handleItunesPodcastSelect = (podcast: iTunesResult) => {
    if (addPodcast.isPending) return;

    setAddingPodcastId(podcast.collectionId.toString());
    addPodcast.mutate({
      podcastId: podcast.collectionId.toString(),
      title: podcast.collectionName,
      description: podcast.primaryGenreName,
      imageUrl: podcast.artworkUrl600 || podcast.artworkUrl100,
      feedUrl: podcast.feedUrl,
    });
  };

  const handleYoutubePlaylistSelect = (playlist: YouTubePlaylistResult) => {
    if (addPodcast.isPending) return;

    setAddingPodcastId(playlist.playlistId);
    addPodcast.mutate({
      podcastId: playlist.playlistId,
      title: playlist.title,
      description: playlist.channelName,
      imageUrl: playlist.thumbnailUrl || undefined,
      feedUrl: playlist.playlistUrl,
      youtubePlaylistId: playlist.playlistId,
    });
  };

  const handleModeChange = (newMode: SearchMode) => {
    setSearchMode(newMode);
    setSearchQuery("");
    setItunesResults([]);
    setYoutubeResults([]);
  };

  const searchResults = searchMode === "itunes" ? itunesResults : youtubeResults;
  const hasResults = searchResults.length > 0;
  const isCurrentlySearching =
    searchMode === "itunes" ? isSearching : isYoutubeSearching;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Add New Podcast</DialogTitle>
        </DialogHeader>

        {/* Search Mode Toggle */}
        <div className="flex gap-2 flex-shrink-0">
          <Button
            type="button"
            variant={searchMode === "itunes" ? "default" : "outline"}
            size="sm"
            onClick={() => handleModeChange("itunes")}
            className="flex-1"
          >
            <SearchIcon className="h-4 w-4 mr-2" />
            iTunes
          </Button>
          <Button
            type="button"
            variant={searchMode === "youtube" ? "default" : "outline"}
            size="sm"
            onClick={() => handleModeChange("youtube")}
            className="flex-1"
          >
            <YoutubeIcon className="h-4 w-4 mr-2" />
            YouTube
          </Button>
        </div>

        {/* Search Input - Fixed */}
        <div className="flex-shrink-0">
          {!searchQuery && !hasResults && searchMode === "itunes" && (
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <StarIcon className="h-4 w-4" />
                <span className="font-medium">Popular Suggestions</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {suggestedPodcasts.map((podcast) => (
                  <Button
                    key={podcast.name}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery(podcast.query);
                      performSearch(podcast.query, "itunes");
                    }}
                    disabled={isCurrentlySearching}
                    className="text-xs h-8 justify-start"
                  >
                    {isCurrentlySearching && searchQuery === podcast.query ? (
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Searching...</span>
                      </div>
                    ) : (
                      podcast.name
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={
                searchMode === "itunes"
                  ? "Search for podcasts..."
                  : "Search for YouTube playlists..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              className="flex-1"
            />
            {hasResults && (
              <Button
                onClick={() => {
                  setSearchQuery("");
                  setItunesResults([]);
                  setYoutubeResults([]);
                }}
                variant="outline"
                size="icon"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={handleSearch}
              size="icon"
              disabled={!searchQuery.trim() || isCurrentlySearching}
            >
              {isCurrentlySearching ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Results - Scrollable */}
        {hasResults && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-2">
              {searchMode === "itunes" &&
                itunesResults.map((result) => (
                  <div
                    key={result.collectionId}
                    className="flex items-center gap-3 p-3 rounded-lg border"
                  >
                    <div className="h-12 w-12 rounded bg-muted flex-shrink-0">
                      {result.artworkUrl100 && (
                        <img
                          src={result.artworkUrl100}
                          alt={result.collectionName}
                          className="h-full w-full rounded object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">
                        {result.collectionName}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.artistName}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleItunesPodcastSelect(result)}
                      disabled={
                        addingPodcastId === result.collectionId.toString()
                      }
                      className="flex-shrink-0"
                    >
                      {addingPodcastId === result.collectionId.toString()
                        ? "Adding..."
                        : "Add"}
                    </Button>
                  </div>
                ))}

              {searchMode === "youtube" &&
                youtubeResults.map((result) => (
                  <div
                    key={result.playlistId}
                    className="flex items-center gap-3 p-3 rounded-lg border"
                  >
                    <div className="h-12 w-12 rounded bg-muted flex-shrink-0">
                      {result.thumbnailUrl && (
                        <img
                          src={result.thumbnailUrl}
                          alt={result.title}
                          className="h-full w-full rounded object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">
                        {result.title}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.channelName}
                        {result.videoCount && ` · ${result.videoCount} videos`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleYoutubePlaylistSelect(result)}
                      disabled={addingPodcastId === result.playlistId}
                      className="flex-shrink-0"
                    >
                      {addingPodcastId === result.playlistId
                        ? "Adding..."
                        : "Add"}
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
