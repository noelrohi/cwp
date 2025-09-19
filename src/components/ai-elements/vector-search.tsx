"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/server/qa/generate";

type VectorSearchData = {
  status: "processing" | "complete" | "error";
  text: string;
  items?: Array<{
    text: string;
    score: number;
    startMs: number;
    endMs: number;
    episodeId: string;
  }>;
  query?: string;
  limit?: number;
  episodeId?: string;
  podcastExternalId?: string;
  duration?: number;
  totalResults?: number;
};

export type VectorSearchProps = ComponentProps<"div"> & {
  data: {
    status: "processing" | "complete" | "error";
    text: string;
    items?: unknown[];
    query?: string;
    limit?: number;
    episodeId?: string;
    podcastExternalId?: string;
    duration?: number;
    totalResults?: number;
  };
};

const getStatusIcon = (status: VectorSearchData["status"]) => {
  const icons = {
    processing: <ClockIcon className="size-4 animate-pulse text-blue-500" />,
    complete: <CheckCircleIcon className="size-4 text-green-600" />,
    error: <XCircleIcon className="size-4 text-red-600" />,
  } as const;

  return icons[status];
};

const getStatusBadge = (status: VectorSearchData["status"]) => {
  const labels = {
    processing: "Searching",
    complete: "Complete",
    error: "Error",
  } as const;

  const variants = {
    processing: "secondary",
    complete: "default",
    error: "destructive",
  } as const;

  return (
    <Badge variant={variants[status]} className="gap-1.5">
      {getStatusIcon(status)}
      {labels[status]}
    </Badge>
  );
};

export const VectorSearch = ({
  className,
  data,
  ...props
}: VectorSearchProps) => {
  const {
    status,
    text,
    items = [],
    query,
    limit,
    episodeId,
    podcastExternalId,
    duration,
    totalResults,
  } = data;

  return (
    <div
      className={cn("not-prose mb-4 rounded-md border", className)}
      {...props}
    >
      <Collapsible defaultOpen={status === "processing"}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <SearchIcon className="size-4 text-muted-foreground" />
            <div className="text-left">
              <div className="font-medium text-sm">{text}</div>
              {query && (
                <div className="text-muted-foreground text-xs">
                  Query: "{query}"{episodeId && " (scoped to episode)"}
                  {limit && ` • Limit: ${limit}`}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(status)}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {status === "complete" && items.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-muted-foreground text-xs">
                  <span>Found {totalResults || items.length} results</span>
                  {duration && <span>in {duration}ms</span>}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {items.slice(0, 5).map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-md border bg-muted/30 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="font-medium text-xs text-muted-foreground">
                          Segment {idx + 1}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Score: {item.score.toFixed(3)}</span>
                          <span>
                            {formatTimestamp(item.startMs / 1000)} -{" "}
                            {formatTimestamp(item.endMs / 1000)}
                          </span>
                        </div>
                      </div>
                      <div className="text-foreground line-clamp-3">
                        {item.text}
                      </div>
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div className="text-center text-muted-foreground text-xs py-2">
                      ... and {items.length - 5} more results
                    </div>
                  )}
                </div>
              </div>
            )}

            {status === "complete" && items.length === 0 && (
              <div className="text-center text-muted-foreground py-4">
                No relevant segments found
              </div>
            )}

            {status === "error" && (
              <div className="text-center text-destructive py-4">
                Error occurred during search
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
