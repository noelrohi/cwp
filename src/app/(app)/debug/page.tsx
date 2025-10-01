"use client";

import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
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
          <PreviewTab />
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
          icon={ArrowReloadHorizontalIcon}
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
              <div className="text-2xl font-bold">
                {metrics.totalSignals - metrics.totalPresented}
              </div>
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
