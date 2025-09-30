"use client";

import {
  AiMicIcon,
  ArrowReloadHorizontalIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  Delete01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const trpc = useTRPC();
  const savedQuery = useQuery(trpc.signals.saved.queryOptions());
  const savedCount = savedQuery.data?.length ?? 0;

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold font-serif">Signals</h1>
          <p className="text-muted-foreground">
            Review AI-generated intelligence from your podcasts. Save or skip to
            tune future rankings.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-3xl font-bold font-serif">{savedCount}</div>
          <div className="text-sm text-muted-foreground">Saved</div>
        </div>
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
  const [isSkippingAll, setIsSkippingAll] = useState(false);

  const signalsQuery = useQuery(trpc.signals.list.queryOptions({ limit: 30 }));

  const actionMutation = useMutation(trpc.signals.action.mutationOptions());
  const skipAllMutation = useMutation(trpc.signals.skipAll.mutationOptions());

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

  const handleSkipAll = async () => {
    setIsSkippingAll(true);
    try {
      const result = await skipAllMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: trpc.signals.list.queryKey() });
      toast.success(`Skipped ${result.skippedCount} signals`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to skip signals.";
      toast.error(message);
    } finally {
      setIsSkippingAll(false);
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
      {!isLoading && !fetchError && signals.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkipAll}
            disabled={isSkippingAll}
          >
            {isSkippingAll ? (
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                size={16}
                className="animate-spin"
              />
            ) : (
              <HugeiconsIcon icon={BookmarkRemove01Icon} size={16} />
            )}
            Skip All
          </Button>
        </div>
      )}
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
            const speakerDisplay = signal.speakerName || "Unknown speaker";
            const metadata: SignalCardMetadataItem[] = [];
            if (signal.episode) {
              if (signal.episode.podcast?.title) {
                metadata.push({
                  icon: <HugeiconsIcon icon={AiMicIcon} size={12} />,
                  label: signal.episode.podcast.title,
                });
              }
              metadata.push({
                icon: <HugeiconsIcon icon={Calendar03Icon} size={12} />,
                label: formatDate(signal.episode.publishedAt),
              });
            }
            if (
              signal.relevanceScore !== null &&
              signal.relevanceScore !== undefined
            ) {
              metadata.push({
                icon: <HugeiconsIcon icon={SparklesIcon} size={12} />,
                label: `${Math.round(signal.relevanceScore * 100)}%`,
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
                    <HugeiconsIcon
                      icon={ArrowReloadHorizontalIcon}
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
                      icon={ArrowReloadHorizontalIcon}
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

function SavedSignalsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const audioPlayer = useAudioPlayer();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const savedQuery = useQuery(trpc.signals.saved.queryOptions());
  const unsaveMutation = useMutation(trpc.signals.unsave.mutationOptions());

  const isLoading = savedQuery.isLoading;
  const fetchError = savedQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;
  const savedSignals = savedQuery.data ?? [];

  const handleUnsave = async (savedChunkId: string) => {
    setDeletingId(savedChunkId);
    try {
      await unsaveMutation.mutateAsync({ savedChunkId });
      queryClient.invalidateQueries({
        queryKey: trpc.signals.saved.queryKey(),
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
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
          No saved signals yet. Save signals from the Pending tab to see them
          here.
        </div>
      ) : (
        <section className="space-y-4">
          {savedSignals.map((signal) => {
            const speakerDisplay = signal.speaker ?? "Unknown speaker";
            const metadata: SignalCardMetadataItem[] = [];
            const isDeleting = deletingId === signal.id;

            if (signal.episode.podcast?.title) {
              metadata.push({
                icon: <HugeiconsIcon icon={AiMicIcon} size={12} />,
                label: signal.episode.podcast.title,
              });
            }
            metadata.push({
              icon: <HugeiconsIcon icon={Calendar03Icon} size={12} />,
              label: formatDate(signal.episode.publishedAt),
            });
            if (
              signal.relevanceScore !== null &&
              signal.relevanceScore !== undefined
            ) {
              metadata.push({
                icon: <HugeiconsIcon icon={SparklesIcon} size={12} />,
                label: `${Math.round(signal.relevanceScore * 100)}%`,
              });
            }

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
                      icon={ArrowReloadHorizontalIcon}
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={Delete01Icon} size={16} />
                  )}
                  Remove
                </Button>
              </SignalCard>
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
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 sm:p-6">
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
    <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
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
