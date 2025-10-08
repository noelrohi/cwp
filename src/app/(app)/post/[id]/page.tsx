"use client";

import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  BodyPartMuscleIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  Copy01Icon,
  FingerPrintIcon,
  Link01Icon,
  Loading03Icon,
  Scissor01Icon,
  SparklesIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type SignalAction = "saved" | "skipped";

import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { SnipDialog } from "@/components/snip-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTRPC } from "@/server/trpc/client";

export default function PostDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const params = use(props.params);
  const [signalFilter, setSignalFilter] = useQueryState(
    "filter",
    parseAsStringEnum<"all" | "pending" | "actioned">([
      "all",
      "pending",
      "actioned",
    ]).withDefault("pending"),
  );
  const [actionFilter, setActionFilter] = useQueryState(
    "action",
    parseAsStringEnum<"all" | "saved" | "skipped">([
      "all",
      "saved",
      "skipped",
    ]).withDefault("all"),
  );
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SignalAction | null>(null);

  const article = useQuery({
    ...trpc.articles.getById.queryOptions({
      id: params.id,
    }),
  });

  const signals = useQuery(
    trpc.signals.byArticle.queryOptions({
      articleId: params.id,
      filter: signalFilter,
      actionFilter,
    }),
  );

  const articleStats = useQuery(
    trpc.signals.articleStats.queryOptions({
      articleId: params.id,
    }),
  );

  // Track previous status to detect when processing completes
  const prevStatusRef = useRef<string | undefined>(undefined);

  // Lightweight polling for status updates during processing
  const articleStatus = useQuery({
    ...trpc.articles.getStatus.queryOptions({
      id: params.id,
    }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll every 2s while processing, stop otherwise
      return status === "processing" ? 2000 : false;
    },
    enabled: article.data?.status === "processing",
  });

  // Refetch full data when processing completes
  useEffect(() => {
    const currentStatus = articleStatus.data?.status || article.data?.status;
    const previousStatus = prevStatusRef.current;

    if (
      previousStatus === "processing" &&
      currentStatus &&
      currentStatus !== "processing"
    ) {
      // Processing completed, refetch everything
      article.refetch();
      signals.refetch();
      articleStats.refetch();

      if (currentStatus === "processed") {
        toast.success("Article processing completed");
      } else if (currentStatus === "failed") {
        toast.error(
          articleStatus.data?.errorMessage || "Article processing failed",
        );
      }
    }

    prevStatusRef.current = currentStatus;
  }, [
    articleStatus.data?.status,
    articleStatus.data?.errorMessage,
    article.data?.status,
    article.refetch,
    signals.refetch,
    articleStats.refetch,
  ]);

  const processArticle = useMutation(
    trpc.articles.processArticle.mutationOptions({
      onSuccess: () => {
        toast.success("Article processing started");
        article.refetch();
        signals.refetch();
        articleStats.refetch();
        setShowProcessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to process article: ${error.message}`);
        setShowProcessDialog(false);
      },
    }),
  );

  const reprocessArticle = useMutation(
    trpc.articles.reprocessArticle.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Article reprocessing started - all existing data will be replaced",
        );
        article.refetch();
        signals.refetch();
        articleStats.refetch();
        setShowReprocessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to reprocess article: ${error.message}`);
        setShowReprocessDialog(false);
      },
    }),
  );

  const regenerateSignals = useMutation(
    trpc.articles.regenerateSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Signal regeneration started");
        signals.refetch();
        articleStats.refetch();
        setShowRegenerateDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to regenerate signals: ${error.message}`);
        setShowRegenerateDialog(false);
      },
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
        queryKey: trpc.signals.byArticle.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.articleStats.queryKey(),
      });
      toast.success(action === "saved" ? "Signal saved" : "Signal skipped", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await undoMutation.mutateAsync({ signalId });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.byArticle.queryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.articleStats.queryKey(),
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

  const handleUndo = async (signalId: string) => {
    setPendingSignalId(signalId);
    try {
      await undoMutation.mutateAsync({ signalId });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.byArticle.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.articleStats.queryKey(),
      });
      toast.success("Action undone");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to undo action.";
      toast.error(message);
    } finally {
      setPendingSignalId(null);
    }
  };

  const handleCopySignals = () => {
    const signalsText = relatedSignals
      .map((signal, idx) => {
        const score = signal.relevanceScore
          ? `${Math.round(signal.relevanceScore * 100)}%`
          : "N/A";
        const article = signal.article?.title || "Unknown Article";
        const author = signal.article?.author || "Unknown author";
        const content = signal.chunk.content.trim();

        return `Signal ${idx + 1}:
Score: ${score}
Article: ${article}
Author: ${author}
Content: ${content}
---`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(signalsText);
    toast.success(
      `Copied ${relatedSignals.length} signal${relatedSignals.length !== 1 ? "s" : ""} to clipboard`,
    );
  };

  const handleCopyArticleId = () => {
    navigator.clipboard.writeText(params.id);
    toast.success("Article ID copied to clipboard");
  };

  if (article.isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-6" />
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </main>
    );
  }

  if (article.error) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/articles"
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to Articles
        </Link>
        <div className="text-center py-8 sm:py-12">
          <div className="text-base sm:text-lg font-semibold text-destructive mb-3 sm:mb-4">
            Article not found
          </div>
          <p className="text-base text-muted-foreground">
            The article you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const articleData = article.data;
  // Use real-time status from polling when available
  const currentStatus = articleStatus.data?.status || articleData?.status;
  const currentErrorMessage =
    articleStatus.data?.errorMessage || articleData?.errorMessage;

  const relatedSignals = (signals.data ?? []).sort((a, b) => {
    const timeA = a.chunk.startTimeSec ?? 0;
    const timeB = b.chunk.startTimeSec ?? 0;
    return timeA - timeB;
  });
  const isProcessing =
    currentStatus === "processing" ||
    processArticle.isPending ||
    reprocessArticle.isPending;
  const isRegenerating = regenerateSignals.isPending;
  const isProcessed = currentStatus === "processed";
  const processButtonLabel = (() => {
    if (isProcessing) return "Processing...";
    return "Process Article";
  })();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/articles"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to Articles
        </Link>

        {process.env.NODE_ENV === "development" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyArticleId}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={FingerPrintIcon} size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy Article ID</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3 justify-between">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2 text-balance">
                {articleData?.title}
              </h1>

              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {articleData?.author && (
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Author</dt>
                    <dd>By {articleData.author}</dd>
                  </div>
                )}
                {articleData?.publishedAt && (
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Calendar03Icon} size={14} />
                    <dt className="sr-only">Published</dt>
                    <dd>
                      {new Date(articleData.publishedAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {articleData?.excerpt && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">
                  {articleData.excerpt}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {!isProcessed && (
              <Dialog
                open={showProcessDialog}
                onOpenChange={setShowProcessDialog}
              >
                <DialogTrigger asChild>
                  <Button disabled={isProcessing} size="sm">
                    {isProcessing ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                    )}
                    {processButtonLabel}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Process Article</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        This will process the article and create signals:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Fetch article content from URL</li>
                        <li>Split into semantic chunks (~100-800 words)</li>
                        <li>Generate embeddings and relevance scores</li>
                        <li>Create up to 30 signals for review</li>
                      </ul>
                      <p className="mt-3">
                        <strong>Duration:</strong> Usually 1-3 minutes depending
                        on article length
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowProcessDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() =>
                          processArticle.mutate({ articleId: params.id })
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing ? "Processing..." : "Start Processing"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {isProcessed && (
              <>
                <Dialog
                  open={showRegenerateDialog}
                  onOpenChange={setShowRegenerateDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      disabled={isRegenerating}
                      variant="outline"
                      size="sm"
                    >
                      {isRegenerating ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <HugeiconsIcon icon={SparklesIcon} size={16} />
                      )}
                      Regenerate Signals
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Regenerate Signals</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">
                          This will regenerate signals for this article only:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>
                            Re-score all chunks using your latest preferences
                          </li>
                          <li>
                            Add new signals from previously unselected chunks
                          </li>
                          <li>
                            Apply current stratified sampling (top 30 across
                            0-100% distribution)
                          </li>
                        </ul>

                        {articleStats.data && (
                          <div className="mt-3 p-3 bg-muted rounded-lg">
                            <p className="font-medium text-foreground mb-1">
                              Current article signals:
                            </p>
                            <div className="flex gap-4 text-xs">
                              <span>{articleStats.data.total} total</span>
                              {articleStats.data.pending > 0 && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {articleStats.data.pending} pending
                                </span>
                              )}
                              {articleStats.data.saved > 0 && (
                                <span className="text-green-600 dark:text-green-400">
                                  {articleStats.data.saved} saved
                                </span>
                              )}
                              {articleStats.data.skipped > 0 && (
                                <span className="text-muted-foreground">
                                  {articleStats.data.skipped} skipped
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowRegenerateDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() =>
                            regenerateSignals.mutate({ articleId: params.id })
                          }
                          disabled={isRegenerating}
                        >
                          {isRegenerating
                            ? "Regenerating..."
                            : "Regenerate Signals"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={showReprocessDialog}
                  onOpenChange={setShowReprocessDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      disabled={isProcessing}
                      variant="destructive"
                      size="sm"
                    >
                      {isProcessing ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <HugeiconsIcon icon={SparklesIcon} size={16} />
                      )}
                      Reprocess Article
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-destructive flex items-center gap-2">
                        <HugeiconsIcon icon={AlertCircleIcon} size={20} />
                        Reprocess Article from Scratch
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="font-medium text-destructive">
                          This will DELETE all existing data and reprocess from
                          scratch:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Delete all content chunks</li>
                          <li>Delete all signals (saved and skipped)</li>
                          <li>Re-fetch content from URL</li>
                          <li>Re-chunk with current settings</li>
                          <li>Generate new embeddings</li>
                          <li>Create new signals</li>
                        </ul>

                        {articleStats.data && articleStats.data.saved > 0 && (
                          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <p className="font-medium text-destructive mb-1 flex items-center gap-1.5">
                              <HugeiconsIcon icon={AlertCircleIcon} size={16} />
                              You will lose {articleStats.data.saved} saved
                              signal
                              {articleStats.data.saved !== 1 ? "s" : ""} from
                              this article
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowReprocessDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() =>
                            reprocessArticle.mutate({ articleId: params.id })
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing
                            ? "Reprocessing..."
                            : "Delete and Reprocess"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}

            {articleData?.url && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={articleData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <HugeiconsIcon icon={Link01Icon} size={16} />
                  Read Article
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {isProcessing && currentStatus === "processing" && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={16}
                className="animate-spin"
              />
              Processing Article
            </span>
          </div>
          <div className="mb-2 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary animate-pulse w-full" />
          </div>
          <p className="text-xs text-muted-foreground">
            Extracting content, generating embeddings, and creating signals...
            This usually takes 1-3 minutes.
          </p>
        </div>
      )}

      {currentStatus === "failed" && currentErrorMessage && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={16}
              className="text-destructive"
            />
            <span className="text-sm font-medium text-destructive">
              Processing Failed
            </span>
          </div>
          <p className="text-xs text-destructive/80">{currentErrorMessage}</p>
        </div>
      )}

      <section className="space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3">
          <h2 className="text-base sm:text-lg font-semibold font-serif">
            Signals from this Article
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <Tabs
                value={signalFilter}
                onValueChange={(v) => setSignalFilter(v as typeof signalFilter)}
              >
                <TabsList>
                  <TabsTrigger value="pending">
                    Pending{" "}
                    <span className="ml-1 text-muted-foreground">
                      {articleStats.data?.pending ?? 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="actioned">
                    Processed{" "}
                    <span className="ml-1 text-muted-foreground">
                      {articleStats.data
                        ? articleStats.data.saved + articleStats.data.skipped
                        : 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    All{" "}
                    <span className="ml-1 text-muted-foreground">
                      {articleStats.data?.total ?? 0}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {relatedSignals.length > 0 && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleCopySignals}
                  className="sm:hidden"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                  <span className="sr-only">Copy Signals</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {signalFilter === "actioned" && (
                <Select
                  value={actionFilter}
                  onValueChange={(v) =>
                    setActionFilter(v as "all" | "saved" | "skipped")
                  }
                >
                  <SelectTrigger size="sm" className="w-[140px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All{" "}
                      <span className="text-xs font-mono text-muted-foreground">
                        (
                        {articleStats.data &&
                        articleStats.data.saved + articleStats.data.skipped > 0
                          ? articleStats.data.saved + articleStats.data.skipped
                          : 0}
                        )
                      </span>
                    </SelectItem>
                    <SelectItem value="saved">
                      Saved{" "}
                      <span className="text-xs font-mono text-muted-foreground">
                        ({articleStats.data?.saved ?? 0})
                      </span>
                    </SelectItem>
                    <SelectItem value="skipped">
                      Skipped{" "}
                      <span className="text-xs font-mono text-muted-foreground">
                        ({articleStats.data?.skipped ?? 0})
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {relatedSignals.length > 0 && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleCopySignals}
                  className="hidden sm:flex sm:size-auto sm:h-8 sm:px-3"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                  <span className="hidden sm:inline">Copy Signals</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {signals.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-xl border border-border/60 bg-muted/40 p-4"
              >
                <div className="h-4 w-1/2 rounded bg-muted-foreground/30" />
                <div className="mt-3 h-3 w-full rounded bg-muted-foreground/20" />
                <div className="mt-2 h-3 w-3/4 rounded bg-muted-foreground/20" />
              </div>
            ))}
          </div>
        ) : signals.error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-base text-destructive">
            Unable to load related signals.
          </div>
        ) : relatedSignals.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-muted/30 p-6 text-base text-muted-foreground">
            {signalFilter === "pending" && articleStats.data?.total === 0
              ? "No signals yet. Start processing above and check back after the pipeline finishes."
              : signalFilter === "pending"
                ? "No pending signals. All signals have been processed."
                : signalFilter === "actioned"
                  ? "No processed signals yet. Start reviewing signals to see them here."
                  : "No signals found for this article."}
          </div>
        ) : (
          <div className="space-y-4">
            {relatedSignals.map((signal) => {
              const isPending = pendingSignalId === signal.id;
              const isSignalPending = !signal.userAction;
              const publishedLabel = formatDate(signal.article?.publishedAt);
              const metadata: SignalCardMetadataItem[] = [];
              if (publishedLabel) {
                metadata.push({ label: publishedLabel });
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
              const highlightContent =
                signal.excerpt &&
                signal.excerpt.trim() !== signal.chunk.content.trim()
                  ? signal.excerpt
                  : null;
              return (
                <SignalCard
                  key={signal.id}
                  className="rounded-2xl"
                  chunkContent={signal.chunk.content}
                  highlightContent={highlightContent}
                  metadata={metadata}
                  renderMarkdown
                  snipButton={
                    <SnipDialog
                      signalId={signal.id}
                      defaultBack={highlightContent || signal.chunk.content}
                      trigger={
                        <Button variant="outline" size="sm">
                          <HugeiconsIcon icon={Scissor01Icon} size={16} />
                          Snip
                        </Button>
                      }
                    />
                  }
                >
                  {isSignalPending ? (
                    <>
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
                          <HugeiconsIcon
                            icon={BookmarkRemove01Icon}
                            size={16}
                          />
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
                    </>
                  ) : (
                    <>
                      <Badge
                        variant={
                          signal.userAction === "saved"
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {signal.userAction === "saved" ? "Saved" : "Skipped"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={() => handleUndo(signal.id)}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <HugeiconsIcon icon={Undo02Icon} size={16} />
                        )}
                        Undo
                      </Button>
                    </>
                  )}
                </SignalCard>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
