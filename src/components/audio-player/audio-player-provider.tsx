"use client";

import { Howl } from "howler";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { clampTime } from "@/lib/time";

type AudioTrack = {
  id: string;
  title: string;
  subtitle?: string | null;
  audioUrl: string;
  startTimeSec?: number | null;
  durationSec?: number | null;
};

type AudioPlayerState = {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  error: string | null;
};

type AudioPlayerControls = {
  play: (track: AudioTrack) => Promise<void>;
  toggle: () => Promise<void>;
  seek: (time: number) => void;
  skip: (amount: number) => void;
  cycleRate: () => void;
};

type AudioPlayerContextValue = AudioPlayerState & AudioPlayerControls;

const AudioPlayerContext = createContext<AudioPlayerContextValue | undefined>(
  undefined,
);

const PLAYBACK_RATES = [1, 1.5, 2];

function resolveErrorMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  return "Unable to load audio";
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const howlRef = useRef<Howl | null>(null);
  const rafRef = useRef<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const clearTicker = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startTicker = useCallback(
    (howl: Howl) => {
      clearTicker();
      const update = () => {
        const position = howl.seek();
        if (typeof position === "number") {
          setCurrentTime(position);
        }
        if (howl.playing()) {
          rafRef.current = requestAnimationFrame(update);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(update);
    },
    [clearTicker],
  );

  const disposeHowl = useCallback(() => {
    clearTicker();
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
  }, [clearTicker]);

  useEffect(() => {
    return () => {
      disposeHowl();
    };
  }, [disposeHowl]);

  const play = async (track: AudioTrack) => {
    setCurrentTrack(track);
    setIsLoading(true);
    setError(null);
    setCurrentTime(track.startTimeSec ?? 0);
    if (track.durationSec) {
      setDuration(track.durationSec);
    }

    disposeHowl();

    const targetStart = track.startTimeSec ?? 0;
    const howl = new Howl({
      src: [track.audioUrl],
      html5: true,
      preload: true,
      rate: playbackRate,
    });

    howlRef.current = howl;

    const handlePlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setError(null);
      startTicker(howl);
    };

    const handlePause = () => {
      setIsPlaying(false);
      clearTicker();
      const position = howl.seek();
      if (typeof position === "number") {
        setCurrentTime(position);
      }
    };

    const handleEnd = () => {
      setIsPlaying(false);
      clearTicker();
      const total = howl.duration();
      if (Number.isFinite(total) && total > 0) {
        setCurrentTime(total);
      }
    };

    const handleError = (_id: number, message: unknown) => {
      disposeHowl();
      setError(resolveErrorMessage(message));
      setIsLoading(false);
      setIsPlaying(false);
    };

    howl.on("play", handlePlay);
    howl.on("pause", handlePause);
    howl.on("stop", handlePause);
    howl.on("end", handleEnd);
    howl.on("loaderror", handleError);
    howl.on("playerror", handleError);

    const handleLoad = () => {
      const total = howl.duration();
      if (Number.isFinite(total) && total > 0) {
        setDuration(total);
      }
      const safeDuration =
        Number.isFinite(total) && total > 0
          ? total
          : (track.durationSec ?? Number.POSITIVE_INFINITY);
      const startAt = clampTime(targetStart, 0, safeDuration);
      if (startAt > 0) {
        howl.seek(startAt);
        setCurrentTime(startAt);
      } else {
        const position = howl.seek();
        if (typeof position === "number") {
          setCurrentTime(position);
        }
      }
      howl.play();
    };

    howl.once("load", handleLoad);

    if (howl.state() === "loaded") {
      handleLoad();
    }
  };

  const toggle = async () => {
    const howl = howlRef.current;
    if (!howl) {
      return;
    }
    if (howl.playing()) {
      howl.pause();
      setIsPlaying(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    howl.play();
  };

  const seek = (time: number) => {
    const howl = howlRef.current;
    if (!howl) {
      return;
    }
    const total = howl.duration();
    const safeDuration =
      Number.isFinite(total) && total > 0
        ? total
        : (currentTrack?.durationSec ?? duration);
    const clamped = clampTime(time, 0, safeDuration);
    howl.seek(clamped);
    setCurrentTime(clamped);
  };

  const skip = (amount: number) => {
    seek(currentTime + amount);
  };

  const cycleRate = () => {
    const nextIndex =
      (PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length;
    const nextRate = PLAYBACK_RATES[nextIndex];
    setPlaybackRate(nextRate);
    if (howlRef.current) {
      howlRef.current.rate(nextRate);
    }
  };

  const value: AudioPlayerContextValue = {
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    error,
    play,
    toggle,
    seek,
    skip,
    cycleRate,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error(
      "useAudioPlayer must be used within an AudioPlayerProvider",
    );
  }
  return context;
}
