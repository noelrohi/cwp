"use client";

import Image from "next/image";
import { useAudioPlayer } from "@/components/providers/audio-player-provider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function AudioPlayerBar() {
  const { state, pause, resume, seek, stop } = useAudioPlayer();
  const {
    visible,
    isPlaying,
    currentTime,
    duration,
    title,
    artworkUrl,
    series,
  } = state;

  const fmt = (s: number) => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  const progress =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        {/* Left: Artwork and Info */}
        <div className="flex items-center gap-3">
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt="artwork"
              width={48}
              height={48}
              className="rounded object-cover"
            />
          ) : (
            <div className="size-12 rounded bg-muted" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {title ?? "Playing"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {series ?? "Podcast"}
            </div>
          </div>
        </div>

        {/* Center: Controls and Progress */}
        <div className="flex flex-1 flex-col items-center gap-2">
          {/* Play/Pause Button */}
          <div>
            {isPlaying ? (
              <Button
                size="icon"
                variant="default"
                onClick={pause}
                className="h-8 w-8"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>
            ) : (
              <Button
                size="icon"
                variant="default"
                onClick={resume}
                className="h-8 w-8"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-label="Play"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>
            )}
          </div>

          {/* Progress Bar and Time */}
          <div className="flex w-full max-w-md items-center gap-2">
            <div className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {fmt(currentTime)}
            </div>
            <div
              className="flex-1 cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percentage = x / rect.width;
                const newTime = percentage * (duration || 0);
                seek(newTime);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  // Seek to middle when using keyboard
                  seek((duration || 0) / 2);
                }
              }}
              role="slider"
              tabIndex={0}
              aria-label="Seek progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <Progress value={progress} className="h-1" />
            </div>
            <div className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {fmt(duration || 0)}
            </div>
          </div>
        </div>

        {/* Right: Close Button */}
        <div>
          <Button
            size="icon"
            variant="outline"
            onClick={stop}
            className="h-8 w-8"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-label="Close"
            >
              <path
                fillRule="evenodd"
                d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
