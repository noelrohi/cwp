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
import { useTRPC } from "@/server/trpc/client";

type AddYouTubePlaylistDialogProps = {
  children: React.ReactNode;
  podcastId: string;
  currentPlaylistId?: string | null;
};

export function AddYouTubePlaylistDialog({
  children,
  podcastId,
  currentPlaylistId,
}: AddYouTubePlaylistDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateChannelId = useMutation({
    ...trpc.podcasts.updateYouTubeChannelId.mutationOptions(),
    onSuccess: () => {
      toast.success(
        currentPlaylistId
          ? "YouTube channel updated successfully"
          : "YouTube channel added successfully",
      );
      queryClient.invalidateQueries({
        queryKey: trpc.podcasts.get.queryKey({ podcastId }),
      });
      setIsOpen(false);
      setChannelUrl("");
      setValidationError(null);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : currentPlaylistId
            ? "Failed to update YouTube channel"
            : "Failed to add YouTube channel",
      );
      setValidationError(
        error instanceof Error
          ? error.message
          : "Failed to update YouTube channel",
      );
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!channelUrl.trim()) {
      setValidationError("Please enter a YouTube channel URL, ID, or handle");
      return;
    }

    // Clear any previous validation errors
    setValidationError(null);

    // The validation will happen on the server side
    updateChannelId.mutate({
      podcastId,
      youtubeChannelInput: channelUrl.trim(),
    });
  };

  const handleUrlChange = (value: string) => {
    setChannelUrl(value);
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
            {currentPlaylistId
              ? "Change YouTube Channel"
              : "Add YouTube Channel"}
          </DialogTitle>
          <DialogDescription>
            {currentPlaylistId
              ? "Update the YouTube channel for this podcast. This will change which videos are synced (limited to 100 most recent)."
              : "Enter the YouTube channel URL, ID, or handle to sync episodes from YouTube (limited to 100 most recent videos)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-url">YouTube Channel URL</Label>
            <Input
              id="channel-url"
              type="text"
              placeholder="https://youtube.com/@username or UCxxxxxx"
              value={channelUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={updateChannelId.isPending}
              className={validationError ? "border-destructive" : ""}
            />
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              You can paste the channel URL (youtube.com/@username,
              youtube.com/channel/UCxxxxx), handle (@username), or channel ID
              (UCxxxxx)
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                setChannelUrl("");
                setValidationError(null);
              }}
              disabled={updateChannelId.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!channelUrl.trim() || updateChannelId.isPending}
            >
              {updateChannelId.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
