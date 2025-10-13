"use client";

import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTRPC } from "@/server/trpc/client";

export function FavoriteButton({
  episodeId,
  articleId,
}: {
  episodeId?: string;
  articleId?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: isFavorited, isLoading } = useQuery(
    trpc.favorites.isFavorited.queryOptions({
      episodeId,
      articleId,
    }),
  );

  const toggleFavorite = useMutation(
    trpc.favorites.toggle.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          queryKey: trpc.favorites.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.favorites.isFavorited.queryKey({
            episodeId,
            articleId,
          }),
        });
        toast.success(
          data.favorited ? "Added to favorites" : "Removed from favorites",
        );
      },
      onError: (error) => {
        toast.error(`Failed to update favorite: ${error.message}`);
      },
    }),
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isFavorited ? "default" : "outline"}
          size="icon-sm"
          onClick={() =>
            toggleFavorite.mutate({
              episodeId,
              articleId,
            })
          }
          disabled={isLoading || toggleFavorite.isPending}
        >
          <HugeiconsIcon
            icon={FavouriteIcon}
            size={16}
            className={isFavorited ? "fill-current" : ""}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isFavorited ? "Remove from favorites" : "Add to favorites"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
