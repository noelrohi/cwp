"use client";

import {
  Loader2,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatTimecode } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAudioPlayer } from "./audio-player-provider";

interface AudioPlayerBarProps {
  className?: string;
}

export function AudioPlayerBar({ className }: AudioPlayerBarProps) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    error,
    toggle,
    skip,
    cycleRate,
  } = useAudioPlayer();

  const progressValue = useMemo(() => {
    if (!duration || Number.isNaN(duration) || duration <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  if (!currentTrack) {
    return null;
  }

  const currentLabel = formatTimecode(currentTime) ?? "0:00";
  const durationLabel = formatTimecode(duration) ?? "--:--";

  return (
    <div
      className={cn(
        "border-border/80 bg-background/95 supports-[backdrop-filter]:backdrop-blur",
        "sticky bottom-0 left-0 right-0 border-t",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {currentTrack.title}
            </div>
            {currentTrack.subtitle ? (
              <div className="truncate text-xs text-muted-foreground">
                {currentTrack.subtitle}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => skip(-10)}
              aria-label="Go back 10 seconds"
            >
              <SkipBackIcon className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={() => {
                void toggle();
              }}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <PauseIcon className="h-4 w-4" />
              ) : (
                <PlayIcon className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => skip(10)}
              aria-label="Skip ahead 10 seconds"
            >
              <SkipForwardIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={cycleRate}
              aria-label="Change playback rate"
            >
              {`${playbackRate.toFixed(playbackRate % 1 === 0 ? 0 : 1)}x`}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono text-muted-foreground/90 min-w-[3ch]">
            {currentLabel}
          </span>
          <Progress value={progressValue} className="h-1 flex-1" />
          <span className="font-mono text-muted-foreground/90 min-w-[4ch] text-right">
            {durationLabel}
          </span>
        </div>
        {error ? (
          <div className="text-[11px] text-destructive">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
