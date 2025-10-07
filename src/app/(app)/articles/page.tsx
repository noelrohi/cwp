"use client";

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/server/trpc/client";

export default function ArticlesPage() {
  const trpc = useTRPC();
  const [url, setUrl] = React.useState("");
  const [selectedArticleId, setSelectedArticleId] = React.useState<
    string | null
  >(null);

  const articlesQuery = useQuery(trpc.articles.list.queryOptions());
  const processArticle = useMutation(trpc.articles.process.mutationOptions());
  const selectedArticle = useQuery({
    ...trpc.articles.getById.queryOptions({ id: selectedArticleId || "" }),
    enabled: !!selectedArticleId,
  });

  const handleProcess = async () => {
    if (!url.trim()) return;

    processArticle.mutate(
      { url: url.trim() },
      {
        onSuccess: () => {
          setUrl("");
          articlesQuery.refetch();
          toast.success("Article processed successfully");
        },
        onError: (error) => {
          toast.error(error.message || "Failed to process article");
        },
      },
    );
  };

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold font-serif">Articles</h1>
        <p className="text-muted-foreground">
          Process articles to extract and embed content into your knowledge base
        </p>
      </header>

      {/* Process Article Section */}
      <Card>
        <CardHeader>
          <CardTitle>Process New Article</CardTitle>
          <CardDescription>
            Paste any article URL to extract, chunk, and embed it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              disabled={processArticle.isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) {
                  handleProcess();
                }
              }}
            />
            <Button
              onClick={handleProcess}
              disabled={processArticle.isPending || !url.trim()}
            >
              {processArticle.isPending ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                  Processing...
                </>
              ) : (
                "Process"
              )}
            </Button>
          </div>

          {processArticle.isSuccess && (
            <div className="p-4 rounded-lg border bg-green-500/10 border-green-500/20">
              <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                ✓ Article processed successfully
              </div>
              <div className="text-sm text-muted-foreground">
                Created {processArticle.data.chunkCount} chunks and{" "}
                {processArticle.data.signalCount} signals
              </div>
            </div>
          )}

          {processArticle.isError && (
            <div className="p-4 rounded-lg border bg-red-500/10 border-red-500/20">
              <div className="font-medium text-red-700 dark:text-red-400 mb-1">
                ✗ Failed to process article
              </div>
              <div className="text-sm text-muted-foreground">
                {processArticle.error.message}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processed Articles List */}
      <Card>
        <CardHeader>
          <CardTitle>Processed Articles</CardTitle>
          <CardDescription>
            Articles you've processed (most recent first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {articlesQuery.isLoading ? (
            <div className="flex items-center justify-center p-8">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={24}
                className="animate-spin text-muted-foreground"
              />
            </div>
          ) : articlesQuery.data && articlesQuery.data.length > 0 ? (
            <div className="space-y-3">
              {articlesQuery.data.map((article) => (
                <div
                  key={article.id}
                  className="p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium mb-1 line-clamp-1">
                        {article.title}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {article.url}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded flex-shrink-0 ml-2 ${
                        article.status === "processed"
                          ? "bg-green-500/20 text-green-700 dark:text-green-400"
                          : article.status === "processing"
                            ? "bg-blue-500/20 text-blue-700 dark:text-blue-400"
                            : "bg-red-500/20 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {article.status}
                    </span>
                  </div>
                  {article.author && (
                    <div className="text-sm text-muted-foreground mb-2">
                      By {article.author}
                    </div>
                  )}
                  {article.status === "processed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedArticleId(article.id)}
                      className="h-8 px-2 text-primary hover:text-primary"
                    >
                      View Chunks & Embeddings →
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              No articles processed yet. Try adding one above!
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chunk Viewer Dialog */}
      {selectedArticleId && (
        <Dialog
          open={!!selectedArticleId}
          onOpenChange={(open) => !open && setSelectedArticleId(null)}
        >
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {selectedArticle.data?.title || "Article Chunks"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {selectedArticle.isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={24}
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              ) : selectedArticle.data?.transcriptChunks &&
                selectedArticle.data.transcriptChunks.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {selectedArticle.data.transcriptChunks.length}{" "}
                    chunks with embeddings
                  </div>
                  {selectedArticle.data.transcriptChunks.map((chunk, idx) => (
                    <div
                      key={chunk.id}
                      className="p-4 rounded-lg border border-border bg-muted/20"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          Chunk {idx + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {chunk.wordCount} words
                        </span>
                      </div>
                      <p className="text-sm mb-3 whitespace-pre-wrap">
                        {chunk.content}
                      </p>
                      {chunk.embedding && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Show embedding (1536 dimensions)
                          </summary>
                          <div className="mt-2 p-2 bg-muted/40 rounded font-mono overflow-x-auto">
                            [{chunk.embedding.slice(0, 10).join(", ")}, ...]
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  No chunks found
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
