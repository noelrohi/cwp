"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { YoutubeIcon } from "lucide-react";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { extractPlaylistId } from "@/server/lib/youtube-playlist";
import { useTRPC } from "@/server/trpc/client";

type AddYouTubePlaylistDialogProps = {
  children: React.ReactNode;
  podcastId: string;
};

export function AddYouTubePlaylistDialog({
  children,
  podcastId,
}: AddYouTubePlaylistDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const updatePlaylistId = useMutation({
    ...trpc.podcasts.updateYouTubePlaylistId.mutationOptions(),
    onSuccess: () => {
      toast.success("YouTube playlist added successfully");
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.get.queryKey({ podcastId }),
      });
      setIsOpen(false);
      setPlaylistUrl("");
      setValidationError(null);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add YouTube playlist",
      );
    },
  });

  const validateAndExtractPlaylistId = (input: string): string | null => {
    if (!input.trim()) {
      return null;
    }

    try {
      const playlistId = extractPlaylistId(input);

      // Validate playlist ID format (should start with PL and be reasonable length)
      if (
        !playlistId ||
        !playlistId.startsWith("PL") ||
        playlistId.length < 10
      ) {
        setValidationError("Invalid YouTube playlist URL or ID");
        return null;
      }

      setValidationError(null);
      return playlistId;
    } catch (_error) {
      setValidationError("Invalid YouTube playlist URL or ID");
      return null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const playlistId = validateAndExtractPlaylistId(playlistUrl);
    if (!playlistId) {
      return;
    }

    updatePlaylistId.mutate({
      podcastId,
      youtubePlaylistId: playlistId,
    });
  };

  const handleUrlChange = (value: string) => {
    setPlaylistUrl(value);
    if (validationError) {
      setValidationError(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <YoutubeIcon className="h-5 w-5 text-red-600" />
            Add YouTube Playlist
          </DialogTitle>
          <DialogDescription>
            Enter the YouTube playlist URL or ID to sync episodes from YouTube.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="playlist-url">YouTube Playlist URL</Label>
            <Input
              id="playlist-url"
              type="text"
              placeholder="https://youtube.com/playlist?list=PLxxxxx or PLxxxxx"
              value={playlistUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={updatePlaylistId.isPending}
              className={validationError ? "border-destructive" : ""}
            />
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              You can paste the full YouTube playlist URL or just the playlist
              ID (starts with PL)
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                setPlaylistUrl("");
                setValidationError(null);
              }}
              disabled={updatePlaylistId.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!playlistUrl.trim() || updatePlaylistId.isPending}
            >
              {updatePlaylistId.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
