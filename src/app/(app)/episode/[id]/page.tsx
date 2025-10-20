"use client";

import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  BodyPartMuscleIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  Chat01Icon,
  Clock01Icon,
  Copy01Icon,
  Download01Icon,
  File01Icon,
  FingerPrintIcon,
  FlashIcon,
  InformationCircleIcon,
  Loading03Icon,
  Scissor01Icon,
  SparklesIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { use, useState } from "react";
import { toast } from "sonner";

type SignalAction = "saved" | "skipped";

import { ChevronDown } from "lucide-react";
import { Streamdown } from "streamdown";
import { MetaSignalsTab } from "@/components/blocks/episode/meta-signals-tab";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/components/blocks/signals/signal-card";
import { FavoriteButton } from "@/components/favorite-button";
import { SnipDialog } from "@/components/snip-dialog";
import { TranscriptDisplay } from "@/components/transcript-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza";
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
import type { TranscriptData } from "@/types/transcript";

export default function EpisodeDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = use(props.params);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringEnum<"summary" | "signals" | "meta-signals">([
      "summary",
      "signals",
      "meta-signals",
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
  const [selectedConfidence, setSelectedConfidence] = useState<
    "all" | "high" | "medium" | "low"
  >("all");

  const episode = useQuery({
    ...trpc.episodes.get.queryOptions({
      episodeId: params.id,
    }),
  });

  const signals = useQuery(
    trpc.signals.byEpisode.queryOptions({
      episodeId: params.id,
      filter: signalFilter,
      actionFilter,
      confidenceFilter:
        selectedConfidence !== "all" ? selectedConfidence : undefined,
    }),
  );

  const episodeStats = useQuery(
    trpc.signals.episodeStats.queryOptions({
      episodeId: params.id,
    }),
  );

  const generateSummary = useMutation(
    trpc.episodes.generateSummary.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Summary generation started! This usually takes 10-30 seconds.",
        );
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.getSummary.queryKey({ episodeId: params.id }),
        });
      },
      onError: (error) => {
        toast.error(`Failed to generate summary: ${error.message}`);
      },
    }),
  );

  const summary = useQuery({
    ...trpc.episodes.getSummary.queryOptions({ episodeId: params.id }),
    enabled: activeTab === "summary",
  });

  const signalIds = (signals.data ?? []).map((s) => s.id);
  const hasSnips = useQuery({
    ...trpc.flashcards.hasSnips.queryOptions({ signalIds }),
    enabled: signalIds.length > 0,
  });

  const processEpisode = useMutation(
    trpc.episodes.processEpisode.mutationOptions({
      onSuccess: () => {
        toast.success("Episode processing started");
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.get.queryKey({ episodeId: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byEpisode.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.episodeStats.queryKey(),
        });
        setShowProcessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to process episode: ${error.message}`);
        setShowProcessDialog(false);
      },
    }),
  );

  const processEpisodeWithSignals = useMutation(
    trpc.episodes.processEpisodeWithSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Episode processing started with signal generation");
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.get.queryKey({ episodeId: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byEpisode.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.episodeStats.queryKey(),
        });
        setShowProcessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to process episode: ${error.message}`);
        setShowProcessDialog(false);
      },
    }),
  );

  const generateSignals = useMutation(
    trpc.episodes.generateSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Signal generation started - refreshing in a moment...");
        setShowGenerateDialog(false);

        // Poll for new signals (generation happens async via Inngest)
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({
            queryKey: trpc.episodes.get.queryKey({ episodeId: params.id }),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.signals.byEpisode.queryKey({ episodeId: params.id }),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.signals.episodeStats.queryKey({
              episodeId: params.id,
            }),
          });
        }, 2000);

        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(pollInterval), 30000);
      },
      onError: (error) => {
        toast.error(`Failed to generate signals: ${error.message}`);
        setShowGenerateDialog(false);
      },
    }),
  );

  const reprocessEpisode = useMutation(
    trpc.episodes.reprocessEpisode.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Episode reprocessing started - all existing data will be replaced",
        );
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.get.queryKey({ episodeId: params.id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.byEpisode.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.episodeStats.queryKey(),
        });
        setShowReprocessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to reprocess episode: ${error.message}`);
        setShowReprocessDialog(false);
      },
    }),
  );

  const regenerateSignals = useMutation(
    trpc.episodes.regenerateSignals.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Signal regeneration started - refreshing in a moment...",
        );
        setShowRegenerateDialog(false);

        // Poll for new signals (regeneration happens async via Inngest)
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({
            queryKey: trpc.signals.byEpisode.queryKey({ episodeId: params.id }),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.signals.episodeStats.queryKey({
              episodeId: params.id,
            }),
          });
        }, 2000);

        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(pollInterval), 30000);
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
  const [isSkippingAll, setIsSkippingAll] = useState(false);

  const handleAction = async (signalId: string, action: SignalAction) => {
    setPendingSignalId(signalId);
    setPendingAction(action);
    try {
      await actionMutation.mutateAsync({ signalId, action });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.byEpisode.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.episodeStats.queryKey(),
      });
      toast.success(action === "saved" ? "Signal saved" : "Signal skipped", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await undoMutation.mutateAsync({ signalId });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.byEpisode.queryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: trpc.signals.episodeStats.queryKey(),
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
        queryKey: trpc.signals.byEpisode.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.episodeStats.queryKey(),
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

  const handleSkipAll = async () => {
    setIsSkippingAll(true);
    try {
      const result = await skipAllMutation.mutateAsync({
        episodeId: params.id,
        confidenceFilter:
          selectedConfidence !== "all" ? selectedConfidence : undefined,
      });

      queryClient.invalidateQueries({
        queryKey: trpc.signals.byEpisode.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.episodeStats.queryKey(),
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

  const fetchTranscript = async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch transcript");
      }
      const jsonData = await response.json();
      setTranscript(jsonData);
      document.getElementById("transcript-dialog-trigger")?.click();
    } catch (_error) {
      toast.error("Failed to load transcript");
    }
  };

  const handleCopySignals = () => {
    const signalsText = relatedSignals
      .map((signal, idx) => {
        const score = signal.relevanceScore
          ? `${Math.round(signal.relevanceScore * 100)}%`
          : "N/A";
        const episode = signal.episode?.title || "Unknown Episode";
        const podcast = signal.episode?.podcast?.title || "Unknown Podcast";
        const speaker = signal.speakerName || "Unknown speaker";
        const content = signal.chunk.content.trim();
        const startTime = signal.chunk.startTimeSec
          ? formatTimestamp(signal.chunk.startTimeSec)
          : null;
        const endTime = signal.chunk.endTimeSec
          ? formatTimestamp(signal.chunk.endTimeSec)
          : null;
        const timestamp =
          startTime && endTime
            ? `${startTime} - ${endTime}`
            : startTime
              ? startTime
              : "N/A";

        return `Signal ${idx + 1}:
Score: ${score}
Episode: ${episode}
Podcast: ${podcast}
Speaker: ${speaker}
Timestamp: ${timestamp}
Content: ${content}
---`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(signalsText);
    toast.success(
      `Copied ${relatedSignals.length} signal${relatedSignals.length !== 1 ? "s" : ""} to clipboard`,
    );
  };

  if (episode.isPending) {
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

  if (episode.error) {
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
            Episode not found
          </div>
          <p className="text-base text-muted-foreground">
            The episode you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const episodeData = episode.data;
  const relatedSignals = signals.data ?? [];
  const currentStatus = episodeData?.status;
  const currentErrorMessage = episodeData?.errorMessage;
  // Check mutation state (ground truth) not status field
  const isProcessing =
    processEpisode.isPending ||
    reprocessEpisode.isPending ||
    processEpisodeWithSignals.isPending;
  const isGenerating = generateSignals.isPending;
  const isRegenerating = regenerateSignals.isPending;
  // Don't trust status field - check actual data existence
  const hasSignalsGenerated =
    Boolean(episodeData?.signalsGeneratedAt) ||
    (episodeStats.data?.total ?? 0) > 0;
  // Check if summary exists - use summary relation from episode data (works on all tabs)
  const hasSummary = Boolean(episodeData?.summary?.markdownContent);
  // For UI logic: consider "processed" if we have a summary (actual work was done)
  const isProcessed = hasSummary || currentStatus === "processed";
  const lastProcessedAt = episodeData?.lastProcessedAt
    ? new Date(episodeData.lastProcessedAt)
    : null;
  const lastSignalsGeneratedAt = episodeData?.signalsGeneratedAt
    ? new Date(episodeData.signalsGeneratedAt)
    : null;
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
    if (lastProcessedAt) {
      items.push({
        text: `Last processed ${lastProcessedAt.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}.`,
      });
    }
    if (isProcessing) {
      items.push({
        text: "Processing in progress. Transcript and embeddings are being prepared.",
      });
    }
    if (isGenerating) {
      items.push({
        text: "Signal generation running. Insights will appear shortly.",
      });
    }
    if (isRegenerating) {
      items.push({ text: "Signal regeneration refreshing current results." });
    }
    if (generateSummary.isPending) {
      items.push({ text: "Summary generation in progress." });
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
    if (generateSummary.isPending) {
      return {
        title: "Generating summary",
        description:
          "Fetching the transcript and creating a concise recap. This usually takes a few minutes depending on length.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: true,
      } as const;
    }
    if (isProcessing) {
      return {
        title: "Processing episode",
        description:
          "Fetching the transcript, chunking audio, and preparing embeddings. This usually takes a few minutes depending on length.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: true,
      } as const;
    }
    if (isGenerating) {
      return {
        title: "Generating signals",
        description:
          "Scoring transcript segments to deliver the top 30 insights for review.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: false,
      } as const;
    }
    if (isRegenerating) {
      return {
        title: "Regenerating signals",
        description:
          "Refreshing scores with your latest preferences. We'll replace the existing list shortly.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: false,
      } as const;
    }
    return null;
  })();
  const isBusy =
    isProcessing || isGenerating || isRegenerating || generateSummary.isPending;
  const processButtonLabel = (() => {
    if (isProcessing) return "Processing...";
    if (currentStatus === "failed") return "Reprocess Episode";
    return "Process Episode";
  })();

  const handleCopyEpisodeId = () => {
    navigator.clipboard.writeText(params.id);
    toast.success("Episode ID copied to clipboard");
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Back Navigation */}
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
                onClick={handleCopyEpisodeId}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={FingerPrintIcon} size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy Episode ID</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Episode Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Thumbnail - Desktop only */}
          {episodeData?.thumbnailUrl && (
            <div className="relative h-32 w-32 hidden sm:block shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image
                src={episodeData.thumbnailUrl}
                alt={episodeData.title}
                className="h-full w-full object-cover"
                fill
              />
            </div>
          )}

          {/* Title and Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 justify-between">
            <div className="flex gap-3 items-start">
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2 text-balance">
                  {episodeData?.title}
                </h1>

                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {episodeData?.publishedAt && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Calendar03Icon} size={14} />
                      <dt className="sr-only">Published</dt>
                      <dd>
                        {new Date(episodeData.publishedAt).toLocaleDateString(
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
                  {episodeData?.durationSec && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Clock01Icon} size={14} />
                      <dt className="sr-only">Duration</dt>
                      <dd>{Math.floor(episodeData.durationSec / 60)} min</dd>
                    </div>
                  )}
                  {statusTooltipItems.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <HugeiconsIcon icon={InformationCircleIcon} size={14} />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
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

              {/* Thumbnail - Mobile only */}
              {episodeData?.thumbnailUrl && (
                <div className="relative h-16 w-16 sm:hidden shrink-0 overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={episodeData.thumbnailUrl}
                    alt={episodeData.title}
                    className="h-full w-full object-cover"
                    fill
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {!hasSummary && (
                <Dialog
                  open={showProcessDialog}
                  onOpenChange={setShowProcessDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      disabled={isProcessing || generateSummary.isPending}
                      size="sm"
                    >
                      {isProcessing || generateSummary.isPending ? (
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
                      <DialogTitle>
                        {currentStatus === "failed"
                          ? "Reprocess Episode"
                          : "Process Episode"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">
                          This will fully process the episode:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Fetch transcript from audio</li>
                          <li>Generate AI summary (key takeaways & lessons)</li>
                          <li>Split into semantic chunks (~100-800 words)</li>
                          <li>Identify speakers using AI</li>
                          <li>Generate embeddings for search</li>
                          <li>Generate up to 30 personalized signals</li>
                        </ul>
                        <p className="mt-3 p-3 bg-muted rounded-lg">
                          <strong className="text-foreground">💡 Tip:</strong>{" "}
                          If you only want a summary preview, use the "Summarize
                          Episode" button in the Summary tab.
                        </p>
                        <p className="mt-3">
                          <strong>Duration:</strong> Usually 3-6 minutes
                          depending on episode length
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
                            processEpisodeWithSignals.mutate({
                              episodeId: params.id,
                            })
                          }
                          disabled={isProcessing || generateSummary.isPending}
                        >
                          {isProcessing || generateSummary.isPending
                            ? "Processing..."
                            : "Start Processing"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {hasSummary &&
                !hasSignalsGenerated &&
                (episodeStats.data?.total ?? 0) === 0 && (
                  <Dialog
                    open={showGenerateDialog}
                    onOpenChange={setShowGenerateDialog}
                  >
                    <DialogTrigger asChild>
                      <Button
                        disabled={
                          isGenerating ||
                          isProcessing ||
                          generateSummary.isPending
                        }
                        size="sm"
                      >
                        {isGenerating ||
                        isProcessing ||
                        generateSummary.isPending ? (
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
                        <DialogTitle>
                          Generate Signals for This Episode
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">
                            This will analyze the episode transcript and create
                            personalized signals:
                          </p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Score all chunks using your preferences</li>
                            <li>Generate up to 30 signals for review</li>
                            <li>
                              Apply stratified sampling across 0-100%
                              distribution
                            </li>
                          </ul>
                          <p className="mt-3">
                            <strong>Duration:</strong> Usually 30-60 seconds
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
                              generateSignals.mutate({ episodeId: params.id })
                            }
                            disabled={
                              isGenerating ||
                              isProcessing ||
                              generateSummary.isPending
                            }
                          >
                            {isGenerating ||
                            isProcessing ||
                            generateSummary.isPending
                              ? "Generating..."
                              : "Generate Signals"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

              {hasSummary && hasSignalsGenerated && (
                <>
                  <Dialog
                    open={showRegenerateDialog}
                    onOpenChange={setShowRegenerateDialog}
                  >
                    <DialogTrigger asChild>
                      <Button
                        disabled={
                          isRegenerating ||
                          isProcessing ||
                          generateSummary.isPending
                        }
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
                            This will regenerate signals for this episode only:
                          </p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>
                              Delete all pending signals from this episode
                            </li>
                            <li>
                              Re-score all chunks using your latest preferences
                            </li>
                            <li>
                              Generate fresh top 30 signals with stratified
                              sampling (0-100% distribution)
                            </li>
                          </ul>

                          {episodeStats.data && (
                            <div className="mt-3 p-3 bg-muted rounded-lg">
                              <p className="font-medium text-foreground mb-1">
                                Current episode signals:
                              </p>
                              <div className="flex gap-4 text-xs">
                                <span>{episodeStats.data.total} total</span>
                                {episodeStats.data.pending > 0 && (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {episodeStats.data.pending} pending
                                  </span>
                                )}
                                {episodeStats.data.saved > 0 && (
                                  <span className="text-green-600 dark:text-green-400">
                                    {episodeStats.data.saved} saved
                                  </span>
                                )}
                                {episodeStats.data.skipped > 0 && (
                                  <span className="text-muted-foreground">
                                    {episodeStats.data.skipped} skipped
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="mt-3 space-y-2">
                            <p className="text-green-600 dark:text-green-400">
                              <strong>Preserved:</strong> Your saved and skipped
                              signals won't be changed
                            </p>
                            <p className="text-amber-600 dark:text-amber-400">
                              <strong>Deleted:</strong> All pending signals will
                              be removed
                            </p>
                            <p className="text-blue-600 dark:text-blue-400">
                              <strong>Regenerated:</strong> Fresh set of 30
                              signals will be created from scratch
                            </p>
                          </div>
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
                              regenerateSignals.mutate({
                                episodeId: params.id,
                              })
                            }
                            disabled={
                              isRegenerating ||
                              isProcessing ||
                              generateSummary.isPending
                            }
                          >
                            {isRegenerating ||
                            isProcessing ||
                            generateSummary.isPending
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
                        Reprocess Episode
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                          <HugeiconsIcon icon={AlertCircleIcon} size={20} />
                          Reprocess Episode from Scratch
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p className="font-medium text-destructive">
                            This will DELETE all existing data and reprocess
                            from scratch:
                          </p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Delete all transcript chunks</li>
                            <li>Delete all signals (saved and skipped)</li>
                            <li>Delete speaker identification mappings</li>
                            <li>Delete episode summary</li>
                            <li>Re-fetch transcript from audio</li>
                            <li>Regenerate AI summary</li>
                            <li>Re-chunk with current settings</li>
                            <li>Re-identify speakers using AI</li>
                            <li>Generate new embeddings</li>
                          </ul>

                          {episodeStats.data && episodeStats.data.saved > 0 && (
                            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                              <p className="font-medium text-destructive mb-1 flex items-center gap-1.5">
                                <HugeiconsIcon
                                  icon={AlertCircleIcon}
                                  size={16}
                                />
                                You will lose {episodeStats.data.saved} saved
                                signal
                                {episodeStats.data.saved !== 1 ? "s" : ""} from
                                this episode
                              </p>
                              <p className="text-xs">
                                (Saves from other episodes are not affected)
                              </p>
                            </div>
                          )}

                          <p className="mt-3 font-medium text-foreground">
                            Use this when:
                          </p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Transcript had errors or quality issues</li>
                            <li>Speaker identification failed</li>
                            <li>Chunking logic has been updated</li>
                          </ul>

                          <p className="mt-3 text-muted-foreground">
                            <strong>Duration:</strong> 3-7 minutes depending on
                            episode length
                          </p>
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
                              reprocessEpisode.mutate({
                                episodeId: params.id,
                              })
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

              {episodeData?.transcriptUrl && (
                <ButtonGroup>
                  <CopyTranscriptButton
                    transcriptUrl={episodeData.transcriptUrl}
                    audioUrl={episodeData.audioUrl}
                    speakerMappings={
                      episodeData?.speakerMapping?.speakerMappings
                        ? JSON.parse(episodeData.speakerMapping.speakerMappings)
                        : null
                    }
                  />
                  <FavoriteButton episodeId={params.id} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <ChevronDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/chat?episodeId=${params.id}`}>
                          <HugeiconsIcon icon={Chat01Icon} size={16} />
                          Chat with Episode
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <button
                          type="button"
                          className="w-full"
                          onClick={() =>
                            fetchTranscript(episodeData.transcriptUrl as string)
                          }
                        >
                          <HugeiconsIcon icon={File01Icon} size={16} />
                          View Transcript
                        </button>
                      </DropdownMenuItem>
                      {episodeData.transcriptUrl && (
                        <DropdownMenuItem asChild>
                          <a
                            href={episodeData.transcriptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <HugeiconsIcon icon={Download01Icon} size={16} />
                            Download Transcript
                          </a>
                        </DropdownMenuItem>
                      )}
                      {episodeData.audioUrl && (
                        <DropdownMenuItem asChild>
                          <a
                            href={episodeData.audioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <HugeiconsIcon icon={Download01Icon} size={16} />
                            Download Audio
                          </a>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ButtonGroup>
              )}

              <Credenza>
                <CredenzaTrigger asChild>
                  <button
                    type="button"
                    className="hidden"
                    id="transcript-dialog-trigger"
                  />
                </CredenzaTrigger>
                <CredenzaContent className="sm:max-w-[90vw] sm:max-h-[90svh]">
                  <CredenzaHeader>
                    <CredenzaTitle>Episode Transcript</CredenzaTitle>
                  </CredenzaHeader>
                  <CredenzaBody className="overflow-y-auto">
                    {transcript && episodeData && (
                      <TranscriptDisplay
                        transcript={transcript}
                        speakerMappings={
                          episodeData?.speakerMapping?.speakerMappings
                            ? JSON.parse(
                                episodeData.speakerMapping.speakerMappings,
                              )
                            : null
                        }
                      />
                    )}
                  </CredenzaBody>
                </CredenzaContent>
              </Credenza>
            </div>
          </div>
        </div>
      </div>

      {activeOperation && (
        <div className="rounded-lg border border-border bg-muted/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HugeiconsIcon
              icon={activeOperation.icon}
              size={16}
              className={activeOperation.spinning ? "animate-spin" : undefined}
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

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="pt-6"
      >
        <TabsList className="w-full">
          <TabsTrigger value="summary" className="flex-1">
            Summary
          </TabsTrigger>
          <TabsTrigger value="signals" className="flex-1">
            Signals{" "}
            <Badge variant="outline" className="ml-1.5">
              {episodeStats.data?.total ?? 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="meta-signals" className="flex-1">
            Meta Signals
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
                    generateSummary.mutate({ episodeId: params.id })
                  }
                  disabled={generateSummary.isPending || isProcessing}
                >
                  {generateSummary.isPending || isProcessing ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={SparklesIcon} size={16} />
                  )}
                  {generateSummary.isPending || isProcessing
                    ? "Working..."
                    : "Regenerate"}
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
                  Summarize this episode to get key takeaways, examples,
                  lessons, and quotes. Perfect for quick triage.
                </EmptyDescription>
              </EmptyHeader>

              <EmptyContent>
                <Button
                  size="lg"
                  onClick={() =>
                    processEpisode.mutate({ episodeId: params.id })
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
                      Summarize Episode
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground mt-3">
                  Want full processing with signals? Use the "Process Episode"
                  button at the top.
                </p>

                {(generateSummary.isPending || isProcessing) && (
                  <p className="text-sm text-muted-foreground">
                    This usually takes{" "}
                    {!episodeData?.transcriptUrl
                      ? "2.5-5.5 minutes"
                      : "10-30 seconds"}
                  </p>
                )}
              </EmptyContent>
            </Empty>
          )}
        </section>
      )}

      {activeTab === "signals" && (
        <section className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Left side: Tabs */}
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
                        {episodeStats.data?.pending ?? 0}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="actioned">
                      Processed{" "}
                      <span className="ml-1 text-muted-foreground">
                        {episodeStats.data
                          ? episodeStats.data.saved + episodeStats.data.skipped
                          : 0}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="all">
                      All{" "}
                      <span className="ml-1 text-muted-foreground">
                        {episodeStats.data?.total ?? 0}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Copy button - Mobile only */}
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

              {/* Right side: Action filter, Copy button, Skip All button, and Confidence filter - Desktop */}
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
                          {episodeStats.data &&
                          episodeStats.data.saved + episodeStats.data.skipped >
                            0
                            ? episodeStats.data.saved +
                              episodeStats.data.skipped
                            : 0}
                          )
                        </span>
                      </SelectItem>
                      <SelectItem value="saved">
                        Saved{" "}
                        <span className="text-xs font-mono text-muted-foreground">
                          ({episodeStats.data?.saved ?? 0})
                        </span>
                      </SelectItem>
                      <SelectItem value="skipped">
                        Skipped{" "}
                        <span className="text-xs font-mono text-muted-foreground">
                          ({episodeStats.data?.skipped ?? 0})
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
                {signalFilter === "pending" &&
                  episodeStats.data &&
                  episodeStats.data.pending > 0 && (
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
                      Skip All ({episodeStats.data.pending})
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
            signalFilter === "pending" && episodeStats.data?.total === 0 ? (
              isProcessed ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={SparklesIcon} size={20} />
                    </EmptyMedia>
                    <EmptyTitle>Generate Personalized Signals</EmptyTitle>
                    <EmptyDescription>
                      Episode is processed and ready! Generate up to 30 insights
                      ranked by your preferences.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      size="lg"
                      onClick={() =>
                        generateSignals.mutate({ episodeId: params.id })
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
                      Process this episode to get signals. Use the "Process
                      Episode" button at the top.
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
                    : "No signals found for this episode."}
              </div>
            )
          ) : (
            <div className="space-y-4">
              {relatedSignals.map((signal) => {
                const isPending = pendingSignalId === signal.id;
                const isSignalPending = !signal.userAction;
                const speakerDisplay = signal.speakerName?.trim()
                  ? signal.speakerName
                  : signal.chunk.speaker?.trim()
                    ? `Speaker ${signal.chunk.speaker}`
                    : "Unknown speaker";
                const publishedLabel = formatDate(signal.episode?.publishedAt);
                const hasSnip = hasSnips.data?.[signal.id] ?? false;
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
                if (hasSnip) {
                  metadata.push({
                    icon: <HugeiconsIcon icon={FlashIcon} size={12} />,
                    label: "Snipped",
                  });
                }
                const audioSource = signal.episode?.audioUrl
                  ? {
                      id: `${signal.id}-${signal.chunk.id}`,
                      title: signal.episode?.title ?? signal.title ?? "Episode",
                      subtitle: speakerDisplay,
                      audioUrl: signal.episode.audioUrl,
                      startTimeSec: signal.chunk.startTimeSec ?? undefined,
                      endTimeSec: signal.chunk.endTimeSec ?? undefined,
                      durationSec: signal.episode.durationSec ?? undefined,
                    }
                  : undefined;

                return (
                  <SignalCard
                    key={signal.id}
                    className="rounded-2xl"
                    chunkContent={signal.chunk.content}
                    speakerLabel={speakerDisplay}
                    startTimeSec={signal.chunk.startTimeSec ?? null}
                    endTimeSec={signal.chunk.endTimeSec ?? null}
                    metadata={metadata}
                    audio={audioSource}
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

      {activeTab === "meta-signals" && <MetaSignalsTab episodeId={params.id} />}
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

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function CopyTranscriptButton({
  transcriptUrl,
  speakerMappings,
}: {
  transcriptUrl?: string | null;
  audioUrl?: string | null;
  speakerMappings?: Record<string, string> | null;
}) {
  const transcript = useQuery({
    queryKey: ["transcript", transcriptUrl],
    queryFn: async () => {
      if (!transcriptUrl) throw new Error("No transcript URL");
      const response = await fetch(transcriptUrl);
      if (!response.ok) throw new Error("Failed to fetch transcript");
      const jsonData: TranscriptData = await response.json();
      return jsonData;
    },
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const handleCopyTranscript = async () => {
    if (!transcriptUrl) {
      toast.error("Transcript not available");
      return;
    }

    const data = transcript.data || (await transcript.refetch()).data;

    if (!data) {
      toast.error("Failed to load transcript");
      return;
    }

    const transcriptText = data
      .map((utterance) => {
        const speaker = utterance.speaker
          ? speakerMappings?.[utterance.speaker.toString()] ||
            `Speaker ${utterance.speaker}`
          : "";
        const speakerLabel = speaker ? `[${speaker}]` : "";
        const timestamp = utterance.start
          ? `[${formatTimestamp(utterance.start)}]`
          : "";
        return `${timestamp}${speakerLabel ? ` ${speakerLabel}` : ""} ${utterance.transcript.trim()}`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(transcriptText);
    toast.success("Transcript copied to clipboard");
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleCopyTranscript}
      disabled={transcript.isFetching}
    >
      {transcript.isFetching ? (
        <HugeiconsIcon
          icon={Loading03Icon}
          size={16}
          className="animate-spin"
        />
      ) : (
        <HugeiconsIcon icon={Copy01Icon} size={16} />
      )}
      Copy Transcript
    </Button>
  );
}
