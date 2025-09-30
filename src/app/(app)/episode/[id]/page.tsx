"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Clock01Icon,
  Download01Icon,
  File01Icon,
  Loading03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { TranscriptDisplay } from "@/components/transcript-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTRPC } from "@/server/trpc/client";
import type { TranscriptData } from "@/types/transcript";

export default function EpisodeDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const params = use(props.params);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);

  const episode = useQuery(
    trpc.episodes.get.queryOptions({
      episodeId: params.id,
    }),
  );

  const signals = useQuery(
    trpc.signals.byEpisode.queryOptions({
      episodeId: params.id,
    }),
  );

  const processEpisode = useMutation(
    trpc.episodes.processEpisode.mutationOptions({
      onSuccess: (result) => {
        const isReprocess = result.status === "dispatched";
        toast.success(
          isReprocess
            ? "Episode processing re-run dispatched"
            : "Episode processing started",
        );
        episode.refetch();
        signals.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to process episode: ${error.message}`);
      },
    }),
  );

  const regenerateSignals = useMutation(
    trpc.episodes.regenerateSignals.mutationOptions({
      onSuccess: () => {
        toast.success("Signal regeneration started");
        signals.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to regenerate signals: ${error.message}`);
      },
    }),
  );

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
  const relatedSignals = signals.data ?? [];
  const isProcessing =
    episodeData?.status === "processing" || processEpisode.isPending;
  const isRegenerating = regenerateSignals.isPending;
  const isProcessed = episodeData?.status === "processed";
  const processButtonLabel = (() => {
    if (isProcessing) return "Processing...";
    if (isProcessed) return "Re-run Processing";
    return "Process Episode";
  })();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Back Navigation */}
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

      {/* Episode Header */}
      <div className="space-y-4">
        <div className="flex gap-4">
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

          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2">
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

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => processEpisode.mutate({ episodeId: params.id })}
                disabled={isProcessing}
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
                {processButtonLabel}
              </Button>

              {isProcessed && (
                <Button
                  onClick={() =>
                    regenerateSignals.mutate({ episodeId: params.id })
                  }
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
                            onClose={() => {}}
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
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={episodeData.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={16} />
                      Download
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Related Signals */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-base sm:text-lg font-semibold font-serif">
          Related Signals
        </h2>

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
            No signals yet. Start processing above and check back after the
            pipeline finishes.
          </div>
        ) : (
          <div className="space-y-4">
            {relatedSignals.map((signal) => {
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
                />
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
