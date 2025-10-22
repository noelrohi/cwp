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

type YouTubeChannelResult = {
  channelId: string;
  channelName: string;
  handle: string | null;
  description: string;
  thumbnailUrl: string | null;
  subscriberCount: string | null;
  videoCount: number | null;
  channelUrl: string;
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
  const [addingChannelId, setAddingChannelId] = useState<string | null>(null);

  const { data: searchResults, isFetching: isSearching } = useQuery({
    ...trpc.podcasts.searchYouTubeChannels.queryOptions({
      query: youtubeSearchQuery || "",
      maxResults: 20,
    }),
    enabled: !!youtubeSearchQuery && youtubeSearchQuery.trim().length > 0,
  });

  const [youtubeResults, setYoutubeResults] = useState<YouTubeChannelResult[]>(
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

      // Trigger sync for YouTube channel
      if (result?.success && result.podcast?.id) {
        syncYouTubeChannel.mutate({ podcastId: result.podcast.id });
      }

      setIsOpen(false);
      setSearchQuery("");
      setYoutubeResults([]);
      setAddingChannelId(null);
    },
    onError: (error) => {
      console.error("Failed to add YouTube channel:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add YouTube channel",
      );
      setAddingChannelId(null);
    },
  });

  const syncYouTubeChannel = useMutation({
    ...trpc.podcasts.syncYouTubeChannel.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message || "Episodes synced from YouTube channel");
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.list.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync channel",
      );
    },
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setYoutubeSearchQuery(searchQuery.trim());
    }
  };

  const handleChannelSelect = (channel: YouTubeChannelResult) => {
    if (addPodcast.isPending) return;

    setAddingChannelId(channel.channelId);
    addPodcast.mutate({
      podcastId: channel.channelId,
      title: channel.channelName,
      description: channel.description || channel.channelName,
      imageUrl: channel.thumbnailUrl || undefined,
      feedUrl: channel.channelUrl,
      youtubePlaylistId: channel.channelId,
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery("");
    setYoutubeResults([]);
    setYoutubeSearchQuery(null);
    setAddingChannelId(null);
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
            Search for a YouTube channel to add to your library
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="flex-shrink-0">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Search for YouTube channels..."
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
                  key={result.channelId}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                >
                  <div className="h-12 w-12 rounded-full bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {result.thumbnailUrl ? (
                      <img
                        src={result.thumbnailUrl}
                        alt={result.channelName}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // Hide image on error and show fallback
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <YoutubeIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {result.channelName}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {result.handle && `${result.handle}`}
                      {result.subscriberCount && (
                        <>
                          {result.handle && " · "}
                          {result.subscriberCount}
                        </>
                      )}
                      {result.videoCount && (
                        <>
                          {(result.handle || result.subscriberCount) && " · "}
                          {result.videoCount.toLocaleString()} videos
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleChannelSelect(result)}
                    disabled={addingChannelId === result.channelId}
                    className="flex-shrink-0"
                  >
                    {addingChannelId === result.channelId ? "Adding..." : "Add"}
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
                No channels found. Try a different search.
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
