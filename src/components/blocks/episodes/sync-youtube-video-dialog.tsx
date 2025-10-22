"use client";

import { Clock01Icon, YoutubeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/server/trpc/client";

type SyncYouTubeVideoDialogProps = {
  children: React.ReactNode;
  episodeId: string;
};

export function SyncYouTubeVideoDialog({
  children,
  episodeId,
}: SyncYouTubeVideoDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const potentialMatches = useQuery({
    ...trpc.podcasts.getPotentialYouTubeMatches.queryOptions({ episodeId }),
    enabled: isOpen,
  });

  const matchEpisode = useMutation({
    ...trpc.podcasts.manuallyMatchEpisode.mutationOptions(),
    onSuccess: () => {
      toast.success("Episode matched with YouTube video");
      queryClient.invalidateQueries({
        queryKey: trpc.episodes.get.queryKey({ episodeId }),
      });
      setIsOpen(false);
      setSelectedVideoId(null);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to match episode with video",
      );
    },
  });

  const handleMatchVideo = (videoId: string, videoUrl: string) => {
    setSelectedVideoId(videoId);
    matchEpisode.mutate({
      episodeId,
      youtubeVideoId: videoId,
      youtubeVideoUrl: videoUrl,
    });
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.7) {
      return {
        variant: "default" as const,
        label: "High",
        color: "text-green-600 dark:text-green-400",
      };
    }
    if (confidence >= 0.4) {
      return {
        variant: "secondary" as const,
        label: "Medium",
        color: "text-yellow-600 dark:text-yellow-400",
      };
    }
    return {
      variant: "outline" as const,
      label: "Low",
      color: "text-red-600 dark:text-red-400",
    };
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={YoutubeIcon}
              size={20}
              className="text-red-600"
            />
            Sync Episode to YouTube Video
          </DialogTitle>
          <DialogDescription>
            Select the YouTube video that matches this episode. Results are from
            YouTube search, sorted by relevance.
          </DialogDescription>
        </DialogHeader>

        {potentialMatches.isPending ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-lg border animate-pulse"
              >
                <Skeleton className="h-20 w-36 rounded flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : potentialMatches.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {potentialMatches.error.message ||
              "Failed to load potential matches"}
          </div>
        ) : potentialMatches.data ? (
          <div className="space-y-3">
            {(potentialMatches.data.episodeTitle ||
              potentialMatches.data.searchQuery) && (
              <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <p className="font-medium text-foreground mb-1">
                  Search query:
                </p>
                <p className="line-clamp-2">
                  {potentialMatches.data.searchQuery ||
                    potentialMatches.data.episodeTitle}
                </p>
              </div>
            )}

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {potentialMatches.data.videos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No YouTube videos found for this episode
                  </div>
                ) : (
                  potentialMatches.data.videos.map((video) => {
                    const badge = getConfidenceBadge(video.confidence);
                    const isMatching =
                      matchEpisode.isPending &&
                      selectedVideoId === video.videoId;

                    return (
                      <div
                        key={video.videoId}
                        className={`flex gap-3 p-3 rounded-lg border transition-colors ${
                          video.isAlreadyMatched
                            ? "bg-muted/40 border-muted-foreground/20"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative h-20 w-36 flex-shrink-0 rounded overflow-hidden bg-muted">
                          {video.thumbnailUrl ? (
                            <Image
                              src={video.thumbnailUrl}
                              alt={video.title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <HugeiconsIcon
                                icon={YoutubeIcon}
                                size={32}
                                className="text-muted-foreground"
                              />
                            </div>
                          )}
                        </div>

                        {/* Video Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm line-clamp-2 mb-1">
                            {video.title}
                          </h4>
                          {video.channelName && (
                            <p className="text-xs text-muted-foreground mb-1">
                              {video.channelName}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                            {video.durationSec > 0 && (
                              <div className="flex items-center gap-1">
                                <HugeiconsIcon icon={Clock01Icon} size={12} />
                                {Math.floor(video.durationSec / 60)} min
                              </div>
                            )}
                            {video.publishedAt && (
                              <span>
                                {new Date(video.publishedAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={badge.variant} className="text-xs">
                              {badge.label}
                            </Badge>
                            <span
                              className={`text-xs font-mono ${badge.color}`}
                            >
                              {Math.round(video.confidence * 100)}%
                            </span>
                            {video.isAlreadyMatched && (
                              <Badge variant="outline" className="text-xs">
                                Already Matched
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Action */}
                        <div className="flex items-center">
                          {video.isAlreadyMatched ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              className="flex-shrink-0"
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleMatchVideo(video.videoId, video.videoUrl)
                              }
                              disabled={
                                matchEpisode.isPending || video.isAlreadyMatched
                              }
                              className="flex-shrink-0"
                            >
                              {isMatching ? "Matching..." : "Select"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
