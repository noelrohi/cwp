"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AudioPlayerBar } from "@/components/audio-player-bar";

type PlayInput = {
  url: string;
  title?: string;
  series?: string;
  startAtSec?: number;
  artworkUrl?: string | null;
  endAtSec?: number; // optional clip end bound (auto-pause when reached)
};

type AudioPlayerContextValue = {
  play: (input: PlayInput) => Promise<void>;
  pause: () => void;
  resume: () => void;
  seek: (sec: number) => void;
  stop: () => void;
  state: {
    visible: boolean;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    title?: string;
    url?: string;
    artworkUrl?: string | null;
    series?: string | null;
  };
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | undefined>(
  undefined,
);

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx)
    throw new Error("useAudioPlayer must be used within <AudioPlayerProvider>");
  return ctx;
}

export function AudioPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipEndAtRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [series, setSeries] = useState<string | undefined>();
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [artworkUrl, setArtworkUrl] = useState<string | null | undefined>(
    undefined,
  );

  // Lazily create audio element
  if (!audioRef.current && typeof document !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata";
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onTimeClipGuard = () => {
      const endAt = clipEndAtRef.current;
      if (typeof endAt === "number" && audio.currentTime >= endAt) {
        audio.pause();
        // Reset clip bound after pausing so resume plays beyond if desired
        clipEndAtRef.current = null;
      }
    };
    const onDuration = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("timeupdate", onTimeClipGuard);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("timeupdate", onTimeClipGuard);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const play = useCallback(
    async ({
      url,
      title,
      startAtSec,
      artworkUrl,
      endAtSec,
      series,
    }: PlayInput) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.src !== url) {
        audio.src = url;
      }
      setUrl(url);
      setTitle(title);
      setArtworkUrl(artworkUrl);
      setSeries(series);
      setVisible(true);
      clipEndAtRef.current =
        typeof endAtSec === "number" && endAtSec > 0 ? endAtSec : null;
      try {
        if (typeof startAtSec === "number" && startAtSec >= 0) {
          // Set after metadata if needed
          await audio.play();
          audio.currentTime = startAtSec;
        } else {
          await audio.play();
        }
      } catch {
        // Autoplay may fail; user can hit the play button.
      }
    },
    [],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    void audioRef.current?.play();
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setVisible(false);
  }, []);

  const seek = useCallback((sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(sec, audio.duration || sec));
  }, []);

  const value: AudioPlayerContextValue = useMemo(
    () => ({
      play,
      pause,
      resume,
      stop,
      seek,
      state: {
        visible,
        isPlaying,
        currentTime,
        duration,
        title,
        url,
        artworkUrl,
        series,
      },
    }),
    [
      play,
      pause,
      resume,
      stop,
      seek,
      visible,
      isPlaying,
      currentTime,
      duration,
      title,
      url,
      artworkUrl,
      series,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <AudioPlayerBar />
    </AudioPlayerContext.Provider>
  );
}
