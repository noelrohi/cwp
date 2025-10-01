"use client";

import {
  AiMicIcon,
  BodyPartMuscleIcon,
  BookmarkCheck01Icon,
  BookmarkRemove01Icon,
  Calendar03Icon,
  Copy01Icon,
  Delete01Icon,
  FilterIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { useAudioPlayer } from "@/components/audio-player/audio-player-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/server/trpc/client";

type SignalAction = "saved" | "skipped";

export default function SignalsPage() {
  const trpc = useTRPC();
  const savedQuery = useQuery(trpc.signals.saved.queryOptions());
  const metricsQuery = useQuery(trpc.signals.metrics.queryOptions());

  const savedCount = savedQuery.data?.length ?? 0;
  const skippedCount = metricsQuery.data?.totalSkipped ?? 0;

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold font-serif">Signals</h1>
          <p className="hidden text-muted-foreground md:block">
            Review signals from your podcasts. Save or skip to improve
            recommendations.
          </p>
        </div>
        <div className="flex gap-3 text-sm md:gap-6">
          <div className="flex flex-col items-end gap-0.5 md:gap-1">
            <div className="font-bold font-serif text-base md:text-3xl">
              {savedCount}
            </div>
            <div className="text-muted-foreground text-xs md:text-sm">
              Saved
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 md:gap-1">
            <div className="font-bold font-serif text-base text-muted-foreground/70 md:text-3xl">
              {skippedCount}
            </div>
            <div className="text-muted-foreground text-xs md:text-sm">
              Skipped
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
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("all");
  const [selectedConfidence, setSelectedConfidence] = useState<string>("all");

  const episodesQuery = useQuery(
    trpc.signals.episodesWithSignals.queryOptions(),
  );
  const signalsQuery = useQuery(
    trpc.signals.list.queryOptions({
      limit: 100,
      episodeId: selectedEpisodeId !== "all" ? selectedEpisodeId : undefined,
    }),
  );

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

  const handleSkipAll = async () => {
    setIsSkippingAll(true);
    try {
      const signalIds = signals.map((s) => s.id);

      await Promise.all(
        signalIds.map((signalId) =>
          actionMutation.mutateAsync({ signalId, action: "skipped" }),
        ),
      );

      queryClient.invalidateQueries({ queryKey: trpc.signals.list.queryKey() });
      toast.success(`Skipped ${signalIds.length} signals`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to skip signals.";
      toast.error(message);
    } finally {
      setIsSkippingAll(false);
    }
  };

  const handleCopySignals = () => {
    const signalsText = signals
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
      `Copied ${signals.length} signal${signals.length !== 1 ? "s" : ""} to clipboard`,
    );
  };

  const isLoading = signalsQuery.isLoading;
  const fetchError = signalsQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;

  const allSignals = useMemo(() => {
    return (signalsQuery.data ?? []).sort((a, b) => {
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
  }, [signalsQuery.data]);

  const episodeOptions = useMemo(() => {
    return (episodesQuery.data ?? []).map((episode) => ({
      id: episode.id,
      title: episode.title,
      podcastTitle: episode.podcast.title,
      count: episode.signalCount,
    }));
  }, [episodesQuery.data]);

  const totalSignalsCount = useMemo(() => {
    return episodeOptions.reduce((sum, ep) => sum + ep.count, 0);
  }, [episodeOptions]);

  // Filter signals by confidence only (episode filtering is server-side)
  const signals = useMemo(() => {
    let filtered = allSignals;

    if (selectedConfidence !== "all") {
      filtered = filtered.filter((signal) => {
        const score = signal.relevanceScore ?? 0;
        switch (selectedConfidence) {
          case "high":
            return score >= 0.65;
          case "medium":
            return score >= 0.5 && score < 0.65;
          case "low":
            return score < 0.5;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [allSignals, selectedConfidence]);

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
      {!isLoading && !fetchError && episodeOptions.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Select
              value={selectedEpisodeId}
              onValueChange={setSelectedEpisodeId}
            >
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue placeholder="Filter by episode">
                  {selectedEpisodeId === "all" ? (
                    `All Episodes (${totalSignalsCount} signals)`
                  ) : (
                    <div className="flex flex-col items-start overflow-hidden text-left">
                      <span className="font-medium truncate w-full">
                        {
                          episodeOptions.find((e) => e.id === selectedEpisodeId)
                            ?.title
                        }
                      </span>
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {
                          episodeOptions.find((e) => e.id === selectedEpisodeId)
                            ?.podcastTitle
                        }
                      </span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Episodes ({totalSignalsCount} signals)
                </SelectItem>
                {episodeOptions.map((episode) => (
                  <SelectItem key={episode.id} value={episode.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{episode.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {episode.podcastTitle} · {episode.count} signals
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedConfidence}
              onValueChange={setSelectedConfidence}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Confidence</SelectItem>
                <SelectItem value="high">High (≥65%)</SelectItem>
                <SelectItem value="medium">Medium (50-65%)</SelectItem>
                <SelectItem value="low">Low (&lt;50%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {signals.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Showing {signals.length} signal{signals.length !== 1 ? "s" : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopySignals}>
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                  Copy Signals
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkipAll}
                  disabled={isSkippingAll || signals.length === 0}
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
                  Skip All ({signals.length})
                </Button>
              </div>
            </div>
          )}
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
                icon: <HugeiconsIcon icon={BodyPartMuscleIcon} size={12} />,
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

function SavedSignalsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const audioPlayer = useAudioPlayer();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("all");

  const savedQuery = useQuery(trpc.signals.saved.queryOptions());
  const unsaveMutation = useMutation(trpc.signals.unsave.mutationOptions());

  const isLoading = savedQuery.isLoading;
  const fetchError = savedQuery.error;
  const fetchErrorMessage =
    fetchError && fetchError instanceof Error ? fetchError.message : undefined;
  const allSavedSignals = savedQuery.data ?? [];

  const episodeOptions = useMemo(() => {
    const episodeMap = new Map<
      string,
      { id: string; title: string; podcastTitle: string; count: number }
    >();

    allSavedSignals.forEach((signal) => {
      const episodeId = signal.episode.id;
      const existing = episodeMap.get(episodeId);
      if (existing) {
        existing.count++;
      } else {
        episodeMap.set(episodeId, {
          id: episodeId,
          title: signal.episode.title || "Untitled Episode",
          podcastTitle: signal.episode.podcast?.title || "Unknown Podcast",
          count: 1,
        });
      }
    });

    return Array.from(episodeMap.values()).sort((a, b) => b.count - a.count);
  }, [allSavedSignals]);

  // Filter signals by selected episode
  const savedSignals = useMemo(() => {
    if (selectedEpisodeId === "all") {
      return allSavedSignals;
    }
    return allSavedSignals.filter(
      (signal) => signal.episode.id === selectedEpisodeId,
    );
  }, [allSavedSignals, selectedEpisodeId]);

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
      {!isLoading && !fetchError && allSavedSignals.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <HugeiconsIcon
            icon={FilterIcon}
            size={16}
            className="text-muted-foreground"
          />
          <Select
            value={selectedEpisodeId}
            onValueChange={setSelectedEpisodeId}
          >
            <SelectTrigger className="w-full sm:w-[400px]">
              <SelectValue placeholder="Filter by episode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All Episodes ({allSavedSignals.length} signals)
              </SelectItem>
              {episodeOptions.map((episode) => (
                <SelectItem key={episode.id} value={episode.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{episode.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {episode.podcastTitle} · {episode.count} signals
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {isLoading ? (
        <SignalSkeletonList />
      ) : fetchError ? (
        <ErrorState message={fetchErrorMessage} />
      ) : allSavedSignals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
          No saved signals yet. Save signals from the Pending tab to see them
          here.
        </div>
      ) : savedSignals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
          No signals found for this episode.
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
                      icon={Loading03Icon}
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

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
