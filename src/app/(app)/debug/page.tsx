"use client";

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import React from "react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/server/trpc/client";

export default function DebugPage() {
  const { data: session, isPending: sessionLoading } = useSession();

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={32}
          className="animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">
          Please sign in to access debug panel
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-3xl font-bold font-serif">Debug Panel</h1>
        <p className="text-muted-foreground">
          Monitor signal scoring and model performance
        </p>
      </header>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="training">Training Data</TabsTrigger>
          <TabsTrigger value="articles">Articles (POC)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <PreviewTab />
        </TabsContent>

        <TabsContent value="training" className="mt-6">
          <TrainingDataTab />
        </TabsContent>

        <TabsContent value="articles" className="mt-6">
          <ArticlesTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function PreviewTab() {
  const trpc = useTRPC();
  const metricsQuery = useQuery(trpc.signals.metrics.queryOptions());
  const debugQuery = useQuery(trpc.signals.debug.queryOptions());
  const validationQuery = useQuery(
    trpc.signals.validationMetrics.queryOptions(),
  );
  const distributionQuery = useQuery(
    trpc.signals.scoreDistribution.queryOptions(),
  );

  if (
    metricsQuery.isLoading ||
    debugQuery.isLoading ||
    validationQuery.isLoading ||
    distributionQuery.isLoading
  ) {
    return (
      <div className="flex items-center justify-center p-8">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={32}
          className="animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  const metrics = metricsQuery.data;
  const debug = debugQuery.data;
  const validation = validationQuery.data;
  const distribution = distributionQuery.data;

  if (!metrics || !debug) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No data available
      </div>
    );
  }

  const phase =
    debug.totalSaved < 10 ? "Random Exploration" : "Embedding Learning";
  const hasValidation =
    validation?.hasSavedChunks &&
    validation?.pairwiseSimilarity &&
    validation?.savedToCentroid &&
    validation?.randomChunksSimilarity &&
    validation?.centroidNorm;

  const formatSim = (val: number) => `${(val * 100).toFixed(1)}%`;

  // Get top 3 score buckets for quick view
  const topBuckets = distribution
    ? [...distribution].sort((a, b) => b.count - a.count).slice(0, 3)
    : [];

  return (
    <div className="space-y-6">
      {/* User Status */}
      <Card>
        <CardHeader>
          <CardTitle>User Status</CardTitle>
          <CardDescription>Quick overview of learning progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Learning Phase
              </div>
              <div className="text-2xl font-bold">{phase}</div>
              <div className="text-xs text-muted-foreground">
                {debug.totalSaved}/10 saves
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Save Rate
              </div>
              <div className="text-2xl font-bold">
                {Math.round(metrics.saveRate * 100)}%
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.totalSaved} saved / {metrics.totalSkipped} skipped
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Training Data
              </div>
              <div className="text-2xl font-bold">
                {debug.savedChunksWithEmbeddings}
              </div>
              <div className="text-xs text-muted-foreground">
                chunks with embeddings
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Pending Signals
              </div>
              <div className="text-2xl font-bold">{metrics.totalPending}</div>
              <div className="text-xs text-muted-foreground">
                ready to review
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score Distribution Preview */}
      {topBuckets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>
              Top 3 score ranges in pending signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topBuckets.map((bucket) => {
                const total =
                  distribution?.reduce((sum, b) => sum + b.count, 0) ?? 1;
                const percentage = (bucket.count / total) * 100;
                return (
                  <div key={bucket.bucket} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{bucket.bucket}</span>
                      <span className="text-muted-foreground">
                        {bucket.count} signals ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Summary */}
      {hasValidation && validation ? (
        <Card>
          <CardHeader>
            <CardTitle>Model Performance</CardTitle>
            <CardDescription>
              Can the system distinguish your preferences?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <div className="p-4 rounded-lg border-2 border-green-500/20 bg-green-500/5">
                <div className="text-sm font-medium mb-2 text-green-700 dark:text-green-400">
                  Saved Chunks → Centroid
                </div>
                <div className="text-3xl font-bold">
                  {formatSim(validation.savedToCentroid!.avg)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  What you like
                </div>
              </div>

              <div className="p-4 rounded-lg border-2 border-orange-500/20 bg-orange-500/5">
                <div className="text-sm font-medium mb-2 text-orange-700 dark:text-orange-400">
                  Random Chunks → Centroid
                </div>
                <div className="text-3xl font-bold">
                  {formatSim(validation.randomChunksSimilarity!.avg)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Baseline
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium mb-1">
                    Separation Score
                  </div>
                  <div className="text-2xl font-bold">
                    {(
                      ((validation.savedToCentroid!.avg -
                        validation.randomChunksSimilarity!.avg) /
                        validation.randomChunksSimilarity!.avg) *
                      100
                    ).toFixed(1)}
                    % higher
                  </div>
                </div>
                <div className="text-right">
                  {validation.savedToCentroid!.avg >
                  validation.randomChunksSimilarity!.avg * 1.2 ? (
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                      ✓ Working well
                    </span>
                  ) : validation.savedToCentroid!.avg >
                    validation.randomChunksSimilarity!.avg * 1.05 ? (
                    <span className="text-yellow-600 dark:text-yellow-400 text-sm font-medium">
                      ⚠ Needs more data
                    </span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                      ✗ Not working
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Model Performance</CardTitle>
            <CardDescription>
              Save at least 10 signals to see validation metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 text-center">
              <p className="text-muted-foreground">
                Keep saving signals to build your preference profile
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle>What's Happening</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {debug.totalSaved < 10 ? (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <strong className="text-blue-700 dark:text-blue-400">
                Random Phase:
              </strong>{" "}
              <span className="text-muted-foreground">
                Showing random signals to learn your preferences. Save{" "}
                {10 - debug.totalSaved} more to enable smart ranking.
              </span>
            </div>
          ) : hasValidation ? (
            <>
              {validation.savedToCentroid!.avg >
              validation.randomChunksSimilarity!.avg * 1.2 ? (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <strong className="text-green-700 dark:text-green-400">
                    System Working:
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    The model can distinguish your preferences from random
                    content. High-scoring signals are genuinely relevant to you.
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <strong className="text-yellow-700 dark:text-yellow-400">
                    Building Profile:
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    Your preferences are still being learned. Save more focused
                    content to improve accuracy.
                  </span>
                </div>
              )}
              {validation.pairwiseSimilarity!.avg < 0.4 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <strong className="text-orange-700 dark:text-orange-400">
                    Diverse Interests:
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    Your saved content covers diverse topics (
                    {formatSim(validation.pairwiseSimilarity!.avg)} similarity).
                    The model is learning your broad interests.
                  </span>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingDataTab() {
  const trpc = useTRPC();
  const samplesQuery = useQuery(trpc.signals.recentSamples.queryOptions());

  if (samplesQuery.isLoading) {
    return <TrainingSkeleton />;
  }

  const samples = samplesQuery.data;

  if (
    !samples ||
    (samples.saved.length === 0 && samples.skipped.length === 0)
  ) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No training samples available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recent Saved Signals</CardTitle>
          <CardDescription>
            Last 10 signals that were saved (used for training)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {samples.saved.map((signal) => (
              <div
                key={signal.id}
                className="p-4 rounded-lg border border-border bg-muted/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Score: {Math.round((signal.relevanceScore ?? 0) * 100)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {signal.savedAt
                      ? new Date(signal.savedAt).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
                <p className="text-sm line-clamp-3">{signal.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Skipped Signals</CardTitle>
          <CardDescription>
            Last 10 signals that were skipped (negative feedback)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {samples.skipped.map((signal) => (
              <div
                key={signal.id}
                className="p-4 rounded-lg border border-border bg-muted/20 opacity-60"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Score: {Math.round((signal.relevanceScore ?? 0) * 100)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {signal.skippedAt
                      ? new Date(signal.skippedAt).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
                <p className="text-sm line-clamp-3">{signal.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ArticlesTab() {
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
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Process Article (POC)</CardTitle>
          <CardDescription>
            Paste any article URL to extract, chunk, and embed it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="flex-1 px-3 py-2 rounded-md border border-input bg-background"
              disabled={processArticle.isPending}
            />
            <button
              type="button"
              onClick={handleProcess}
              disabled={processArticle.isPending || !url.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {processArticle.isPending ? "Processing..." : "Process"}
            </button>
          </div>

          {processArticle.isSuccess && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
              <div className="text-sm font-medium text-green-600 dark:text-green-400">
                ✓ Article processing started
              </div>
              <div className="text-sm text-muted-foreground">
                Article ID: {processArticle.data.articleId}
              </div>
              <div className="text-sm text-muted-foreground">
                Processing in background via Inngest
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
                  className="p-4 rounded-lg border border-border bg-muted/20"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium mb-1">{article.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {article.url}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
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
                    <button
                      type="button"
                      onClick={() => setSelectedArticleId(article.id)}
                      className="text-sm text-primary hover:underline"
                    >
                      View Chunks & Embeddings →
                    </button>
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
                      <p className="text-sm mb-3 line-clamp-4">
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
    </div>
  );
}
