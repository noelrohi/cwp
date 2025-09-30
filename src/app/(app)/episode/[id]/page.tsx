"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  FileText,
  Loader2,
  Play,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
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
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
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
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Podcasts
        </Link>
        <div className="text-center py-12">
          <div className="text-destructive mb-4">Episode not found</div>
          <p className="text-sm text-muted-foreground">
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
  const statusLabel = episodeData?.status
    ? episodeData.status.replace(/_/g, " ")
    : null;

  console.log(JSON.stringify(relatedSignals));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Back Navigation */}
      <Link
        href={
          episodeData?.podcast
            ? `/podcast/${episodeData.podcast.id}`
            : "/podcasts"
        }
        className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {episodeData?.podcast?.title || "Podcasts"}
      </Link>

      {/* Episode Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        {/* Episode Thumbnail */}
        {episodeData?.thumbnailUrl && (
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-muted">
            <Image
              src={episodeData.thumbnailUrl}
              alt={episodeData.title}
              className="h-full w-full object-cover"
              fill
            />
            {/* Play Button Overlay */}
            {episodeData?.audioUrl && (
              <a
                href={episodeData.audioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 hover:opacity-100"
              >
                <div className="rounded-full bg-background p-3 shadow-lg">
                  <Play className="h-6 w-6 text-black fill-current" />
                </div>
              </a>
            )}
          </div>
        )}

        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-xl font-semibold leading-tight">
                {episodeData?.title}
              </h1>
              {statusLabel && (
                <Badge
                  variant="secondary"
                  className="self-start bg-muted text-muted-foreground hover:bg-muted capitalize"
                >
                  {statusLabel}
                </Badge>
              )}
            </div>

            <dl className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {episodeData?.publishedAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <dt className="sr-only">Published</dt>
                  <dd>
                    {new Date(episodeData.publishedAt).toLocaleDateString(
                      "en-US",
                      {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </dd>
                </div>
              )}
              {episodeData?.durationSec && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <dt className="sr-only">Duration</dt>
                  <dd>{Math.floor(episodeData.durationSec / 60)} min</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
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
                      <FileText className="h-4 w-4 mr-2" />
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
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </Button>
              </>
            )}
            <Button
              onClick={() => processEpisode.mutate({ episodeId: params.id })}
              disabled={isProcessing}
              size="sm"
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Regenerate Signals
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Related Signals */}
      <section className="mt-12 space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold font-serif">Related Signals</h2>
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
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Unable to load related signals.
          </div>
        ) : relatedSignals.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-muted/30 p-6 text-sm text-muted-foreground">
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
