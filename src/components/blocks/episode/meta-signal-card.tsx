"use client";

import { FavouriteIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
  ItemMedia,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import type { RouterOutput } from "@/server/trpc/client";
import { useTRPC } from "@/server/trpc/client";

interface MetaSignalCardProps {
  signal: NonNullable<RouterOutput["metaSignals"]["get"]>;
  episodeId?: string;
  articleId?: string;
}

export function MetaSignalCard({ signal }: MetaSignalCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const likeMutation = useMutation(
    trpc.metaSignals.like.mutationOptions({
      onMutate: async () => {
        // Optimistic update
        await queryClient.cancelQueries({
          queryKey: trpc.metaSignals.get.queryKey(),
        });
      },
      onSuccess: (_data) => {
        // Invalidate to refetch with updated like count
        queryClient.invalidateQueries({
          queryKey: trpc.metaSignals.get.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.metaSignals.isLiked.queryKey({
            metaSignalId: signal.id,
          }),
        });
      },
      onError: (error) => {
        toast.error(`Failed to update like: ${error.message}`);
      },
    }),
  );

  const handleLike = () => {
    likeMutation.mutate({ metaSignalId: signal.id });
  };

  const formatTimestamp = (seconds: number | null | undefined) => {
    if (seconds == null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const renderMedia = () => {
    switch (signal.mediaType) {
      case "clip":
        // Render YouTube embed with timestamp
        if (!signal.clipUrl) {
          return (
            <div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground">
              Clip is being generated...
            </div>
          );
        }
        return (
          <div className="space-y-2">
            <div className="rounded-lg overflow-hidden border aspect-video">
              <iframe
                src={signal.clipUrl}
                title={signal.title || "Video clip"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            {(signal.timestampStart != null || signal.timestampEnd != null) && (
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>{formatTimestamp(signal.timestampStart)}</span>
                <span>-</span>
                <span>{formatTimestamp(signal.timestampEnd)}</span>
              </div>
            )}
          </div>
        );

      case "image":
        if (!signal.mediaUrls || signal.mediaUrls.length === 0) return null;
        return (
          <div className="rounded-lg overflow-hidden border">
            <img
              src={signal.mediaUrls[0]}
              alt={signal.mediaMetadata?.altTexts?.[0] || ""}
              className="w-full h-auto object-cover"
            />
          </div>
        );

      case "carousel":
        if (!signal.mediaUrls || signal.mediaUrls.length === 0) return null;
        return (
          <div className="flex gap-2 overflow-x-auto">
            {signal.mediaUrls.map((url, index) => (
              <div
                key={index}
                className="flex-shrink-0 rounded-lg overflow-hidden border w-64 h-48"
              >
                <img
                  src={url}
                  alt={signal.mediaMetadata?.altTexts?.[index] || ""}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        );

      case "video":
        if (!signal.mediaUrls || signal.mediaUrls.length === 0) return null;
        return (
          <div className="rounded-lg overflow-hidden border">
            {/* biome-ignore lint/a11y/useMediaCaption: Captions to be added in future iteration */}
            <video
              src={signal.mediaUrls[0]}
              controls
              className="w-full h-auto"
              poster={signal.mediaMetadata?.thumbnails?.[0]}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const userInitials = signal.user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Item className="space-y-4" variant="muted">
      {/* Header with User Info and Dropdown Menu */}
      <ItemHeader>
        <div className="flex items-center gap-3">
          <ItemMedia variant="image">
            <Avatar className="size-10">
              <AvatarImage src={signal.user.image || undefined} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{signal.user.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(signal.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>Share</DropdownMenuItem>
            <DropdownMenuItem disabled>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemHeader>

      {/* Title and Summary */}
      <ItemContent>
        {signal.title && (
          <h3 className="text-xl font-bold leading-tight tracking-tight">
            {signal.title}
          </h3>
        )}

        {signal.summary && (
          <p className="text-base leading-relaxed text-foreground">
            {signal.summary}
          </p>
        )}
      </ItemContent>

      {/* Media Content */}
      {renderMedia()}

      {/* Footer with Like Button */}
      <ItemFooter className="pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLike}
          disabled={likeMutation.isPending}
          className="gap-2"
        >
          <HugeiconsIcon
            icon={FavouriteIcon}
            size={16}
            className={cn(
              "transition-all",
              signal.isLiked && "fill-red-500 text-red-500",
            )}
          />
          <span className="text-sm">{signal.likeCount}</span>
        </Button>
      </ItemFooter>
    </Item>
  );
}
