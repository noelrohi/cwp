"use client";

import {
  Alert01Icon,
  Book02Icon,
  DatabaseSync01Icon,
  Delete01Icon,
  Loading03Icon,
  MoreHorizontalCircle01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { ReadwiseSyncDialog } from "@/components/blocks/integrations";
import { SignalBadge } from "@/components/signal-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useTRPC } from "@/server/trpc/client";

export default function ReadwisePage() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useQueryState("q", {
    defaultValue: "",
  });
  const [sortBy, setSortBy] = useQueryState("sort", { defaultValue: "date" });
  const [page, setPage] = useQueryState("page", {
    defaultValue: 1,
    parse: (value) => Number(value) || 1,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data, isLoading, error } = useQuery(
    trpc.readwise.listArticles.queryOptions({
      page,
      limit: 20,
      query: debouncedSearchQuery.trim() || undefined,
      sortBy: sortBy as "date" | "title",
    }),
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (page !== 1) {
      setPage(1);
    }
  };

  const deleteArticle = useMutation(
    trpc.readwise.deleteArticle.mutationOptions(),
  );

  const handleDeleteArticle = async () => {
    if (!articleToDelete) return;

    try {
      await deleteArticle.mutateAsync({ articleId: articleToDelete.id });
      qc.invalidateQueries({ queryKey: trpc.readwise.listArticles.queryKey() });
      toast.success("Article deleted from Readwise and local database");
      setDeleteDialogOpen(false);
      setArticleToDelete(null);
    } catch (error) {
      console.error("Failed to delete article:", error);
      toast.error("Failed to delete article");
    }
  };

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold font-serif">
          Readwise Library
        </h1>
        <div className="flex gap-2">
          <ReadwiseSyncDialog>
            <Button>
              <HugeiconsIcon icon={DatabaseSync01Icon} size={16} />
              Resync Documents
            </Button>
          </ReadwiseSyncDialog>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Sort by Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Sort by Date</SelectItem>
            <SelectItem value="title">Sort by Title</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-lg border bg-background p-4"
            >
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="flex items-center justify-center mb-4">
            <HugeiconsIcon
              icon={Alert01Icon}
              size={32}
              className="text-destructive"
            />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Failed to load articles
          </h3>
          <p className="text-base text-muted-foreground mb-4">
            {error.message || "An error occurred while loading your articles."}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <div className="space-y-3">
          {data.data.map((article) => (
            <Link
              key={article.id}
              href={`/post/${article.id}`}
              className="flex items-center gap-4 rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/50">
                <HugeiconsIcon
                  icon={Book02Icon}
                  size={20}
                  className="text-muted-foreground"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base line-clamp-2">
                  {article.title}
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {article.author && <span>{article.author}</span>}
                  {article.author && article.siteName && <span>•</span>}
                  {article.siteName && <span>{article.siteName}</span>}
                  {(article.author || article.siteName) &&
                    article.publishedAt && <span>•</span>}
                  {article.publishedAt && (
                    <span>
                      {new Date(article.publishedAt).toLocaleDateString(
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
              </div>

              <div className="flex items-center gap-2">
                <SignalBadge
                  status={article.status}
                  hasSummary={!!article.summary?.markdownContent}
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.preventDefault()}
                  >
                    <HugeiconsIcon
                      icon={MoreHorizontalCircle01Icon}
                      size={16}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setArticleToDelete({
                        id: article.id,
                        title: article.title,
                      });
                      setDeleteDialogOpen(true);
                    }}
                    className="text-destructive"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={16} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-base text-muted-foreground mb-4">
            {debouncedSearchQuery
              ? "No articles found."
              : "No Readwise articles yet."}
          </div>
          {!debouncedSearchQuery && (
            <p className="text-base text-muted-foreground">
              Sync your Readwise library to see articles here.
            </p>
          )}
        </div>
      )}

      {data?.data && data.data.length > 0 && (
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-muted-foreground">
            Showing {(page - 1) * data.pagination.limit + 1} to{" "}
            {(page - 1) * data.pagination.limit + data.data.length} of{" "}
            {data.pagination.total} results
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="flex items-center px-3 text-sm">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={!data.pagination.hasMore}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Article?</DialogTitle>
            <DialogDescription>
              This will permanently delete "{articleToDelete?.title}" from both
              your local database and Readwise. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteArticle.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteArticle}
              disabled={deleteArticle.isPending}
            >
              {deleteArticle.isPending ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
