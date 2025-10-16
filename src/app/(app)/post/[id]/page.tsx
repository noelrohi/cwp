"use client";

import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  BodyPartMuscleIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  Chat01Icon,
  Copy01Icon,
  FingerPrintIcon,
  InformationCircleIcon,
  Link01Icon,
  Loading03Icon,
  Scissor01Icon,
  SparklesIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { use, useState } from "react";
import { toast } from "sonner";

type SignalAction = "saved" | "skipped";

import { Streamdown } from "streamdown";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { FavoriteButton } from "@/components/favorite-button";
import { SnipDialog } from "@/components/snip-dialog";
import { StreamdownWithSnip } from "@/components/streamdown-with-snip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemFooter } from "@/components/ui/item";
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
  const router = useRouter();
  const params = use(props.params);
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringEnum<"summary" | "article" | "signals">([
      "summary",
      "article",
      "signals",
    ]).withDefault("summary"),
  );
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
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SignalAction | null>(null);
  const [isSkippingAll, setIsSkippingAll] = useState(false);
  const [selectedConfidence, setSelectedConfidence] = useState<
    "all" | "high" | "medium" | "low"
  >("all");

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
      confidenceFilter:
        selectedConfidence !== "all" ? selectedConfidence : undefined,
    }),
  );

  const articleStats = useQuery(
    trpc.signals.articleStats.queryOptions({
      articleId: params.id,
    }),
  );

  const generateSummary = useMutation(
    trpc.articles.generateSummary.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Summary generation started! This usually takes 10-30 seconds.",
        );
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getSummary.queryKey({ articleId: params.id }),
        });
      },
      onError: (error) => {
        toast.error(`Failed to generate summary: ${error.message}`);
      },
    }),
  );

  const summary = useQuery({
    ...trpc.articles.getSummary.queryOptions({ articleId: params.id }),
    enabled: activeTab === "summary",
  });

  const rawContent = useQuery({
    ...trpc.articles.getRawContent.queryOptions({ articleId: params.id }),
    enabled: activeTab === "article",
  });

  const processArticle = useMutation(
    trpc.articles.processArticle.mutationOptions({
      onSuccess: () => {
        toast.success("Article processing started");
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getById.queryKey({ id: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byArticle.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articleStats.queryKey(),
        });
        setShowProcessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to process article: ${error.message}`);
        setShowProcessDialog(false);
      },
    }),
  );

  const processArticleWithSignals = useMutation(
    trpc.articles.processArticleWithSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Article processing started with signal generation");
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getById.queryKey({ id: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byArticle.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articleStats.queryKey(),
        });
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
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getById.queryKey({ id: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byArticle.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articleStats.queryKey(),
        });
        setShowReprocessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to reprocess article: ${error.message}`);
        setShowReprocessDialog(false);
      },
    }),
  );

  const generateSignals = useMutation(
    trpc.articles.generateSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Signal generation started");
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getById.queryKey({ id: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byArticle.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articleStats.queryKey(),
        });
        setShowGenerateDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to generate signals: ${error.message}`);
        setShowGenerateDialog(false);
      },
    }),
  );

  const regenerateSignals = useMutation(
    trpc.articles.regenerateSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Signal regeneration started");
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byArticle.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articleStats.queryKey(),
        });
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
  const skipAllMutation = useMutation(trpc.signals.skipAll.mutationOptions());

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

  const handleSkipAll = async () => {
    setIsSkippingAll(true);
    try {
      const result = await skipAllMutation.mutateAsync({
        articleId: params.id,
        confidenceFilter:
          selectedConfidence !== "all" ? selectedConfidence : undefined,
      });

      queryClient.invalidateQueries({
        queryKey: trpc.signals.byArticle.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.articleStats.queryKey(),
      });
      toast.success(`Skipped ${result.skippedCount} signals`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to skip signals.";
      toast.error(message);
    } finally {
      setIsSkippingAll(false);
    }
  };

  const handleCopyArticleId = () => {
    navigator.clipboard.writeText(params.id);
    toast.success("Article ID copied to clipboard");
  };

  if (article.isPending) {
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
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Go back
        </button>
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
  const currentStatus = articleData?.status;
  const currentErrorMessage = articleData?.errorMessage;

  const relatedSignals = (signals.data ?? []).sort((a, b) => {
    const timeA = a.chunk.startTimeSec ?? 0;
    const timeB = b.chunk.startTimeSec ?? 0;
    return timeA - timeB;
  });
  const isProcessing =
    currentStatus === "processing" ||
    processArticle.isPending ||
    reprocessArticle.isPending;
  const isGenerating = generateSignals.isPending;
  const isRegenerating = regenerateSignals.isPending;
  const isProcessed = currentStatus === "processed";
  const hasSignalsGenerated = Boolean(articleData?.signalsGeneratedAt);
  const lastSignalsGeneratedAt = articleData?.signalsGeneratedAt
    ? new Date(articleData.signalsGeneratedAt)
    : null;
  const isBusy = isProcessing || isGenerating || isRegenerating;
  const statusLabel = (() => {
    switch (currentStatus) {
      case "processed":
        return "Processed";
      case "processing":
        return "Processing";
      case "failed":
        return "Failed";
      case "retrying":
        return "Retrying";
      case "pending":
        return "Pending";
      default:
        return currentStatus ? currentStatus : "Unknown";
    }
  })();

  const statusTooltipItems = (() => {
    const items: Array<{ text: string; tone?: "error" }> = [];
    if (statusLabel) {
      items.push({ text: `Status: ${statusLabel}` });
    }
    if (isProcessing) {
      items.push({
        text: "Processing in progress. We'll refresh details as soon as it's finished.",
      });
    }
    if (isGenerating) {
      items.push({
        text: "Signal generation running. Fresh insights will appear when scoring completes.",
      });
    }
    if (isRegenerating) {
      items.push({
        text: "Signal regeneration is refreshing existing scores.",
      });
    }
    if (generateSummary.isPending) {
      items.push({
        text: "Summary generation in progress.",
      });
    }
    if (hasSignalsGenerated && lastSignalsGeneratedAt) {
      items.push({
        text: `Signals generated ${lastSignalsGeneratedAt.toLocaleString(
          "en-US",
          {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        )}.`,
      });
    } else if (isProcessed) {
      items.push({ text: "Signals not generated yet." });
    }
    if (currentErrorMessage) {
      items.push({ text: `Last error: ${currentErrorMessage}`, tone: "error" });
    }
    return items;
  })();
  const activeOperation = (() => {
    if (isProcessing) {
      return {
        title: "Processing article",
        description:
          "Extracting content, generating embeddings, and setting up signals. This usually takes 1-3 minutes.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: true,
      } as const;
    }
    if (isGenerating) {
      return {
        title: "Generating signals",
        description:
          "Scoring chunks to surface up to 30 insights. We'll update this page automatically once they're ready.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: false,
      } as const;
    }
    if (isRegenerating) {
      return {
        title: "Regenerating signals",
        description:
          "Refreshing scores and replacing saved items with the latest recommendations.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: false,
      } as const;
    }
    if (generateSummary.isPending) {
      return {
        title: "Generating summary",
        description: "Creating a fresh summary with the latest context.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: false,
      } as const;
    }
    return null;
  })();
  const processButtonLabel = (() => {
    if (isProcessing) return "Processing...";
    if (currentStatus === "failed") return "Reprocess Article";
    return "Process Article";
  })();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Go back
        </button>

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

              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
                {statusTooltipItems.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label="Article status details"
                      >
                        <HugeiconsIcon icon={InformationCircleIcon} size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-background text-foreground">
                      <div className="space-y-1 text-xs">
                        {statusTooltipItems.map((item, index) => (
                          <p
                            key={`${item.text}-${index}`}
                            className={
                              item.tone === "error"
                                ? "text-destructive"
                                : undefined
                            }
                          >
                            {item.text}
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </dl>
              {currentErrorMessage && (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {currentErrorMessage}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <ButtonGroup>
              <CopyArticleContentButton articleId={params.id} />
              <FavoriteButton articleId={params.id} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/chat?articleId=${params.id}`}>
                      <HugeiconsIcon icon={Chat01Icon} size={16} />
                      Chat with Article
                    </Link>
                  </DropdownMenuItem>
                  {articleData?.url && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={articleData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <HugeiconsIcon icon={Link01Icon} size={16} />
                        Read Article
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>

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
                        This will fully process the article:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Fetch article content from URL</li>
                        <li>Generate AI summary (key takeaways & lessons)</li>
                        <li>Split into semantic chunks (~100-800 words)</li>
                        <li>Generate embeddings for search</li>
                        <li>Generate up to 30 personalized signals</li>
                      </ul>
                      <p className="mt-3 p-3 bg-muted rounded-lg">
                        <strong className="text-foreground">💡 Tip:</strong> If
                        you only want a summary preview, use the "Summarize
                        Article" button in the Summary tab.
                      </p>
                      <p className="mt-3">
                        <strong>Duration:</strong> Usually 2-4 minutes depending
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
                          processArticleWithSignals.mutate({
                            articleId: params.id,
                          })
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

            {isProcessed && !hasSignalsGenerated && (
              <Dialog
                open={showGenerateDialog}
                onOpenChange={setShowGenerateDialog}
              >
                <DialogTrigger asChild>
                  <Button disabled={isGenerating || isProcessing} size="sm">
                    {isGenerating || isProcessing ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                    )}
                    Generate Signals
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Signals for This Article</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        This will analyze the article content and create
                        personalized signals:
                      </p>
                      <ul className="ml-2 list-disc list-inside space-y-1">
                        <li>Score all chunks using your current preferences</li>
                        <li>Generate up to 30 signals for review</li>
                        <li>
                          Apply stratified sampling across the full score range
                        </li>
                      </ul>
                      <p className="mt-3">
                        <strong>Duration:</strong> Usually 20-40 seconds
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowGenerateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() =>
                          generateSignals.mutate({ articleId: params.id })
                        }
                        disabled={isGenerating || isProcessing}
                      >
                        {isGenerating || isProcessing
                          ? "Generating..."
                          : "Generate Signals"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {isProcessed && hasSignalsGenerated && (
              <>
                <Dialog
                  open={showRegenerateDialog}
                  onOpenChange={setShowRegenerateDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      disabled={isRegenerating || isProcessing}
                      variant="outline"
                      size="sm"
                    >
                      {isRegenerating || isProcessing ? (
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
                          disabled={isRegenerating || isProcessing}
                        >
                          {isRegenerating || isProcessing
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
                    <Button disabled={isBusy} variant="destructive" size="sm">
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
                          <li>Delete article summary</li>
                          <li>Re-fetch content from URL</li>
                          <li>Regenerate AI summary</li>
                          <li>Re-chunk with current settings</li>
                          <li>Generate new embeddings</li>
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
                          disabled={isBusy}
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
          </div>

          {activeOperation && (
            <div className="mt-2 rounded-lg border border-border bg-muted/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <HugeiconsIcon
                  icon={activeOperation.icon}
                  size={16}
                  className={
                    activeOperation.spinning ? "animate-spin" : undefined
                  }
                />
                {activeOperation.title}
              </div>
              {activeOperation.showProgress && (
                <div className="mt-3 h-2 rounded-full bg-muted">
                  <div className="h-2 w-full rounded-full bg-primary animate-pulse" />
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {activeOperation.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="mt-6"
      >
        <TabsList className="w-full">
          <TabsTrigger value="summary" className="flex-1">
            Summary
          </TabsTrigger>
          <TabsTrigger value="article" className="flex-1">
            Full Article
          </TabsTrigger>
          <TabsTrigger value="signals" className="flex-1">
            Signals{" "}
            <Badge variant="outline" className="ml-1.5">
              {articleStats.data?.total ?? 0}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "summary" && (
        <section className="space-y-4">
          {summary.isPending ? (
            <LoadingState />
          ) : summary.data ? (
            <Item className="space-y-6" variant="muted">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => {
                    if (summary.data?.markdownContent) {
                      navigator.clipboard.writeText(
                        summary.data.markdownContent,
                      );
                      toast.success("Summary copied to clipboard");
                    }
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                </Button>
                <Streamdown className="text-base">
                  {summary.data.markdownContent}
                </Streamdown>
              </div>
              <ItemFooter className="pt-6 border-t flex gap-3 justify-start">
                <Button
                  variant="outline"
                  onClick={() =>
                    generateSummary.mutate({ articleId: params.id })
                  }
                  disabled={generateSummary.isPending}
                >
                  {generateSummary.isPending ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={SparklesIcon} size={16} />
                  )}
                  Regenerate
                </Button>
              </ItemFooter>
            </Item>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={SparklesIcon} size={20} />
                </EmptyMedia>
                <EmptyTitle>Quick Overview Summary</EmptyTitle>
                <EmptyDescription>
                  Summarize this article to get key takeaways, examples,
                  lessons, and quotes. Perfect for quick triage.
                </EmptyDescription>
              </EmptyHeader>

              <EmptyContent>
                <Button
                  size="lg"
                  onClick={() =>
                    generateSummary.mutate({ articleId: params.id })
                  }
                  disabled={generateSummary.isPending || isProcessing}
                >
                  {generateSummary.isPending || isProcessing ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                      Summarizing...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                      Summarize Article
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground mt-3">
                  Want full processing with signals? Use the "Process Article"
                  button at the top.
                </p>
              </EmptyContent>
            </Empty>
          )}
        </section>
      )}

      {activeTab === "article" && (
        <section className="space-y-4">
          {rawContent.isPending ? (
            <LoadingState />
          ) : rawContent.data?.rawContent ? (
            <Item className="space-y-6" variant="muted">
              <StreamdownWithSnip
                content={rawContent.data.rawContent}
                className="text-base prose prose-neutral dark:prose-invert max-w-none"
                articleId={params.id}
                selectionSource="article"
                disallowedElements={["img"]}
              />
            </Item>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={InformationCircleIcon} size={20} />
                </EmptyMedia>
                <EmptyTitle>Full Article Content</EmptyTitle>
                <EmptyDescription>
                  Process this article to read the full content parsed by Jina
                  AI.
                </EmptyDescription>
              </EmptyHeader>

              <EmptyContent>
                <Button
                  size="lg"
                  onClick={() =>
                    processArticle.mutate({ articleId: params.id })
                  }
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                      Processing...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                      Process Article
                    </>
                  )}
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </section>
      )}

      {activeTab === "signals" && (
        <section className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <Tabs
                  value={signalFilter}
                  onValueChange={(v) =>
                    setSignalFilter(v as typeof signalFilter)
                  }
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

                {signalFilter === "pending" && relatedSignals.length > 0 && (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleSkipAll}
                    disabled={isSkippingAll}
                    className="sm:hidden"
                  >
                    {isSkippingAll ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={BookmarkRemove01Icon} size={16} />
                    )}
                    <span className="sr-only">Skip All</span>
                  </Button>
                )}

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
                          articleStats.data.saved + articleStats.data.skipped >
                            0
                            ? articleStats.data.saved +
                              articleStats.data.skipped
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
                {signalFilter === "pending" && relatedSignals.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSkipAll}
                    disabled={isSkippingAll}
                  >
                    {isSkippingAll ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={BookmarkRemove01Icon} size={16} />
                    )}
                    Skip All ({articleStats.data?.pending ?? 0})
                  </Button>
                )}
                <Select
                  value={selectedConfidence}
                  onValueChange={(value) =>
                    setSelectedConfidence(
                      value as "all" | "high" | "medium" | "low",
                    )
                  }
                >
                  <SelectTrigger size="sm" className="w-[180px]">
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
          </div>

          {signals.isPending ? (
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
            signalFilter === "pending" && articleStats.data?.total === 0 ? (
              isProcessed ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={SparklesIcon} size={20} />
                    </EmptyMedia>
                    <EmptyTitle>Generate Personalized Signals</EmptyTitle>
                    <EmptyDescription>
                      Article is processed and ready! Generate up to 30 insights
                      ranked by your preferences.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      size="lg"
                      onClick={() =>
                        generateSignals.mutate({ articleId: params.id })
                      }
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={16}
                            className="animate-spin"
                          />
                          Generating Signals...
                        </>
                      ) : (
                        <>
                          <HugeiconsIcon icon={SparklesIcon} size={16} />
                          Generate Signals
                        </>
                      )}
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={SparklesIcon} size={20} />
                    </EmptyMedia>
                    <EmptyTitle>No Signals Yet</EmptyTitle>
                    <EmptyDescription>
                      Process this article to get signals. Use the "Process
                      Article" button at the top.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            ) : (
              <div className="rounded-xl border border-border/50 bg-muted/30 p-6 text-base text-muted-foreground">
                {signalFilter === "pending"
                  ? "No pending signals. All signals have been processed."
                  : signalFilter === "actioned"
                    ? "No processed signals yet. Start reviewing signals to see them here."
                    : "No signals found for this article."}
              </div>
            )
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
                return (
                  <SignalCard
                    key={signal.id}
                    className="rounded-2xl"
                    chunkContent={signal.chunk.content}
                    metadata={metadata}
                    renderMarkdown
                    snipButton={
                      <SnipDialog
                        signalId={signal.id}
                        defaultBack={signal.chunk.content}
                        trigger={
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                          >
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
                            <HugeiconsIcon
                              icon={BookmarkCheck01Icon}
                              size={16}
                            />
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
      )}
    </main>
  );
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 bg-muted rounded" />
      <div className="h-4 w-full bg-muted rounded" />
      <div className="h-4 w-full bg-muted rounded" />
      <div className="h-4 w-3/4 bg-muted rounded" />
    </div>
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

function CopyArticleContentButton({ articleId }: { articleId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const handleCopyContent = async () => {
    try {
      const { content } = await queryClient.fetchQuery(
        trpc.articles.getContent.queryOptions({
          articleId,
        }),
      );

      if (!content || content.trim().length === 0) {
        toast.error("No content available to copy");
        return;
      }

      await navigator.clipboard.writeText(content);
      toast.success("Article content copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy content");
      console.error(error);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleCopyContent}>
      <HugeiconsIcon icon={Copy01Icon} size={16} />
      Copy Content
    </Button>
  );
}
