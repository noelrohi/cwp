"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, BadgeInfo, Loader2 } from "lucide-react";
import Link from "next/link";
import { use } from "react";

import { Response } from "@/components/ai-elements/response";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/server/trpc/client";

function formatPatternDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const clamped = Math.max(0, Math.floor(value));
  const minutes = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (clamped % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatPercentage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

export default function PatternDetailPage(
  props: PageProps<"/patterns/[patternId]">,
) {
  const params = use(props.params);
  const trpc = useTRPC();

  const patternQuery = useQuery(
    trpc.patterns.byId.queryOptions({ id: params.patternId }),
  );

  if (patternQuery.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="mt-4 h-20 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </main>
    );
  }

  if (patternQuery.error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link
          href="/patterns"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patterns
        </Link>

        <div className="flex flex-col items-center justify-center rounded-xl border bg-destructive/10 px-8 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Pattern unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {patternQuery.error.message ||
              "We couldn’t load this pattern right now. Try refreshing."}
          </p>
          <Button
            type="button"
            className="mt-6"
            onClick={() => patternQuery.refetch()}
            disabled={patternQuery.isFetching}
          >
            {patternQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Retry
          </Button>
        </div>
      </main>
    );
  }

  const pattern = patternQuery.data;
  if (!pattern) {
    return null;
  }
  const generatedAt = formatPatternDate(pattern.patternDate);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/patterns"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patterns
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BadgeInfo className="h-4 w-4" />
          {generatedAt ? `Generated ${generatedAt}` : "Pattern generated"}
        </div>
      </div>

      <header className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold leading-snug">
            {pattern.title}
          </h1>
          <Badge variant="outline" className="capitalize">
            {pattern.status}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {pattern.evidences.length} evidence record
            {pattern.evidences.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          {pattern.episode ? (
            <span>
              Anchored in {pattern.episode.title}
              {pattern.episode.series ? ` · ${pattern.episode.series}` : ""}
            </span>
          ) : (
            <span>Episode metadata unavailable</span>
          )}
        </div>
      </header>

      <section className="mb-8 rounded-xl border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Insight
        </h2>
        <div className="mt-3 text-sm leading-6">
          <Response>{pattern.insightMarkdown}</Response>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence
            </h2>
            <Badge variant="secondary" className="text-xs">
              {pattern.evidences.length}
            </Badge>
          </div>
          {patternQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {pattern.evidences.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No supporting clips saved for this pattern.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {pattern.evidences.map((evidence) => {
              const timestamp = formatSeconds(evidence.showAtSec);
              const confidence = formatPercentage(evidence.confidence);

              return (
                <div
                  key={evidence.id}
                  className="rounded-lg border border-border/70 bg-muted/40 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant={
                        evidence.evidenceType === "entity"
                          ? "outline"
                          : "default"
                      }
                      className="capitalize"
                    >
                      {evidence.evidenceType}
                    </Badge>
                    {evidence.episodeTitle ? (
                      <span>{evidence.episodeTitle}</span>
                    ) : null}
                    {evidence.podcastTitle ? (
                      <span>· {evidence.podcastTitle}</span>
                    ) : null}
                    {timestamp ? <span>· {timestamp}</span> : null}
                  </div>

                  <p className="mt-3 text-sm leading-6">{evidence.content}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {evidence.speaker ? (
                      <span>Speaker: {evidence.speaker}</span>
                    ) : null}
                    {evidence.entityLabel ? (
                      <span>
                        Entity: {evidence.entityLabel}
                        {evidence.entityCategory
                          ? ` (${evidence.entityCategory})`
                          : ""}
                      </span>
                    ) : null}
                    {confidence ? <span>Confidence {confidence}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
