"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Clock01Icon,
  Copy01Icon,
  Download01Icon,
  File01Icon,
  FingerPrintIcon,
  InformationCircleIcon,
  Loading03Icon,
  SparklesIcon,
  YoutubeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { SyncYouTubeVideoDialog } from "@/components/blocks/episodes/sync-youtube-video-dialog";
import { FavoriteButton } from "@/components/favorite-button";
import { TranscriptDisplay } from "@/components/transcript-display";
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
  const [showProcessDialog, setShowProcessDialog] = useState(false);

  const episode = useQuery({
    ...trpc.episodes.get.queryOptions({
      episodeId: params.id,
    }),
  });

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
  });

  const processEpisode = useMutation(
    trpc.episodes.processEpisode.mutationOptions({
      onSuccess: () => {
        toast.success("Episode processing started");
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.get.queryKey({ episodeId: params.id }),
        });
        setShowProcessDialog(false);
      },
      onError: (error) => {
        toast.error(`Failed to process episode: ${error.message}`);
        setShowProcessDialog(false);
      },
    }),
  );

  const fetchTranscript = useMutation(
    trpc.episodes.fetchTranscript.mutationOptions({
      onSuccess: (result) => {
        if (result.status === "exists") {
          toast.success("Transcript already available");
        } else {
          toast.success(
            "Transcript fetching started. This usually takes 1-2 minutes.",
          );
        }
        queryClient.invalidateQueries({
          queryKey: trpc.episodes.get.queryKey({ episodeId: params.id }),
        });
      },
      onError: (error) => {
        toast.error(`Failed to fetch transcript: ${error.message}`);
      },
    }),
  );

  const loadTranscriptForDialog = async (url: string) => {
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
  const currentStatus = episodeData?.status;
  const currentErrorMessage = episodeData?.errorMessage;
  const isProcessing = processEpisode.isPending;
  const hasSummary = Boolean(episodeData?.summary?.markdownContent);
  const lastProcessedAt = episodeData?.lastProcessedAt
    ? new Date(episodeData.lastProcessedAt)
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
        text: "Processing in progress. Transcript is being prepared.",
      });
    }
    if (generateSummary.isPending) {
      items.push({ text: "Summary generation in progress." });
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
          "Fetching the transcript and preparing the summary. This usually takes a few minutes depending on length.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: true,
      } as const;
    }
    return null;
  })();

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
                          This will process the episode:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Fetch transcript from audio</li>
                          <li>Generate AI summary (key takeaways & lessons)</li>
                          <li>Identify speakers using AI</li>
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
                            processEpisode.mutate({
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

              {/* Transcript Buttons */}
              {episodeData?.transcriptUrl ? (
                <ButtonGroup>
                  <CopyTranscriptButton
                    transcriptUrl={episodeData.transcriptUrl}
                    speakerMappings={
                      episodeData?.speakerMapping?.speakerMappings
                        ? JSON.parse(episodeData.speakerMapping.speakerMappings)
                        : null
                    }
                  />
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={episodeData.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={16} />
                      Download
                    </a>
                  </Button>
                  <FavoriteButton episodeId={params.id} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <ChevronDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <button
                          type="button"
                          className="w-full"
                          onClick={() =>
                            loadTranscriptForDialog(
                              episodeData.transcriptUrl as string,
                            )
                          }
                        >
                          <HugeiconsIcon icon={File01Icon} size={16} />
                          View Transcript
                        </button>
                      </DropdownMenuItem>
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
                      {episodeData.youtubeVideoUrl ? (
                        <DropdownMenuItem asChild>
                          <a
                            href={episodeData.youtubeVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <HugeiconsIcon icon={YoutubeIcon} size={16} />
                            View on YouTube
                          </a>
                        </DropdownMenuItem>
                      ) : (
                        <SyncYouTubeVideoDialog episodeId={params.id}>
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                          >
                            <HugeiconsIcon icon={YoutubeIcon} size={16} />
                            Sync to YouTube
                          </DropdownMenuItem>
                        </SyncYouTubeVideoDialog>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ButtonGroup>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    fetchTranscript.mutate({ episodeId: params.id })
                  }
                  disabled={fetchTranscript.isPending}
                >
                  {fetchTranscript.isPending ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={Download01Icon} size={16} />
                  )}
                  {fetchTranscript.isPending ? "Fetching..." : "Get Transcript"}
                </Button>
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

      {/* Summary Section */}
      <section className="space-y-4 pt-6">
        <h2 className="text-lg font-semibold">Summary</h2>
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
                    navigator.clipboard.writeText(summary.data.markdownContent);
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
                onClick={() => generateSummary.mutate({ episodeId: params.id })}
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
                Summarize this episode to get key takeaways, examples, lessons,
                and quotes.
              </EmptyDescription>
            </EmptyHeader>

            <EmptyContent>
              <Button
                size="lg"
                onClick={() => processEpisode.mutate({ episodeId: params.id })}
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
      Copy
    </Button>
  );
}
