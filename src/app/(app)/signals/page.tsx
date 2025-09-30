"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkXIcon,
  CalendarDaysIcon,
  Loader2,
  PodcastIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { useAudioPlayer } from "@/components/audio-player/audio-player-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/server/trpc/client";

type SignalAction = "saved" | "skipped";

export default function SignalsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold font-serif sm:text-xl">Signals</h1>
        <p className="text-sm text-muted-foreground">
          Review AI-generated intelligence from your podcasts. Save or skip to
          tune future rankings.
        </p>
      </header>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="saved">Saved</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <PendingSignalsTab />
        </TabsContent>

        <TabsContent value="saved" className="mt-6">
          <SavedSignalsTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function PendingSignalsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const audioPlayer = useAudioPlayer();
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SignalAction | null>(null);

  const signalsQuery = useQuery(trpc.signals.list.queryOptions({ limit: 30 }));

  const actionMutation = useMutation(trpc.signals.action.mutationOptions());

  const handleAction = async (signalId: string, action: SignalAction) => {
    setPendingSignalId(signalId);
    setPendingAction(action);
    try {
      await actionMutation.mutateAsync({ signalId, action });
      queryClient.invalidateQueries({ queryKey: trpc.signals.list.queryKey() });
      toast.success(action === "saved" ? "Signal saved" : "Signal skipped");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update signal.";
      toast.error(message);
    } finally {
      setPendingSignalId(null);
      setPendingAction(null);
    }
  };

  const isLoading = signalsQuery.isLoading;
  const fetchError = signalsQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;
  const signals = (signalsQuery.data ?? []).sort((a, b) => {
    // First sort by episode publish date (most recent first)
    const dateA = a.episode?.publishedAt
      ? new Date(a.episode.publishedAt)
      : new Date(0);
    const dateB = b.episode?.publishedAt
      ? new Date(b.episode.publishedAt)
      : new Date(0);
    const dateComparison = dateB.getTime() - dateA.getTime();

    if (dateComparison !== 0) return dateComparison;

    // If dates are the same, sort by timestamp within episode (earliest first)
    const timestampA = a.chunk.startTimeSec ?? 0;
    const timestampB = b.chunk.startTimeSec ?? 0;
    return timestampA - timestampB;
  });

  // Preload audio for unique episodes when signals are loaded
  useEffect(() => {
    if (signals.length > 0) {
      const uniqueAudioUrls = Array.from(
        new Set(
          signals
            .map((signal) => signal.episode?.audioUrl)
            .filter((url): url is string => Boolean(url)),
        ),
      );
      if (uniqueAudioUrls.length > 0) {
        audioPlayer.preloadAudio(uniqueAudioUrls);
      }
    }
  }, [signals, audioPlayer]);

  return (
    <>
      {isLoading ? (
        <SignalSkeletonList />
      ) : fetchError ? (
        <ErrorState message={fetchErrorMessage} />
      ) : signals.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="space-y-4">
          {signals.map((signal) => {
            const isPending = pendingSignalId === signal.id;
            const inferredSpeakerName = signal.speakerName?.trim();
            const speakerLabel = signal.chunk.speaker?.trim();

            const getSpeakerDisplay = () => {
              if (
                inferredSpeakerName &&
                inferredSpeakerName.length > 0 &&
                !inferredSpeakerName.startsWith("Speaker ")
              ) {
                return inferredSpeakerName;
              }

              if (speakerLabel && /^\d+$/.test(speakerLabel)) {
                const speakerNum = Number.parseInt(speakerLabel, 10);
                if (speakerNum === 0) {
                  return "Host";
                } else {
                  return `Guest ${speakerNum}`;
                }
              }

              if (speakerLabel) {
                return `Speaker ${speakerLabel}`;
              }

              return "Unknown speaker";
            };

            const speakerDisplay = getSpeakerDisplay();
            const metadata: SignalCardMetadataItem[] = [];
            if (signal.episode) {
              if (signal.episode.podcast?.title) {
                metadata.push({
                  icon: <PodcastIcon className="h-3 w-3" />,
                  label: signal.episode.podcast.title,
                });
              }
              metadata.push({
                icon: <CalendarDaysIcon className="h-3 w-3" />,
                label: formatDate(signal.episode.publishedAt),
              });
            }
            const audioSource = signal.episode?.audioUrl
              ? {
                  id: `${signal.id}-${signal.chunk.id}`,
                  title:
                    signal.episode.title ??
                    signal.title ??
                    signal.episode.podcast?.title ??
                    "Episode",
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
                className="border-border bg-background/70"
                chunkContent={signal.chunk.content}
                speakerLabel={speakerDisplay}
                startTimeSec={signal.chunk.startTimeSec ?? null}
                endTimeSec={signal.chunk.endTimeSec ?? null}
                metadata={metadata}
                audio={audioSource}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleAction(signal.id, "skipped")}
                  disabled={isPending}
                >
                  {isPending && pendingAction === "skipped" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkXIcon className="mr-2 h-4 w-4" />
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkCheckIcon className="mr-2 h-4 w-4" />
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

function SavedSignalsTab() {
  const trpc = useTRPC();
  const audioPlayer = useAudioPlayer();

  const savedQuery = useQuery(trpc.signals.saved.queryOptions());

  const isLoading = savedQuery.isLoading;
  const fetchError = savedQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;
  const savedSignals = savedQuery.data ?? [];

  useEffect(() => {
    if (savedSignals.length > 0) {
      const uniqueAudioUrls = Array.from(
        new Set(
          savedSignals
            .map((signal) => signal.episode.audioUrl)
            .filter((url): url is string => Boolean(url)),
        ),
      );
      if (uniqueAudioUrls.length > 0) {
        audioPlayer.preloadAudio(uniqueAudioUrls);
      }
    }
  }, [savedSignals, audioPlayer]);

  return (
    <>
      {isLoading ? (
        <SignalSkeletonList />
      ) : fetchError ? (
        <ErrorState message={fetchErrorMessage} />
      ) : savedSignals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground sm:p-10">
          No saved signals yet. Save signals from the Pending tab to see them
          here.
        </div>
      ) : (
        <section className="space-y-4">
          {savedSignals.map((signal) => {
            const speakerDisplay = signal.speaker ?? "Unknown speaker";
            const metadata: SignalCardMetadataItem[] = [];
            if (signal.episode.podcast?.title) {
              metadata.push({
                icon: <PodcastIcon className="h-3 w-3" />,
                label: signal.episode.podcast.title,
              });
            }
            metadata.push({
              icon: <CalendarDaysIcon className="h-3 w-3" />,
              label: formatDate(signal.episode.publishedAt),
            });

            const audioSource = signal.episode.audioUrl
              ? {
                  id: `saved-${signal.id}`,
                  title: signal.episode.title ?? "Episode",
                  subtitle: speakerDisplay,
                  audioUrl: signal.episode.audioUrl,
                  startTimeSec: signal.startTimeSec ?? undefined,
                  endTimeSec: signal.endTimeSec ?? undefined,
                }
              : undefined;

            return (
              <SignalCard
                key={signal.id}
                className="border-border bg-background/70"
                chunkContent={signal.content}
                highlightContent={signal.highlightQuote}
                speakerLabel={speakerDisplay}
                startTimeSec={signal.startTimeSec}
                endTimeSec={signal.endTimeSec}
                metadata={metadata}
                audio={audioSource}
              />
            );
          })}
        </section>
      )}
    </>
  );
}

function SignalSkeletonList() {
  return (
    <section className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-background/70 p-4 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Skeleton className="h-6 w-24 rounded-full sm:w-28" />
              <Skeleton className="h-6 w-28 rounded-full sm:w-32" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-16 sm:w-20" />
              <Skeleton className="h-9 w-16 sm:w-20" />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-muted/50 p-3 sm:mt-4 sm:p-4">
            <div className="space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <Skeleton className="h-3 w-12 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-4/5 rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:p-6">
      <h2 className="mb-2 font-medium text-destructive">
        Unable to load signals
      </h2>
      <p className="text-muted-foreground">
        {message ?? "Something went wrong. Please try again soon."}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground sm:p-10">
      No pending signals right now. Check back after the next daily run.
    </div>
  );
}

function formatDate(value: Date | string | null): string {
  if (!value) return "Unknown date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
