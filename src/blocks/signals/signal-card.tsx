"use client";

import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  PauseIcon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Response } from "@/components/ai-elements/response";
import { useAudioPlayer } from "@/components/audio-player/audio-player-provider";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatTimecode } from "@/lib/time";
import { cn } from "@/lib/utils";

export type SignalCardMetadataItem = {
  icon?: ReactNode;
  label: string;
};

export type SignalCardProps = {
  chunkContent: string;
  highlightContent?: string | null;
  speakerLabel?: string | null;
  startTimeSec?: number | null;
  endTimeSec?: number | null;
  metadata?: SignalCardMetadataItem[];
  audio?: {
    id: string;
    title: string;
    subtitle?: string | null;
    audioUrl: string;
    startTimeSec?: number | null;
    endTimeSec?: number | null;
    durationSec?: number | null;
  };
  children?: ReactNode;
  className?: string;
  snipButton?: ReactNode;
  renderMarkdown?: boolean;
  sourceLink?: {
    type: "episode" | "article";
    id: string;
  };
};

export function SignalCard(props: SignalCardProps) {
  const {
    chunkContent,
    highlightContent,
    speakerLabel,
    startTimeSec,
    endTimeSec,
    metadata = [],
    audio,
    children,
    className,
    snipButton,
    renderMarkdown = false,
    sourceLink,
  } = props;

  const [isExpanded, setIsExpanded] = useState(false);
  const hasHighlight = Boolean(highlightContent);

  const timestampLabel =
    startTimeSec && endTimeSec
      ? `${formatTimecode(startTimeSec)} - ${formatTimecode(endTimeSec)}`
      : formatTimecode(startTimeSec);
  const resolvedSpeaker = speakerLabel?.trim() ?? null;
  const audioPlayer = useAudioPlayer();
  const isCurrentTrack =
    audio && audioPlayer.currentTrack?.id === audio.id && audioPlayer.isPlaying;
  const isCurrentTrackEnded =
    audio &&
    audioPlayer.currentTrack?.id === audio.id &&
    audioPlayer.hasReachedEnd;

  const handlePlayClick = async () => {
    if (!audio) {
      return;
    }
    if (audioPlayer.currentTrack?.id === audio.id) {
      if (audioPlayer.hasReachedEnd) {
        await audioPlayer.replay();
      } else {
        await audioPlayer.toggle();
      }
      return;
    }
    await audioPlayer.play({
      id: audio.id,
      title: audio.title,
      subtitle: audio.subtitle,
      audioUrl: audio.audioUrl,
      startTimeSec: audio.startTimeSec,
      endTimeSec: audio.endTimeSec,
      durationSec: audio.durationSec,
    });
  };

  return (
    <article
      className={cn(
        "rounded-xl border border-border/70 bg-background/80 p-4 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        {metadata.length > 0 ? (
          <div className="grid grid-cols-[1fr,auto] gap-x-3 gap-y-1.5 items-start text-sm font-medium text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-2 min-w-0">
            {/* Mobile: Two-column layout with podcast name full width */}
            {/* Desktop: Horizontal flex layout */}
            {metadata[0] &&
              (sourceLink ? (
                <Link
                  href={
                    sourceLink.type === "episode"
                      ? `/episode/${sourceLink.id}`
                      : `/post/${sourceLink.id}`
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 sm:px-3 min-w-0 max-w-full sm:max-w-md hover:bg-muted transition-colors",
                    metadata[0].icon ? "pl-2" : "",
                  )}
                >
                  {metadata[0].icon && (
                    <span className="shrink-0">{metadata[0].icon}</span>
                  )}
                  <span className="truncate min-w-0">{metadata[0].label}</span>
                </Link>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 sm:px-3 min-w-0 max-w-full sm:max-w-md",
                    metadata[0].icon ? "pl-2" : "",
                  )}
                >
                  {metadata[0].icon && (
                    <span className="shrink-0">{metadata[0].icon}</span>
                  )}
                  <span className="truncate min-w-0">{metadata[0].label}</span>
                </span>
              ))}
            {/* Date and confidence badges - stacked on mobile, inline on desktop */}
            {metadata.length > 1 && (
              <div className="flex flex-col gap-1.5 sm:contents">
                {metadata.slice(1).map((item, index) => (
                  <span
                    key={`${item.label}-${index + 1}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 sm:px-3 sm:whitespace-nowrap",
                      item.icon ? "pl-2" : "",
                    )}
                  >
                    {item.icon && <span className="shrink-0">{item.icon}</span>}
                    <span className="break-words line-clamp-2 sm:truncate">
                      {item.label}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {audio ? (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => void handlePlayClick()}
            >
              {isCurrentTrackEnded ? (
                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} />
              ) : isCurrentTrack ? (
                <HugeiconsIcon icon={PauseIcon} size={16} />
              ) : (
                <HugeiconsIcon icon={PlayCircleIcon} size={16} />
              )}
              {isCurrentTrackEnded
                ? "Replay"
                : isCurrentTrack
                  ? "Pause"
                  : "Play"}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 rounded-lg bg-muted/50 p-3 sm:mt-4 sm:p-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
            {timestampLabel && (
              <span className="font-mono">{timestampLabel}</span>
            )}
            {resolvedSpeaker && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="font-medium">{resolvedSpeaker}</span>
              </>
            )}
          </div>
          {hasHighlight ? (
            <div className="space-y-2">
              {renderMarkdown ? (
                <Response
                  className="text-base leading-relaxed text-foreground/90"
                  allowedImagePrefixes={[]}
                >
                  {highlightContent?.trim()}
                </Response>
              ) : (
                <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-line">
                  {highlightContent?.trim()}
                </p>
              )}
              <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className={cn(
                        "mr-1 h-3 w-3 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                    {isExpanded ? "Hide" : "View"} full context
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 pt-2 border-t border-muted">
                  {renderMarkdown ? (
                    <Response
                      className="leading-relaxed text-muted-foreground"
                      allowedImagePrefixes={[]}
                    >
                      {chunkContent.trim()}
                    </Response>
                  ) : (
                    <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
                      {chunkContent.trim()}
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : renderMarkdown ? (
            <Response
              className="text-base leading-relaxed text-foreground/90"
              allowedImagePrefixes={[]}
            >
              {chunkContent.trim()}
            </Response>
          ) : (
            <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-line">
              {chunkContent.trim()}
            </p>
          )}
        </div>
      </div>
      {children || snipButton ? (
        <div className="mt-3 flex gap-2 sm:mt-4">
          {children}
          {snipButton}
        </div>
      ) : null}
    </article>
  );
}
