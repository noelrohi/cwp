"use client";

import {
  ChevronDownIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
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
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground sm:gap-2">
            {metadata.map((item, index) => (
              <span
                key={`${item.label}-${index}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 sm:px-3",
                  item.icon ? "pl-2" : "",
                )}
              >
                {item.icon}
                <span className="truncate max-w-32 sm:max-w-none">
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2 sm:flex-wrap">
          {audio ? (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => void handlePlayClick()}
            >
              {isCurrentTrackEnded ? (
                <RotateCcwIcon className="mr-2 h-4 w-4" />
              ) : isCurrentTrack ? (
                <PauseIcon className="mr-2 h-4 w-4" />
              ) : (
                <PlayIcon className="mr-2 h-4 w-4" />
              )}
              {isCurrentTrackEnded
                ? "Replay"
                : isCurrentTrack
                  ? "Pause"
                  : "Play"}
            </Button>
          ) : null}
          {children}
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-muted/50 p-3 sm:mt-4 sm:p-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
            <span className="font-mono">{timestampLabel ?? "--:--"}</span>
            {resolvedSpeaker && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="font-medium">{resolvedSpeaker}</span>
              </>
            )}
          </div>
          {hasHighlight ? (
            <div className="space-y-2">
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                {highlightContent?.trim()}
              </p>
              <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDownIcon
                      className={cn(
                        "mr-1 h-3 w-3 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                    {isExpanded ? "Hide" : "View"} full context
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 pt-2 border-t border-muted">
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                    {chunkContent.trim()}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
              {chunkContent.trim()}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
