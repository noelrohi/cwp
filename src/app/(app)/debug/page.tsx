"use client";

import {
  Activity01Icon,
  ArrowReloadHorizontalIcon,
  ChartHistogramIcon,
  SparklesIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/server/trpc/client";

export default function DebugPage() {
  const { data: session, isPending: sessionLoading } = useSession();

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <HugeiconsIcon
          icon={ArrowReloadHorizontalIcon}
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
          <TabsTrigger value="distribution">Score Distribution</TabsTrigger>
          <TabsTrigger value="training">Training Data</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="distribution" className="mt-6">
          <DistributionTab />
        </TabsContent>

        <TabsContent value="training" className="mt-6">
          <TrainingDataTab />
        </TabsContent>

        <TabsContent value="validation" className="mt-6">
          <ValidationTab />
        </TabsContent>
      </Tabs>

      <EmbeddingDiagnostics />
    </main>
  );
}

function EmbeddingDiagnostics() {
  const trpc = useTRPC();
  const diagnosticsQuery = useQuery(
    trpc.signals.embeddingDiagnostics.queryOptions(),
  );

  if (diagnosticsQuery.isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const data = diagnosticsQuery.data;

  if (!data) {
    return null;
  }

  const embeddingRate =
    data.totalSaved > 0
      ? ((data.savedWithEmbeddings / data.totalSaved) * 100).toFixed(1)
      : "0";

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-destructive">
          ⚠️ Embedding Diagnostics
        </CardTitle>
        <CardDescription>
          Debug info for missing embeddings issue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm text-muted-foreground">
              Total Saved Signals
            </div>
            <div className="text-2xl font-bold">{data.totalSaved}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">With Embeddings</div>
            <div className="text-2xl font-bold">{data.savedWithEmbeddings}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Embedding Rate</div>
            <div className="text-2xl font-bold">{embeddingRate}%</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <h4 className="font-medium mb-2">Sample of Saved Signals</h4>
          <div className="space-y-2 text-sm">
            {data.sampleSignals.map((signal) => (
              <div
                key={signal.signalId}
                className="flex items-center justify-between"
              >
                <span className="font-mono text-xs">
                  {signal.chunkId.substring(0, 8)}...
                </span>
                <span
                  className={
                    signal.hasEmbedding
                      ? "text-green-600 font-medium"
                      : "text-destructive font-medium"
                  }
                >
                  {signal.hasEmbedding ? "✓ HAS EMBEDDING" : "✗ NO EMBEDDING"}
                </span>
                <span className="text-muted-foreground text-xs">
                  Score: {Math.round((signal.relevanceScore ?? 0) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <strong>Total chunks with embeddings in DB:</strong>{" "}
          {data.totalChunksWithEmbeddings}
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const metricsQuery = useQuery(trpc.signals.metrics.queryOptions());
  const debugQuery = useQuery(trpc.signals.debug.queryOptions());

  const regenerateMutation = useMutation(
    trpc.signals.regenerateForUser.mutationOptions(),
  );

  const handleRegenerate = async () => {
    try {
      await regenerateMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: trpc.signals.list.queryKey() });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.debug.queryKey(),
      });
      toast.success("Signal regeneration triggered");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to regenerate signals";
      toast.error(message);
    }
  };

  if (metricsQuery.isLoading || debugQuery.isLoading) {
    return <OverviewSkeleton />;
  }

  const metrics = metricsQuery.data;
  const debug = debugQuery.data;

  if (!metrics || !debug) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No data available
      </div>
    );
  }

  const phase =
    debug.totalSaved < 10 ? "Random Exploration" : "Embedding Learning";
  const phaseDescription =
    debug.totalSaved < 10
      ? `${10 - debug.totalSaved} more saves needed to enable embedding-based learning`
      : `Using ${debug.savedChunksWithEmbeddings} saved chunk embeddings for similarity scoring`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Signals</CardTitle>
            <HugeiconsIcon
              icon={SparklesIcon}
              size={16}
              className="text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalSignals}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalPresented} presented
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Save Rate</CardTitle>
            <HugeiconsIcon
              icon={Activity01Icon}
              size={16}
              className="text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(metrics.saveRate * 100)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalSaved} saved / {metrics.totalSkipped} skipped
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Learning Phase
            </CardTitle>
            <HugeiconsIcon
              icon={ChartHistogramIcon}
              size={16}
              className="text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{debug.totalSaved}/10</div>
            <p className="text-xs text-muted-foreground">{phase}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Training Data</CardTitle>
            <HugeiconsIcon
              icon={UserMultiple02Icon}
              size={16}
              className="text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {debug.savedChunksWithEmbeddings}
            </div>
            <p className="text-xs text-muted-foreground">
              chunks with embeddings
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model Status</CardTitle>
          <CardDescription>{phaseDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Training Progress</span>
              <span className="text-muted-foreground">
                {Math.min(100, (debug.totalSaved / 10) * 100).toFixed(0)}%
              </span>
            </div>
            <Progress value={Math.min(100, (debug.totalSaved / 10) * 100)} />
          </div>

          <div className="pt-4">
            <Button
              onClick={handleRegenerate}
              disabled={regenerateMutation.isPending}
              className="w-full sm:w-auto"
            >
              {regenerateMutation.isPending ? (
                <HugeiconsIcon
                  icon={ArrowReloadHorizontalIcon}
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} />
              )}
              Regenerate Signals
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DistributionTab() {
  const trpc = useTRPC();
  const distributionQuery = useQuery(
    trpc.signals.scoreDistribution.queryOptions(),
  );

  if (distributionQuery.isLoading) {
    return <DistributionSkeleton />;
  }

  const distribution = distributionQuery.data;

  if (!distribution) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No distribution data available
      </div>
    );
  }

  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Confidence Score Distribution</CardTitle>
          <CardDescription>
            Distribution of relevance scores across pending signals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Score Range</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead>Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {distribution.map((bucket) => {
                const percentage = total > 0 ? (bucket.count / total) * 100 : 0;
                return (
                  <TableRow key={bucket.bucket}>
                    <TableCell className="font-medium">
                      {bucket.bucket}
                    </TableCell>
                    <TableCell className="text-right">{bucket.count}</TableCell>
                    <TableCell className="text-right">
                      {percentage.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Progress value={percentage} className="h-2" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expected Distribution</CardTitle>
          <CardDescription>
            What the distribution should look like based on training phase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">
              Phase 1: Random Exploration (&lt;10 saves)
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Low (&lt;30%): ~20% of signals</li>
              <li>• Medium (30-70%): ~60% of signals</li>
              <li>• High (&gt;70%): ~20% of signals</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">
              Phase 2: Embedding Learning (≥10 saves)
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Initially bell-curved around 50%</li>
              <li>• Gradually shifts toward extremes as system learns</li>
              <li>• After 100+ saves: More signals at &lt;30% and &gt;70%</li>
            </ul>
          </div>
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

function ValidationTab() {
  const trpc = useTRPC();
  const validationQuery = useQuery(
    trpc.signals.validationMetrics.queryOptions(),
  );

  if (validationQuery.isLoading) {
    return <ValidationSkeleton />;
  }

  const data = validationQuery.data;

  if (
    !data ||
    !data.hasSavedChunks ||
    !data.pairwiseSimilarity ||
    !data.savedToCentroid ||
    !data.randomChunksSimilarity ||
    !data.centroidNorm
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Embedding Validation</CardTitle>
          <CardDescription>
            Not enough data yet. Save at least 10 signals to see validation
            metrics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatSim = (val: number) => `${(val * 100).toFixed(1)}%`;

  // Type narrowing: at this point all fields are non-null
  const {
    savedChunkCount,
    pairwiseSimilarity,
    savedToCentroid,
    randomChunksSimilarity,
    centroidNorm,
  } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Embedding Space Validation</CardTitle>
          <CardDescription>
            Testing if your saved chunks cluster together vs random chunks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Saved Chunks
              </div>
              <div className="text-2xl font-bold">{savedChunkCount}</div>
              <div className="text-xs text-muted-foreground">
                with embeddings
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Centroid Norm
              </div>
              <div className="text-2xl font-bold">
                {centroidNorm.toFixed(3)}
              </div>
              <div className="text-xs text-muted-foreground">
                vector magnitude
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">
                Random Samples
              </div>
              <div className="text-2xl font-bold">
                {randomChunksSimilarity.sampleSize}
              </div>
              <div className="text-xs text-muted-foreground">
                baseline chunks
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Similarity Analysis</CardTitle>
          <CardDescription>
            Are your saved chunks actually similar to each other?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead>Interpretation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Saved chunks to each other
                </TableCell>
                <TableCell className="text-right">
                  {formatSim(pairwiseSimilarity.min)}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatSim(pairwiseSimilarity.avg)}
                </TableCell>
                <TableCell className="text-right">
                  {formatSim(pairwiseSimilarity.max)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {pairwiseSimilarity.avg > 0.5
                    ? "✓ Saved chunks cluster together"
                    : "⚠ Saved chunks are diverse"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Saved chunks to centroid
                </TableCell>
                <TableCell className="text-right">
                  {formatSim(savedToCentroid.min)}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatSim(savedToCentroid.avg)}
                </TableCell>
                <TableCell className="text-right">
                  {formatSim(savedToCentroid.max)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {savedToCentroid.avg > 0.7
                    ? "✓ Centroid represents saved content"
                    : "⚠ Centroid may be poorly defined"}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="font-medium">
                  Random chunks to centroid
                </TableCell>
                <TableCell className="text-right">
                  {formatSim(randomChunksSimilarity.min)}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatSim(randomChunksSimilarity.avg)}
                </TableCell>
                <TableCell className="text-right">
                  {formatSim(randomChunksSimilarity.max)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  Baseline comparison
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key Test: Does Ranking Work?</CardTitle>
          <CardDescription>
            Saved chunks should score significantly higher than random chunks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg border-2 border-green-500/20 bg-green-500/5">
              <div className="text-sm font-medium mb-2 text-green-700 dark:text-green-400">
                Saved Chunks → Centroid
              </div>
              <div className="text-3xl font-bold">
                {formatSim(savedToCentroid.avg)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Average similarity
              </div>
            </div>

            <div className="p-4 rounded-lg border-2 border-orange-500/20 bg-orange-500/5">
              <div className="text-sm font-medium mb-2 text-orange-700 dark:text-orange-400">
                Random Chunks → Centroid
              </div>
              <div className="text-3xl font-bold">
                {formatSim(randomChunksSimilarity.avg)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Average similarity
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <div className="text-sm font-medium mb-2">Separation Score</div>
            <div className="text-2xl font-bold">
              {(
                ((savedToCentroid.avg - randomChunksSimilarity.avg) /
                  randomChunksSimilarity.avg) *
                100
              ).toFixed(1)}
              % higher
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {savedToCentroid.avg > randomChunksSimilarity.avg * 1.2 ? (
                <span className="text-green-600 dark:text-green-400">
                  ✓ Good separation - ranking should work
                </span>
              ) : savedToCentroid.avg > randomChunksSimilarity.avg * 1.05 ? (
                <span className="text-yellow-600 dark:text-yellow-400">
                  ⚠ Weak separation - need more training data
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">
                  ✗ No separation - embeddings may be broken
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What This Means</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>
              If saved chunks score 70-90% and random chunks 30-50%:
            </strong>{" "}
            Your system is working correctly. The centroid represents your
            preferences.
          </div>
          <div>
            <strong>
              If saved chunks score 70-90% and random chunks also 70-90%:
            </strong>{" "}
            Your centroid update logic is broken. All content looks the same.
          </div>
          <div>
            <strong>If everything scores 40-60%:</strong> Your embedding space
            geometry is uniform. Either you have diverse interests or need more
            training data.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ValidationSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function DistributionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
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
