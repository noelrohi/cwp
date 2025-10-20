"use client";

import { DatabaseSync01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/server/trpc/client";

type ReadwiseSyncDialogProps = {
  children: ReactNode;
};

export function ReadwiseSyncDialog({ children }: ReadwiseSyncDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [syncOptions, setSyncOptions] = useState<{
    location: "new" | "later" | "archive" | "feed";
    category?:
      | "article"
      | "email"
      | "rss"
      | "highlight"
      | "note"
      | "pdf"
      | "epub"
      | "tweet"
      | "video";
    tags: string;
    resetSync: boolean;
  }>({
    location: "new",
    tags: "",
    resetSync: false,
  });

  const syncMutation = useMutation(
    trpc.integrations.syncReadwise.mutationOptions({
      onSuccess: (data) => {
        const message = data.skippedDuplicates
          ? `Created ${data.articlesCreated} article${data.articlesCreated !== 1 ? "s" : ""}, skipped ${data.skippedDuplicates} duplicate${data.skippedDuplicates !== 1 ? "s" : ""}`
          : `Created ${data.articlesCreated} article${data.articlesCreated !== 1 ? "s" : ""}!`;

        toast.success(message);
        queryClient.invalidateQueries({
          queryKey: trpc.integrations.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.articles.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.readwise.listArticles.queryKey(),
        });
        setOpen(false);
        setSyncOptions({
          location: "new",
          category: undefined,
          tags: "",
          resetSync: false,
        });
      },
      onError: (error) => {
        toast.error(`Sync failed: ${error.message}`);
      },
    }),
  );

  const handleSync = () => {
    const tags = syncOptions.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 5);

    syncMutation.mutate({
      ...syncOptions,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync Readwise Documents</DialogTitle>
          <DialogDescription>
            Choose which documents to sync from your Readwise library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Document Location</Label>
            <Select
              value={syncOptions.location}
              onValueChange={(value) =>
                setSyncOptions((prev) => ({
                  ...prev,
                  location: value as "new" | "later" | "archive" | "feed",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Inbox (New) - Recommended</SelectItem>
                <SelectItem value="later">Later</SelectItem>
                <SelectItem value="archive">Archive</SelectItem>
                <SelectItem value="feed">Feed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Document Category</Label>
            <Select
              value={syncOptions.category || "all"}
              onValueChange={(value) =>
                setSyncOptions((prev) => ({
                  ...prev,
                  category:
                    value === "all"
                      ? undefined
                      : (value as
                          | "article"
                          | "email"
                          | "rss"
                          | "highlight"
                          | "note"
                          | "pdf"
                          | "epub"
                          | "tweet"
                          | "video"),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="article">Article</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="rss">RSS</SelectItem>
                <SelectItem value="highlight">Highlight</SelectItem>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="epub">EPUB</SelectItem>
                <SelectItem value="tweet">Tweet</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated, max 5)</Label>
            <Input
              id="tags"
              placeholder="e.g. important, to-read"
              value={syncOptions.tags}
              onChange={(e) =>
                setSyncOptions((prev) => ({ ...prev, tags: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Documents must have all listed tags
            </p>
          </div>

          <div className="flex items-center justify-between space-x-2 py-3 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="reset-sync">Reset sync history</Label>
              <p className="text-xs text-muted-foreground">
                Re-import all documents, ignoring last sync date
              </p>
            </div>
            <Switch
              id="reset-sync"
              checked={syncOptions.resetSync}
              onCheckedChange={(checked: boolean) =>
                setSyncOptions((prev) => ({ ...prev, resetSync: checked }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={syncMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSync} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? (
              <>
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  className="animate-spin"
                />
                Syncing...
              </>
            ) : (
              <>
                <HugeiconsIcon icon={DatabaseSync01Icon} size={16} />
                Sync Documents
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
