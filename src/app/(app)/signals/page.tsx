"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkXIcon,
  CalendarDaysIcon,
  Loader2,
  PodcastIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  SignalCard,
  type SignalCardMetadataItem,
} from "@/blocks/signals/signal-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/server/trpc/client";

type SignalAction = "saved" | "skipped";

export default function SignalsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
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
  const signals = signalsQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold font-serif">Today's Signals</h1>
        <p className="text-sm text-muted-foreground">
          Review the AI-generated intelligence pulled from your follow list.
          Saving or skipping tunes tomorrow's rankings.
        </p>
      </header>

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
            const speakerDisplay =
              inferredSpeakerName && inferredSpeakerName.length > 0
                ? inferredSpeakerName
                : speakerLabel
                  ? `Speaker ${speakerLabel}`
                  : "Unknown speaker";
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
                metadata={metadata}
                audio={audioSource}
              >
                <Button
                  variant="outline"
                  size="sm"
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
    </main>
  );
}

function SignalSkeletonList() {
  return (
    <section className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-background/70 p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-muted/50 p-4">
            <div className="flex gap-3">
              <Skeleton className="h-3 w-12 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-4/5 rounded" />
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
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
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
    <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-10 text-center text-sm text-muted-foreground">
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
