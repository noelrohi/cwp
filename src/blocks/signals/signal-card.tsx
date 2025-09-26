"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SignalCardMetadataItem = {
  icon?: ReactNode;
  label: string;
};

export type SignalCardProps = {
  chunkContent: string;
  speakerLabel?: string | null;
  startTimeSec?: number | null;
  metadata?: SignalCardMetadataItem[];
  children?: ReactNode;
  className?: string;
};

export function SignalCard(props: SignalCardProps) {
  const {
    chunkContent,
    speakerLabel,
    startTimeSec,
    metadata = [],
    children,
    className,
  } = props;
  const timestampLabel = formatTimestamp(startTimeSec);
  const resolvedSpeaker = speakerLabel?.trim() ?? null;

  return (
    <article
      className={cn(
        "rounded-xl border border-border/70 bg-background/80 p-6 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {metadata.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            {metadata.map((item, index) => (
              <span
                key={`${item.label}-${index}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1",
                  item.icon ? "pl-2" : "",
                )}
              >
                {item.icon}
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
        {children ? (
          <div className="flex flex-wrap gap-2">{children}</div>
        ) : null}
      </div>
      <div className="mt-4 rounded-lg bg-muted/50 p-4">
        <div className="flex gap-3">
          <span className="text-xs font-mono text-muted-foreground min-w-[4rem]">
            {timestampLabel ?? "--:--"}
          </span>
          <div className="flex-1 space-y-1">
            {resolvedSpeaker ? (
              <div className="text-xs font-medium text-muted-foreground">
                {resolvedSpeaker}
              </div>
            ) : null}
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
              {chunkContent.trim()}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatTimestamp(value?: number | null): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return null;
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
