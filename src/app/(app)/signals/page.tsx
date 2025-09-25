"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkXIcon,
  CalendarDaysIcon,
  Loader2,
  PodcastIcon,
  TrophyIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
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
            return (
              <article
                key={signal.id}
                className="rounded-xl border border-border bg-background/70 p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold leading-tight">
                        {signal.title}
                      </h2>
                      <Badge
                        variant="secondary"
                        className="inline-flex items-center gap-1 text-xs"
                      >
                        <TrophyIcon className="h-3 w-3" />
                        {Math.round(signal.relevanceScore * 100)}
                      </Badge>
                    </div>
                    {signal.episode && (
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <PodcastIcon className="h-3 w-3" />
                          {signal.episode.podcast?.title ?? "Unknown podcast"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDaysIcon className="h-3 w-3" />
                          {formatDate(signal.episode.publishedAt)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
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
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <p className="leading-relaxed text-muted-foreground">
                    {signal.summary}
                  </p>
                  {signal.excerpt && (
                    <blockquote className="border-l-2 border-muted pl-3 italic text-muted-foreground/90">
                      "{signal.excerpt}"
                    </blockquote>
                  )}
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-medium text-primary underline-offset-4 transition hover:underline">
                      Show transcript context
                    </summary>
                    <p className="mt-2 rounded-lg border border-dashed border-muted/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                      {signal.chunk.content}
                    </p>
                  </details>
                </div>
              </article>
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
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
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
