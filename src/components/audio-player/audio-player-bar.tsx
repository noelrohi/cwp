"use client";

import {
  ArrowReloadHorizontalIcon,
  Backward01Icon,
  Forward01Icon,
  Loading03Icon,
  PauseIcon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatTimecode } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAudioPlayer } from "./audio-player-provider";

interface AudioPlayerBarProps {
  className?: string;
}

const AudioPlayerBar = memo(function AudioPlayerBar({
  className,
}: AudioPlayerBarProps) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    error,
    hasReachedEnd,
    toggle,
    skip,
    cycleRate,
    replay,
  } = useAudioPlayer();

  const progressValue = useMemo(() => {
    if (!duration || Number.isNaN(duration) || duration <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const handlePlayPause = useCallback(() => {
    if (hasReachedEnd) {
      void replay();
    } else {
      void toggle();
    }
  }, [hasReachedEnd, replay, toggle]);

  const handleSkipBack = useCallback(() => skip(-10), [skip]);
  const handleSkipForward = useCallback(() => skip(10), [skip]);

  const currentLabel = useMemo(
    () => formatTimecode(currentTime) ?? "0:00",
    [currentTime],
  );
  const durationLabel = useMemo(
    () => formatTimecode(duration) ?? "--:--",
    [duration],
  );

  const playbackRateLabel = useMemo(
    () => `${playbackRate.toFixed(playbackRate % 1 === 0 ? 0 : 1)}x`,
    [playbackRate],
  );

  if (!currentTrack) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-border/80 bg-background/95 supports-[backdrop-filter]:backdrop-blur",
        "sticky bottom-0 left-0 right-0 border-t",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-3 sm:px-6">
        <div className="flex items-center gap-1 sm:gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <div className="text-xs font-medium text-foreground sm:text-sm sm:truncate">
              {currentTrack.title}
            </div>
            {currentTrack.subtitle ? (
              <div className="text-[11px] text-muted-foreground sm:text-xs sm:truncate">
                {currentTrack.subtitle}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={handleSkipBack}
              aria-label="Go back 10 seconds"
            >
              <HugeiconsIcon
                icon={Backward01Icon}
                size={16}
                className="h-3.5 w-3.5 sm:h-4 sm:w-4"
              />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={handlePlayPause}
              aria-label={
                hasReachedEnd ? "Replay" : isPlaying ? "Pause" : "Play"
              }
            >
              {isLoading ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4"
                />
              ) : hasReachedEnd ? (
                <HugeiconsIcon
                  icon={ArrowReloadHorizontalIcon}
                  size={16}
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                />
              ) : isPlaying ? (
                <HugeiconsIcon
                  icon={PauseIcon}
                  size={16}
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                />
              ) : (
                <HugeiconsIcon
                  icon={PlayCircleIcon}
                  size={16}
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={handleSkipForward}
              aria-label="Skip ahead 10 seconds"
            >
              <HugeiconsIcon
                icon={Forward01Icon}
                size={16}
                className="h-3.5 w-3.5 sm:h-4 sm:w-4"
              />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 min-w-[2.5rem] px-1.5 text-[11px] sm:h-9 sm:min-w-[3rem] sm:px-3 sm:text-sm"
              onClick={cycleRate}
              aria-label="Change playback rate"
            >
              {playbackRateLabel}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:gap-3">
          <span className="font-mono text-muted-foreground/90 min-w-[2.5ch] text-[10px] sm:min-w-[3ch] sm:text-xs">
            {currentLabel}
          </span>
          <Progress value={progressValue} className="h-2 flex-1 sm:h-1" />
          <span className="font-mono text-muted-foreground/90 min-w-[3ch] text-right text-[10px] sm:min-w-[4ch] sm:text-xs">
            {durationLabel}
          </span>
        </div>
        {error ? (
          <div className="text-[11px] text-destructive">{error}</div>
        ) : null}
      </div>
    </div>
  );
});

export { AudioPlayerBar };
