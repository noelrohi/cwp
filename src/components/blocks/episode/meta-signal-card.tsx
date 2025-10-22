"use client";

import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Item, ItemFooter } from "@/components/ui/item";
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

  const renderMedia = () => {
    if (!signal.mediaUrls || signal.mediaUrls.length === 0) {
      return null;
    }

    switch (signal.mediaType) {
      case "image":
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

  return (
    <Item className="space-y-4" variant="outline">
      {/* Title and Summary */}
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

      {/* Media Content */}
      {renderMedia()}

      {/* Quotes */}
      {signal.quotes && signal.quotes.length > 0 && (
        <div className="space-y-4">
          <div className="h-px bg-border" />
          {signal.quotes.map((quote) => (
            <div key={quote.id} className="space-y-2">
              <blockquote className="text-sm leading-relaxed text-foreground/90 italic">
                "{quote.extractedQuote || quote.chunkContent}"
              </blockquote>
              <p className="text-xs text-muted-foreground">
                — {quote.signalSpeakerName || "Unknown"}
                {quote.chunkStartTimeSec !== null && (
                  <>
                    {" "}
                    • {Math.floor(quote.chunkStartTimeSec / 60)}:
                    {String(quote.chunkStartTimeSec % 60).padStart(2, "0")}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer with Like Button */}
      <ItemFooter className="pt-4 border-t flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {new Date(signal.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </ItemFooter>
    </Item>
  );
}
