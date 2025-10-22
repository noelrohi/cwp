"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon, YoutubeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/server/trpc/client";

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

type AddYouTubeChannelDialogProps = {
  children: React.ReactNode;
};

export function AddYouTubeChannelDialog({
  children,
}: AddYouTubeChannelDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState<string | null>(
    null,
  );
  const [addingPlaylistId, setAddingPlaylistId] = useState<string | null>(null);

  const { data: searchResults, isFetching: isSearching } = useQuery({
    ...trpc.podcasts.searchYouTubePlaylists.queryOptions({
      query: youtubeSearchQuery || "",
      maxResults: 20,
    }),
    enabled: !!youtubeSearchQuery && youtubeSearchQuery.trim().length > 0,
  });

  const [youtubeResults, setYoutubeResults] = useState<YouTubePlaylistResult[]>(
    [],
  );

  // Sync search results to state
  useEffect(() => {
    if (searchResults) {
      setYoutubeResults(searchResults);
    }
  }, [searchResults]);

  const addPodcast = useMutation({
    ...trpc.podcasts.add.mutationOptions(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.stats.queryKey(),
      });

      toast.success(result?.message || "YouTube channel added to your library");

      // Trigger sync for YouTube playlist
      if (result?.success && result.podcast?.id) {
        syncYouTubePlaylist.mutate({ podcastId: result.podcast.id });
      }

      setIsOpen(false);
      setSearchQuery("");
      setYoutubeResults([]);
      setAddingPlaylistId(null);
    },
    onError: (error) => {
      console.error("Failed to add YouTube channel:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add YouTube channel",
      );
      setAddingPlaylistId(null);
    },
  });

  const syncYouTubePlaylist = useMutation({
    ...trpc.podcasts.syncYouTubePlaylist.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message || "Episodes synced from YouTube");
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.list.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync playlist",
      );
    },
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setYoutubeSearchQuery(searchQuery.trim());
    }
  };

  const handlePlaylistSelect = (playlist: YouTubePlaylistResult) => {
    if (addPodcast.isPending) return;

    setAddingPlaylistId(playlist.playlistId);
    addPodcast.mutate({
      podcastId: playlist.playlistId,
      title: playlist.title,
      description: playlist.channelName,
      imageUrl: playlist.thumbnailUrl || undefined,
      feedUrl: playlist.playlistUrl,
      youtubePlaylistId: playlist.playlistId,
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery("");
    setYoutubeResults([]);
    setYoutubeSearchQuery(null);
    setAddingPlaylistId(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <YoutubeIcon className="h-5 w-5 text-red-600" />
            Add YouTube Channel
          </DialogTitle>
          <DialogDescription>
            Search for a YouTube playlist or channel to add to your library
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="flex-shrink-0">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Search for YouTube playlists or channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              className="flex-1"
            />
            <Button
              onClick={handleSearch}
              size="icon"
              disabled={!searchQuery.trim() || isSearching}
            >
              {isSearching ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {youtubeResults.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-2">
              {youtubeResults.map((result) => (
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
                    onClick={() => handlePlaylistSelect(result)}
                    disabled={addingPlaylistId === result.playlistId}
                    className="flex-shrink-0"
                  >
                    {addingPlaylistId === result.playlistId
                      ? "Adding..."
                      : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!youtubeResults.length && youtubeSearchQuery && !isSearching && (
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                No playlists found. Try a different search.
              </p>
            </div>
          </div>
        )}

        <div className="flex-shrink-0 flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
