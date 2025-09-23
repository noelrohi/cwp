"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
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

type AddPodcastDialogProps = {
  children: React.ReactNode;
  onPodcastAdded?: () => void;
};

export function AddPodcastDialog({
  children,
  onPodcastAdded,
}: AddPodcastDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<iTunesResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingPodcastId, setAddingPodcastId] = useState<number | null>(null);

  const addPodcast = useMutation(trpc.podcasts.add.mutationOptions());

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          searchQuery,
        )}&media=podcast`,
      );
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Failed to search podcasts:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePodcastSelect = async (podcast: iTunesResult) => {
    setAddingPodcastId(podcast.collectionId);
    try {
      await addPodcast.mutateAsync({
        podcastId: podcast.collectionId.toString(),
        title: podcast.collectionName,
        description: podcast.primaryGenreName,
        imageUrl: podcast.artworkUrl600 || podcast.artworkUrl100,
        feedUrl: podcast.feedUrl,
      });

      // Invalidate queries to refresh the podcast list
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.list.queryKey(),
      });

      onPodcastAdded?.();
      setIsOpen(false);
      setSearchQuery("");
      setSearchResults([]);
      setAddingPodcastId(null);
    } catch (error) {
      console.error("Failed to add podcast:", error);
      setAddingPodcastId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Add New Podcast</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-hidden">
          <div className="flex gap-2 flex-shrink-0">
            <Input
              type="text"
              placeholder="Search for podcasts..."
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
              <SearchIcon className="h-4 w-4" />
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {searchResults.map((result) => (
                <div
                  key={result.collectionId}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                >
                  <div className="h-10 w-10 rounded bg-muted flex-shrink-0">
                    {result.artworkUrl100 && (
                      // biome-ignore lint/performance/noImgElement: **
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
                    onClick={() => handlePodcastSelect(result)}
                    disabled={addingPodcastId === result.collectionId}
                    className="flex-shrink-0"
                  >
                    {addingPodcastId === result.collectionId
                      ? "Adding..."
                      : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
