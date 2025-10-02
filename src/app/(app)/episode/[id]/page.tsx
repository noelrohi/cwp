"use client";

import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  BodyPartMuscleIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  Clock01Icon,
  Copy01Icon,
  Download01Icon,
  File01Icon,
  FingerPrintIcon,
  Loading03Icon,
  SparklesIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { use, useState } from "react";
import { toast } from "sonner";

type SignalAction = "saved" | "skipped";

import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { TranscriptDisplay } from "@/components/transcript-display";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const params = use(props.params);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
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

  const episode = useQuery({
    ...trpc.episodes.get.queryOptions({
      episodeId: params.id,
    }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "processing" ? 5000 : false;
    },
  });

  const signals = useQuery(
    trpc.signals.byEpisode.queryOptions({
      episodeId: params.id,
      filter: signalFilter,
      actionFilter,
    }),
  );

  const episodeStats = useQuery(
    trpc.signals.episodeStats.queryOptions({
      episodeId: params.id,
    }),
  );

  const processEpisode = useMutation(
    trpc.episodes.processEpisode.mutationOptions({
      onSuccess: () => {
        toast.success("Episode processing started");
        episode.refetch();
        signals.refetch();
        episodeStats.refetch();
        setShowProcessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to process episode: ${error.message}`);
        setShowProcessDialog(false);
      },
    }),
  );

  const reprocessEpisode = useMutation(
    trpc.episodes.reprocessEpisode.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Episode reprocessing started - all existing data will be replaced",
        );
        episode.refetch();
        signals.refetch();
        episodeStats.refetch();
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
        toast.success("Signal regeneration started");
        signals.refetch();
        episodeStats.refetch();
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

  const fetchTranscript = async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch transcript");
      }
      const jsonData = await response.json();
      setTranscript(jsonData);
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

  if (episode.isLoading) {
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
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to Podcasts
        </Link>
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
  const relatedSignals = (signals.data ?? []).sort((a, b) => {
    const timeA = a.chunk.startTimeSec ?? 0;
    const timeB = b.chunk.startTimeSec ?? 0;
    return timeA - timeB;
  });
  const isProcessing =
    episodeData?.status === "processing" ||
    processEpisode.isPending ||
    reprocessEpisode.isPending;
  const isRegenerating = regenerateSignals.isPending;
  const isProcessed = episodeData?.status === "processed";
  const processButtonLabel = (() => {
    if (isProcessing) return "Processing...";
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
        <Link
          href={
            episodeData?.podcast
              ? `/podcast/${episodeData.podcast.id}`
              : "/podcasts"
          }
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to {episodeData?.podcast?.title || "Podcasts"}
        </Link>

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
          {/* Thumbnail */}
          {episodeData?.thumbnailUrl && (
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image
                src={episodeData.thumbnailUrl}
                alt={episodeData.title}
                className="h-full w-full object-cover"
                fill
              />
            </div>
          )}

          {/* Title and Metadata */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2 text-balance">
              {episodeData?.title}
            </h1>

            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
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
            </dl>

            {/* Action Buttons - Desktop only */}
            <div className="hidden sm:inline-flex gap-2">
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
                      <DialogTitle>Process Episode</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">
                          This will process the episode and create signals:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Fetch transcript from audio</li>
                          <li>Split into semantic chunks (~100-800 words)</li>
                          <li>Identify speakers using AI</li>
                          <li>Generate embeddings and relevance scores</li>
                          <li>Create up to 30 signals for review</li>
                        </ul>
                        <p className="mt-3">
                          <strong>Duration:</strong> Usually 2-5 minutes
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
                            processEpisode.mutate({ episodeId: params.id })
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
                            This will regenerate signals for this episode only:
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
                              <strong>Updated:</strong> Pending signals will be
                              re-scored with your latest preferences
                            </p>
                            <p className="text-blue-600 dark:text-blue-400">
                              <strong>Added:</strong> New signals may be added
                              from previously unselected chunks
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
                              regenerateSignals.mutate({ episodeId: params.id })
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
                            <li>Re-fetch transcript from audio</li>
                            <li>Re-chunk with current settings</li>
                            <li>Re-identify speakers using AI</li>
                            <li>Generate new embeddings</li>
                            <li>Create new signals</li>
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
                              reprocessEpisode.mutate({ episodeId: params.id })
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

              {episodeData?.transcriptUrl && (
                <>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          fetchTranscript(episodeData.transcriptUrl as string)
                        }
                      >
                        <HugeiconsIcon icon={File01Icon} size={16} />
                        View Transcript
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                      <DialogHeader>
                        <DialogTitle>Episode Transcript</DialogTitle>
                      </DialogHeader>
                      <div className="overflow-auto">
                        {transcript && (
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
                      </div>
                    </DialogContent>
                  </Dialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <HugeiconsIcon icon={Download01Icon} size={16} />
                        Download
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a
                          href={episodeData.transcriptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download Transcript
                        </a>
                      </DropdownMenuItem>
                      {episodeData.audioUrl && (
                        <DropdownMenuItem asChild>
                          <a
                            href={episodeData.audioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download Audio
                          </a>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons - Mobile only */}
        <div className="sm:hidden space-y-2">
          {/* Primary Actions */}
          <div className="flex flex-col gap-2">
            {!isProcessed && (
              <Dialog
                open={showProcessDialog}
                onOpenChange={setShowProcessDialog}
              >
                <DialogTrigger asChild>
                  <Button disabled={isProcessing} size="sm" className="w-full">
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
                    <DialogTitle>Process Episode</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        This will process the episode and create signals:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Fetch transcript from audio</li>
                        <li>Split into semantic chunks (~100-800 words)</li>
                        <li>Identify speakers using AI</li>
                        <li>Generate embeddings and relevance scores</li>
                        <li>Create up to 30 signals for review</li>
                      </ul>
                      <p className="mt-3">
                        <strong>Duration:</strong> Usually 2-5 minutes depending
                        on episode length
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
                          processEpisode.mutate({ episodeId: params.id })
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
                          This will regenerate signals for this episode only:
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
                            <strong>Updated:</strong> Pending signals will be
                            re-scored with your latest preferences
                          </p>
                          <p className="text-blue-600 dark:text-blue-400">
                            <strong>Added:</strong> New signals may be added
                            from previously unselected chunks
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
                            regenerateSignals.mutate({ episodeId: params.id })
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
                      className="w-full"
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
                          This will DELETE all existing data and reprocess from
                          scratch:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Delete all transcript chunks</li>
                          <li>Delete all signals (saved and skipped)</li>
                          <li>Delete speaker identification mappings</li>
                          <li>Re-fetch transcript from audio</li>
                          <li>Re-chunk with current settings</li>
                          <li>Re-identify speakers using AI</li>
                          <li>Generate new embeddings</li>
                          <li>Create new signals</li>
                        </ul>

                        {episodeStats.data && episodeStats.data.saved > 0 && (
                          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <p className="font-medium text-destructive mb-1 flex items-center gap-1.5">
                              <HugeiconsIcon icon={AlertCircleIcon} size={16} />
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
                            reprocessEpisode.mutate({ episodeId: params.id })
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
          </div>

          {/* Secondary Actions - Icon Buttons */}
          {episodeData?.transcriptUrl && (
            <div className="flex gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      fetchTranscript(episodeData.transcriptUrl as string)
                    }
                  >
                    <HugeiconsIcon icon={File01Icon} size={16} />
                    <span className="sr-only">View Transcript</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Episode Transcript</DialogTitle>
                  </DialogHeader>
                  <div className="overflow-auto">
                    {transcript && (
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
                  </div>
                </DialogContent>
              </Dialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <HugeiconsIcon icon={Download01Icon} size={16} />
                    <span className="sr-only">Download</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a
                      href={episodeData.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download Transcript
                    </a>
                  </DropdownMenuItem>
                  {episodeData.audioUrl && (
                    <DropdownMenuItem asChild>
                      <a
                        href={episodeData.audioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download Audio
                      </a>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Related Signals */}
      <section className="space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3">
          <h2 className="text-base sm:text-lg font-semibold font-serif">
            Related Signals
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Left side: Tabs */}
            <Tabs
              value={signalFilter}
              onValueChange={(v) => setSignalFilter(v as typeof signalFilter)}
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

            {/* Right side: Action filter and Copy button */}
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
                        episodeStats.data.saved + episodeStats.data.skipped > 0
                          ? episodeStats.data.saved + episodeStats.data.skipped
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
                  className="sm:size-auto sm:h-8 sm:px-3"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                  <span className="hidden sm:inline">Copy Signals</span>
                  <span className="sr-only sm:hidden">Copy Signals</span>
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
            {signalFilter === "pending" && episodeStats.data?.total === 0
              ? "No signals yet. Start processing above and check back after the pipeline finishes."
              : signalFilter === "pending"
                ? "No pending signals. All signals have been processed."
                : signalFilter === "actioned"
                  ? "No processed signals yet. Start reviewing signals to see them here."
                  : "No signals found for this episode."}
          </div>
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
                  speakerLabel={speakerDisplay}
                  startTimeSec={signal.chunk.startTimeSec ?? null}
                  endTimeSec={signal.chunk.endTimeSec ?? null}
                  metadata={metadata}
                  audio={audioSource}
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

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
