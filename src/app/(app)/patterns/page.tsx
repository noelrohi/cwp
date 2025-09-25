"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";

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

export default function PatternsPage() {
  const trpc = useTRPC();
  const { data, error, isLoading, isFetching, refetch } = useQuery(
    trpc.patterns.list.queryOptions({ limit: 50 }),
  );

  const patterns = data ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold font-serif">
            Insight Patterns
          </h1>
          <p className="text-sm text-muted-foreground">
            Scan the latest strategy patterns, then open a record to read the
            full markdown analysis and supporting evidence.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="w-full md:w-auto"
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <ul className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="rounded-lg border bg-background p-4">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-3 h-4 w-1/4" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-destructive/10 px-8 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">
            Failed to load patterns
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "We hit a snag while fetching patterns."}
          </p>
          <Button
            type="button"
            className="mt-6"
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Try again
          </Button>
        </div>
      ) : patterns.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 px-8 py-12 text-center">
          <h2 className="text-lg font-semibold">No patterns yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Once daily insights are generated, they will appear here with links
            to their details and evidence records.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {patterns.map((pattern) => {
            const formattedDate = formatPatternDate(pattern.patternDate);
            return (
              <li key={pattern.id}>
                <Link
                  href={`/patterns/${pattern.id}`}
                  className="group flex items-center justify-between rounded-lg border bg-background px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold leading-tight">
                        {pattern.title}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {pattern.evidences.length} evidence
                        {pattern.evidences.length === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">
                        {pattern.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {pattern.episode?.title ?? "Unknown episode"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {formattedDate ? <span>{formattedDate}</span> : null}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
