"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type React from "react";
import { use, useCallback, useMemo, useState } from "react";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
} from "@/components/ai-elements/inline-citation";
import { useAudioPlayer } from "@/components/providers/audio-player-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RouterOutput, useTRPC } from "@/lib/trpc/client";

export default function QuestionPage({ params }: PageProps<"/question/[id]">) {
  const { id } = use(params);
  const trpc = useTRPC();
  const baseOptions = trpc.questions.getById.queryOptions({
    queryId: id,
  });
  const { data, isLoading } = useQuery({
    ...baseOptions,
    refetchInterval: (q) => {
      const hasAnswers = (q.state.data?.answers?.length ?? 0) > 0;
      return hasAnswers ? false : 2000;
    },
  });
  const feedbackAggQuery = useQuery(
    trpc.feedback.listForQuery.queryOptions({ queryId: id }),
  );
  const submitFeedback = useMutation(
    trpc.feedback.submit.mutationOptions({
      onSuccess: () => feedbackAggQuery.refetch(),
    }),
  );
  const logPlayback = useMutation(trpc.feedback.logPlayback.mutationOptions());

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="rounded-lg border bg-background p-4 text-sm">
          Loading question…
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="rounded-lg border bg-background p-4 text-sm">
          Question not found.
        </div>
      </main>
    );
  }

  const title = (data?.queryText ?? "").slice(0, 200);
  const answers = data?.answers ?? [];

  console.log("[ Answers ]", answers);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <article className="mb-6">
        <header className="mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="mb-2 text-2xl font-bold tracking-tight">
                {title}
              </h1>
              <div className="text-xs text-muted-foreground">
                asked{" "}
                {timeAgo(String(data?.createdAt ?? new Date().toISOString()))}
              </div>
            </div>
          </div>
        </header>
      </article>

      <Separator className="mb-6" />

      <section>
        <h2 className="mb-4 text-xl font-semibold">
          {answers.length} {answers.length === 1 ? "Answer" : "Answers"}
        </h2>

        {answers.length === 0 ? (
          <div className="rounded-lg border bg-background p-4 text-sm">
            Generating answers… this may take a few seconds.
          </div>
        ) : (
          answers.map((answer) => (
            <AnswerCard
              key={answer.answerId}
              queryId={id}
              answerId={answer.answerId}
              text={answer.answerText}
              citations={answer.citations}
              feedbackAgg={
                feedbackAggQuery.data?.find(
                  (f) => f.answerId === answer.answerId,
                ) ?? {
                  answerId: answer.answerId,
                  helpful: 0,
                  unhelpful: 0,
                }
              }
              onVote={(signal) =>
                submitFeedback.mutate({
                  queryId: id,
                  answerId: answer.answerId,
                  signal,
                })
              }
              onPlayback={({ startSec, endSec, audioUrl }) =>
                logPlayback.mutate({
                  queryId: id,
                  answerId: answer.answerId,
                  startSec,
                  endSec,
                  audioUrl,
                })
              }
            />
          ))
        )}
      </section>
    </main>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMMSS(start?: number, end?: number | null): string {
  const fmt = (s: number) => {
    const sec = Math.max(0, Math.floor(Number(s || 0)));
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const r = (sec % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };
  if (typeof end === "number" && !Number.isNaN(end) && end > 0) {
    return `${fmt(start ?? 0)}–${fmt(end)}`;
  }
  return fmt(start ?? 0);
}

function snippet(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function CitationPlayButton({
  title,
  series,
  audioUrl,
  startSec,
  endSec,
  thumbnailUrl,
  onPlay,
}: {
  title?: string;
  series?: string;
  audioUrl?: string;
  startSec?: number;
  endSec?: number;
  thumbnailUrl?: string | null;
  onPlay?: (args: {
    startSec?: number;
    endSec?: number;
    audioUrl?: string;
  }) => void;
}) {
  const { play } = useAudioPlayer();
  if (!audioUrl) return null;
  return (
    <div className="pt-2">
      <Button
        size="sm"
        onClick={() => {
          onPlay?.({ startSec, endSec, audioUrl });
          void play({
            url: audioUrl,
            title,
            series,
            startAtSec: startSec,
            endAtSec: endSec,
            artworkUrl: thumbnailUrl,
          });
        }}
      >
        Play {formatMMSS(startSec ?? 0)}
        {typeof endSec === "number" ? `–${formatMMSS(endSec)}` : ""}
      </Button>
    </div>
  );
}

type FeedbackCounts = { answerId: string; helpful: number; unhelpful: number };

type GetById = NonNullable<RouterOutput["questions"]["getById"]>;

function AnswerCard({
  queryId,
  answerId,
  text,
  citations,
  feedbackAgg,
  onVote,
  onPlayback,
}: {
  queryId: string;
  answerId: string;
  text: string;
  citations: GetById["answers"][number]["citations"];
  feedbackAgg: FeedbackCounts;
  onVote: (signal: "helpful" | "unhelpful") => void;
  onPlayback: (args: {
    startSec?: number;
    endSec?: number;
    audioUrl?: string;
  }) => void;
}) {
  const { play } = useAudioPlayer();
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const items = useMemo(
    () =>
      citations.map((c) => ({
        label: formatMMSS(Number(c.startSec ?? 0), Number(c.endSec ?? null)),
        title: c.chunk.episode?.title ?? "Episode",
        series: c.chunk.episode?.podcast?.title ?? "Series",
        url: c.chunk.episode?.audioUrl
          ? `${c.chunk.episode.audioUrl}#t=${Math.floor(Number(c.startSec ?? 0))}`
          : undefined,
        quote: snippet(c.chunk.text ?? ""),
        startSec: Number(c.startSec ?? 0),
        endSec: typeof c.endSec === "number" ? Number(c.endSec) : undefined,
        audioUrl: c.chunk.episode?.audioUrl,
        thumbnailUrl: c.chunk.episode?.thumbnailUrl,
      })),
    [citations],
  );

  const DEFAULT_CLIP_SEC = 30;

  const playNearest = useCallback(
    (mm: number, ss: number) => {
      const targetSec = mm * 60 + ss;
      if (!items.length) return;
      let bestIndex = 0;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (let i = 0; i < items.length; i++) {
        const d = Math.abs((items[i].startSec ?? 0) - targetSec);
        if (d < bestDelta) {
          bestDelta = d;
          bestIndex = i;
        }
      }
      const item = items[bestIndex];
      setActiveIndex(bestIndex);
      const start = item.startSec ?? targetSec;
      const end =
        typeof item.endSec === "number" && item.endSec > start
          ? item.endSec
          : start + DEFAULT_CLIP_SEC;
      if (item.audioUrl) {
        onPlayback?.({ startSec: start, endSec: end, audioUrl: item.audioUrl });
        console.log("Playing audio with data:", {
          title: item.title,
          series: item.series,
          audioUrl: item.audioUrl,
        });

        void play({
          url: item.audioUrl,
          title: item.title,
          series: item.series,
          startAtSec: start,
          endAtSec: end,
          artworkUrl: item.thumbnailUrl,
        });
      }
    },
    [items, onPlayback, play],
  );

  const parsed = useMemo(
    () => parseAnswerWithTimestamps(text, playNearest),
    [text, playNearest],
  );

  const { helpful, unhelpful } = feedbackAgg;
  const [voted, setVoted] = useState<"helpful" | "unhelpful" | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(`cwp:voted:${answerId}`);
    return v === "helpful" || v === "unhelpful" ? v : null;
  });
  const handleVote = (signal: "helpful" | "unhelpful") => {
    if (!voted) {
      onVote(signal);
      try {
        window.localStorage.setItem(`cwp:voted:${answerId}`, signal);
      } catch {}
      setVoted(signal);
    }
  };

  return (
    <article className="mb-4 rounded-md border p-3">
      <div className="text-sm leading-relaxed">
        <InlineCitation>
          <InlineCitationText>{parsed}</InlineCitationText>
          {items.length > 0 && (
            <InlineCitationCard>
              <InlineCitationCardTrigger sources={items.map((i) => i.label)} />
              <InlineCitationCardBody>
                <InlineCitationCarousel activeIndex={activeIndex}>
                  <InlineCitationCarouselHeader>
                    <InlineCitationCarouselPrev />
                    <InlineCitationCarouselNext />
                    <InlineCitationCarouselIndex />
                  </InlineCitationCarouselHeader>
                  <InlineCitationCarouselContent>
                    {items.map((citation, index) => (
                      <InlineCitationCarouselItem key={index}>
                        <InlineCitationSource
                          title={citation.title}
                          url={citation.url}
                          description={citation.label}
                        />
                        {citation.quote && (
                          <InlineCitationQuote>
                            {citation.quote}
                          </InlineCitationQuote>
                        )}
                        <CitationPlayButton
                          title={citation.title}
                          series={citation.series}
                          audioUrl={citation.audioUrl ?? undefined}
                          startSec={citation.startSec}
                          endSec={citation.endSec}
                          thumbnailUrl={citation.thumbnailUrl}
                          onPlay={(args) => onPlayback?.(args)}
                        />
                      </InlineCitationCarouselItem>
                    ))}
                  </InlineCitationCarouselContent>
                </InlineCitationCarousel>
              </InlineCitationCardBody>
            </InlineCitationCard>
          )}
        </InlineCitation>
      </div>
      {/* Feedback */}
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant={voted === "helpful" ? "default" : "outline"}
          onClick={() => handleVote("helpful")}
          disabled={!!voted}
        >
          <ThumbsUp className="mr-1 h-4 w-4" /> {helpful}
        </Button>
        <Button
          size="sm"
          variant={voted === "unhelpful" ? "destructive" : "outline"}
          onClick={() => handleVote("unhelpful")}
          disabled={!!voted}
        >
          <ThumbsDown className="mr-1 h-4 w-4" /> {unhelpful}
        </Button>
      </div>
    </article>
  );
}

function parseAnswerWithTimestamps(
  text: string,
  onClick: (mm: number, ss: number) => void,
) {
  const re = /(\(|\[)(\d{1,2}):(\d{2})(\)|\])/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [full, , mmStr, ssStr] = m;
    const start = m.index;
    const end = start + full.length;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const mm = Number(mmStr);
    const ss = Number(ssStr);
    const label = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    nodes.push(
      <button
        key={`ts-${start}`}
        type="button"
        className="text-primary underline underline-offset-2 hover:opacity-80"
        onClick={() => onClick(mm, ss)}
      >
        ({label})
      </button>,
    );
    lastIndex = end;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
