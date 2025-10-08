"use client";

import {
  BodyPartMuscleIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  FileAttachmentIcon,
  Globe02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { SignalEmptyState } from "@/blocks/signals/signal-empty-state";
import { SignalErrorState } from "@/blocks/signals/signal-error-state";
import { SignalSkeletonList } from "@/blocks/signals/signal-skeleton-list";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/signal-utils";
import { useTRPC } from "@/server/trpc/client";

type SignalAction = "saved" | "skipped";

export default function ArticleSignalsPage() {
  const trpc = useTRPC();
  const savedQuery = useQuery(trpc.signals.savedArticles.queryOptions());
  const articlesWithSignalsQuery = useQuery(
    trpc.signals.articlesWithSignals.queryOptions(),
  );

  const savedCount = savedQuery.data?.length ?? 0;
  const pendingCount = useMemo(() => {
    return (articlesWithSignalsQuery.data ?? []).reduce(
      (sum, article) => sum + article.signalCount,
      0,
    );
  }, [articlesWithSignalsQuery.data]);

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold font-serif">Article Signals</h1>
          <p className="hidden text-muted-foreground md:block">
            Review signals from your articles. Save or skip to improve
            recommendations.
          </p>
        </div>
        <div className="flex gap-3 text-sm md:gap-6">
          <div className="flex flex-col items-end gap-0.5 md:gap-1">
            <div className="font-bold font-serif text-base md:text-3xl">
              {pendingCount}
            </div>
            <div className="text-muted-foreground text-xs md:text-sm">
              Pending
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 md:gap-1">
            <div className="font-bold font-serif text-base text-muted-foreground/70 md:text-3xl">
              {savedCount}
            </div>
            <div className="text-muted-foreground text-xs md:text-sm">
              Saved
            </div>
          </div>
        </div>
      </header>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="saved">Saved</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <PendingArticleSignalsTab />
        </TabsContent>

        <TabsContent value="saved" className="mt-6">
          <SavedArticleSignalsTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function PendingArticleSignalsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SignalAction | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string>("all");
  const [selectedConfidence, setSelectedConfidence] = useState<
    "all" | "high" | "medium" | "low"
  >("all");

  const articlesWithSignalsQuery = useQuery(
    trpc.signals.articlesWithSignals.queryOptions({
      confidenceFilter:
        selectedConfidence !== "all" ? selectedConfidence : undefined,
    }),
  );
  const signalsQuery = useQuery(
    trpc.signals.listArticleSignals.queryOptions({
      limit: 200,
      articleId: selectedArticleId !== "all" ? selectedArticleId : undefined,
      confidenceFilter:
        selectedConfidence !== "all" ? selectedConfidence : undefined,
    }),
  );

  const actionMutation = useMutation(trpc.signals.action.mutationOptions());
  const undoMutation = useMutation(trpc.signals.undo.mutationOptions());

  const handleAction = async (signalId: string, action: SignalAction) => {
    setPendingSignalId(signalId);
    setPendingAction(action);
    try {
      await actionMutation.mutateAsync({ signalId, action });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.listArticleSignals.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.articlesWithSignals.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.metrics.queryKey(),
      });
      toast.success(action === "saved" ? "Signal saved" : "Signal skipped", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await undoMutation.mutateAsync({ signalId });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.listArticleSignals.queryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.articlesWithSignals.queryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.metrics.queryKey(),
              });
              toast.success("Action undone");
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Unable to undo action.";
              toast.error(message);
            }
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update signal.";
      toast.error(message);
    } finally {
      setPendingSignalId(null);
      setPendingAction(null);
    }
  };

  const isLoading =
    articlesWithSignalsQuery.isLoading || signalsQuery.isLoading;
  const fetchError = signalsQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;

  const articleOptions = useMemo(() => {
    return (articlesWithSignalsQuery.data ?? []).map((article) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      siteName: article.siteName,
      signalCount: article.signalCount,
    }));
  }, [articlesWithSignalsQuery.data]);

  const totalSignalsCount = useMemo(() => {
    return articleOptions.reduce((sum, art) => sum + art.signalCount, 0);
  }, [articleOptions]);

  const signals = useMemo(() => {
    return (signalsQuery.data ?? []).sort(
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
    );
  }, [signalsQuery.data]);

  return (
    <>
      {!isLoading && !fetchError && articleOptions.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="@container flex flex-col sm:flex-row gap-3 sm:items-center">
            <Select
              value={selectedArticleId}
              onValueChange={setSelectedArticleId}
            >
              <SelectTrigger className="w-full @sm:w-[300px]">
                <SelectValue placeholder="Filter by article">
                  {selectedArticleId === "all" ? (
                    `All Articles (${totalSignalsCount} signals)`
                  ) : (
                    <div className="flex flex-col items-start min-w-0 flex-1 text-left">
                      <span className="font-medium truncate max-w-full">
                        {
                          articleOptions.find((a) => a.id === selectedArticleId)
                            ?.title
                        }
                      </span>
                      <span className="text-xs text-muted-foreground truncate max-w-full">
                        {
                          articleOptions.find((a) => a.id === selectedArticleId)
                            ?.siteName
                        }
                      </span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Articles ({totalSignalsCount} signals)
                </SelectItem>
                {articleOptions.map((article) => (
                  <SelectItem key={article.id} value={article.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{article.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {article.siteName} · {article.signalCount} signals
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedConfidence}
              onValueChange={(value) =>
                setSelectedConfidence(
                  value as "all" | "high" | "medium" | "low",
                )
              }
            >
              <SelectTrigger className="w-full @sm:w-[180px]">
                <SelectValue placeholder="Confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Confidence</SelectItem>
                <SelectItem value="high">High (≥65%)</SelectItem>
                <SelectItem value="medium">Medium (40-65%)</SelectItem>
                <SelectItem value="low">Low (&lt;40%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      {isLoading ? (
        <SignalSkeletonList />
      ) : fetchError ? (
        <SignalErrorState message={fetchErrorMessage} />
      ) : signals.length === 0 ? (
        <SignalEmptyState message="No pending article signals. Add articles to start seeing signals." />
      ) : (
        <section className="space-y-4">
          {signals.map((signal) => {
            const isPending = pendingSignalId === signal.id;
            const metadata: SignalCardMetadataItem[] = [];

            if (signal.article) {
              if (signal.article.title) {
                metadata.push({
                  icon: <HugeiconsIcon icon={FileAttachmentIcon} size={12} />,
                  label: signal.article.title,
                });
              }
              if (signal.article.siteName) {
                metadata.push({
                  icon: <HugeiconsIcon icon={Globe02Icon} size={12} />,
                  label: signal.article.siteName,
                });
              }
              if (signal.article.publishedAt) {
                metadata.push({
                  icon: <HugeiconsIcon icon={Calendar03Icon} size={12} />,
                  label: formatDate(signal.article.publishedAt),
                });
              }
            }
            if (
              signal.relevanceScore !== null &&
              signal.relevanceScore !== undefined
            ) {
              metadata.push({
                icon: <HugeiconsIcon icon={BodyPartMuscleIcon} size={12} />,
                label: `${Math.round(signal.relevanceScore * 100)}%`,
              });
            }

            return (
              <SignalCard
                key={signal.id}
                className="border-border bg-background/70"
                chunkContent={signal.chunk.content}
                speakerLabel={null}
                startTimeSec={null}
                endTimeSec={null}
                metadata={metadata}
                renderMarkdown
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleAction(signal.id, "skipped")}
                  disabled={isPending}
                >
                  {isPending && pendingAction === "skipped" ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={BookmarkRemove01Icon} size={16} />
                  )}
                  Skip
                </Button>
                <Button
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleAction(signal.id, "saved")}
                  disabled={isPending}
                >
                  {isPending && pendingAction === "saved" ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={BookmarkCheck01Icon} size={16} />
                  )}
                  Save
                </Button>
              </SignalCard>
            );
          })}
        </section>
      )}
    </>
  );
}

function SavedArticleSignalsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const savedQuery = useQuery(trpc.signals.savedArticles.queryOptions());
  const unsaveMutation = useMutation(trpc.signals.unsave.mutationOptions());

  const isLoading = savedQuery.isLoading;
  const fetchError = savedQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;

  const savedArticleSignals = savedQuery.data ?? [];

  const handleUnsave = async (savedChunkId: string) => {
    setDeletingId(savedChunkId);
    try {
      await unsaveMutation.mutateAsync({ savedChunkId });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.savedArticles.queryKey(),
      });
      toast.success("Signal removed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to remove signal.";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {isLoading ? (
        <SignalSkeletonList />
      ) : fetchError ? (
        <SignalErrorState message={fetchErrorMessage} />
      ) : savedArticleSignals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
          No saved article signals yet. Save signals from the Pending tab to see
          them here.
        </div>
      ) : (
        <section className="space-y-4">
          {savedArticleSignals.map((signal) => {
            const metadata: SignalCardMetadataItem[] = [];
            const isDeleting = deletingId === signal.id;

            if (signal.article.siteName) {
              metadata.push({
                icon: <HugeiconsIcon icon={Globe02Icon} size={12} />,
                label: signal.article.siteName,
              });
            }
            if (signal.article.author) {
              metadata.push({
                icon: <HugeiconsIcon icon={FileAttachmentIcon} size={12} />,
                label: signal.article.author,
              });
            }
            if (signal.article.publishedAt) {
              metadata.push({
                icon: <HugeiconsIcon icon={Calendar03Icon} size={12} />,
                label: formatDate(signal.article.publishedAt),
              });
            }

            return (
              <SignalCard
                key={signal.id}
                className="border-border bg-background/70"
                chunkContent={signal.content}
                highlightContent={signal.highlightQuote}
                speakerLabel={null}
                startTimeSec={null}
                endTimeSec={null}
                metadata={metadata}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleUnsave(signal.id)}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={BookmarkRemove01Icon} size={16} />
                  )}
                  Unsave
                </Button>
              </SignalCard>
            );
          })}
        </section>
      )}
    </>
  );
}
