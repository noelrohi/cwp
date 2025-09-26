"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useAudioPlayer } from "@/components/audio-player/audio-player-provider";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/lib/time";
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
  audio?: {
    id: string;
    title: string;
    subtitle?: string | null;
    audioUrl: string;
    startTimeSec?: number | null;
    durationSec?: number | null;
  };
  children?: ReactNode;
  className?: string;
};

export function SignalCard(props: SignalCardProps) {
  const {
    chunkContent,
    speakerLabel,
    startTimeSec,
    metadata = [],
    audio,
    children,
    className,
  } = props;
  const timestampLabel = formatTimecode(startTimeSec);
  const resolvedSpeaker = speakerLabel?.trim() ?? null;
  const audioPlayer = useAudioPlayer();
  const isCurrentTrack =
    audio && audioPlayer.currentTrack?.id === audio.id && audioPlayer.isPlaying;

  const handlePlayClick = async () => {
    if (!audio) {
      return;
    }
    if (audioPlayer.currentTrack?.id === audio.id) {
      await audioPlayer.toggle();
      return;
    }
    await audioPlayer.play({
      id: audio.id,
      title: audio.title,
      subtitle: audio.subtitle,
      audioUrl: audio.audioUrl,
      startTimeSec: audio.startTimeSec,
      durationSec: audio.durationSec,
    });
  };

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
        <div className="flex flex-wrap gap-2">
          {audio ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handlePlayClick()}
            >
              {isCurrentTrack ? (
                <PauseIcon className="mr-2 h-4 w-4" />
              ) : (
                <PlayIcon className="mr-2 h-4 w-4" />
              )}
              {isCurrentTrack ? "Pause" : "Play"}
            </Button>
          ) : null}
          {children}
        </div>
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
