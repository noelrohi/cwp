"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, XIcon } from "lucide-react";
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

type AddArticleFeedDialogProps = {
  children: React.ReactNode;
};

export function AddArticleFeedDialog({ children }: AddArticleFeedDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");

  const addFeed = useMutation(trpc.articles.addFeed.mutationOptions());

  const handleAddSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.articles.listFeeds.queryKey(),
    });
    setIsOpen(false);
    setFeedUrl("");
  };

  const handleAdd = () => {
    if (!feedUrl.trim()) return;
    addFeed.mutate(
      { feedUrl: feedUrl.trim() },
      {
        onSuccess: handleAddSuccess,
        onError: (error) => {
          console.error("Failed to add feed:", error);
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Article RSS Feed</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://example.com/feed.xml"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && feedUrl.trim()) {
                  handleAdd();
                }
              }}
              className="flex-1"
            />
            {feedUrl && (
              <Button
                onClick={() => setFeedUrl("")}
                variant="outline"
                size="icon"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            onClick={handleAdd}
            disabled={!feedUrl.trim() || addFeed.isPending}
            className="w-full"
          >
            {addFeed.isPending ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Feed"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
