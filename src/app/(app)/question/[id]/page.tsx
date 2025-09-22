"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type React from "react";
import { use, useCallback, useMemo, useState } from "react";
import { streamdown } from "streamdown";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationQuote,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { useAudioPlayer } from "@/components/providers/audio-player-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { type RouterOutput, useTRPC } from "@/lib/trpc/client";

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
      const status = q.state.data?.status as
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | undefined;
      const done = status === "succeeded" || status === "failed";
      return hasAnswers || done ? false : 2000;
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
  const status = data?.status as
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | undefined;
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
            {status === "failed"
              ? "We couldn’t generate an answer. Please try again."
              : status === "succeeded"
                ? "No answer available for this question. Try rephrasing or broadening the scope."
                : "Generating answers… this may take a few seconds."}
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
  return `${t.slice(0, max - 1).trimEnd()}…`;
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
          const isClip = audioUrl?.startsWith("/mp3/") ?? false;
          const clipDur =
            typeof startSec === "number" && typeof endSec === "number"
              ? Math.max(0, endSec - startSec)
              : undefined;
          const startAt = isClip ? 0 : startSec;
          const endAt = isClip ? clipDur : endSec;
          void play({
            url: audioUrl,
            title,
            series,
            startAtSec: startAt,
            endAtSec: endAt,
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
  queryId: _queryId,
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
  const [, setActiveIndex] = useState<number | undefined>(undefined);
  const items = useMemo(
    () =>
      citations.map((c) => ({
        label: formatMMSS(Number(c.startSec ?? 0), Number(c.endSec ?? null)),
        title: c.chunk.episode?.title ?? "Episode",
        series: c.chunk.episode?.podcast?.title ?? "Series",
        url: (c as { clipUrl?: string }).clipUrl
          ? (c as { clipUrl?: string }).clipUrl
          : c.chunk.episode?.audioUrl
            ? `${c.chunk.episode.audioUrl}#t=${Math.floor(Number(c.startSec ?? 0))}`
            : undefined,
        quote: snippet(c.chunk.text ?? ""),
        startSec: Number(c.startSec ?? 0),
        endSec: typeof c.endSec === "number" ? Number(c.endSec) : undefined,
        audioUrl:
          (c as { clipUrl?: string }).clipUrl ??
          c.chunk.episode?.audioUrl ??
          undefined,
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

        const isClip = item.audioUrl.startsWith("/mp3/");
        const clipDur = Math.max(0, (item.endSec ?? 0) - (item.startSec ?? 0));
        const startAt = isClip ? 0 : start;
        const endAt = isClip ? clipDur || undefined : end;
        void play({
          url: item.audioUrl,
          title: item.title,
          series: item.series,
          startAtSec: startAt,
          endAtSec: endAt,
          artworkUrl: item.thumbnailUrl,
        });
      }
    },
    [items, onPlayback, play],
  );

  const _parsed = useMemo(
    () => parseAnswerWithTimestamps(text, playNearest),
    [text, playNearest],
  );

  // Parse answer text with inline citations
  const parsedAnswer = useMemo(() => {
    return parseAnswerWithInlineCitations(text, items, onPlayback);
  }, [text, items, onPlayback]);

  // Build per-citation items used for inline triggers (keeping for potential future use)
  const _sections = useMemo(() => {
    return buildAnswerSections({ text, items, playNearest });
  }, [text, items, playNearest]);

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
      <div className="text-sm leading-relaxed space-y-3">
        {/* Render parsed answer with inline citations */}
        <div className="space-y-3">{parsedAnswer}</div>
      </div>

      {/* Citations section */}
      {items.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Citations
          </h3>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-md bg-muted/30"
              >
                <div className="flex-shrink-0 text-xs font-mono text-muted-foreground">
                  {item.label}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">
                    {item.title} • {item.series}
                  </div>
                  <div className="text-sm">{item.quote}</div>
                  <CitationPlayButton
                    title={item.title}
                    series={item.series}
                    audioUrl={item.audioUrl}
                    startSec={item.startSec}
                    endSec={item.endSec}
                    thumbnailUrl={item.thumbnailUrl}
                    onPlay={(args) => onPlayback?.(args)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
  let m: RegExpExecArray | null = re.exec(text);
  while (m) {
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
    m = re.exec(text);
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function parseAnswerWithInlineCitations(
  text: string,
  items: Array<{
    label: string;
    title?: string;
    series?: string;
    url?: string;
    quote?: string;
    startSec?: number;
    endSec?: number;
    audioUrl?: string | undefined;
    thumbnailUrl?: string | null;
  }>,
  onPlayback?: (args: {
    startSec?: number;
    endSec?: number;
    audioUrl?: string;
  }) => void,
): React.ReactNode[] {
  const result: React.ReactNode[] = [];

  // Split by lines to handle block quotes and attributions
  const lines = text.split("\n");
  let currentBlockQuote: string[] = [];
  let currentAttribution: string | null = null;
  let quoteIndex = 0;

  const flushBlockQuote = () => {
    if (currentBlockQuote.length > 0 && currentAttribution) {
      // Parse attribution: "- Speaker Name, Episode Title (timestamp)"
      const attrMatch = currentAttribution.match(/^- (.+?), (.+?) \((.+?)\)$/);
      if (attrMatch) {
        const [, speakerName, episodeTitle, timestamp] = attrMatch;

        // Find the corresponding citation item by index or timestamp
        const citationItem =
          items[quoteIndex] ||
          items.find(
            (item) =>
              item.title?.includes(episodeTitle) || item.label === timestamp,
          );

        result.push(
          <div key={`quote-${quoteIndex}`} className="mb-4">
            <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground bg-muted/20 rounded-r-md p-3">
              {currentBlockQuote.join(" ")}
            </blockquote>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                — <strong>{speakerName}</strong>, {episodeTitle} ({timestamp})
              </div>
              {citationItem && (
                <CitationPlayButton
                  title={citationItem.title}
                  series={citationItem.series}
                  audioUrl={citationItem.audioUrl}
                  startSec={citationItem.startSec}
                  endSec={citationItem.endSec}
                  thumbnailUrl={citationItem.thumbnailUrl}
                  onPlay={(args) => onPlayback?.(args)}
                />
              )}
            </div>
          </div>,
        );
        quoteIndex++;
      }

      currentBlockQuote = [];
      currentAttribution = null;
    }
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("> ")) {
      // Start or continue a block quote
      currentBlockQuote.push(trimmedLine.slice(2));
    } else if (trimmedLine.startsWith("- ") && currentBlockQuote.length > 0) {
      // Attribution line following a block quote
      currentAttribution = trimmedLine;
      flushBlockQuote();
    } else if (trimmedLine === "") {
      // Empty line - continue processing
      continue;
    } else {
      // Regular text line
      flushBlockQuote();
      if (trimmedLine) {
        result.push(
          <p key={`text-${result.length}`} className="mb-3 leading-relaxed">
            {trimmedLine}
          </p>,
        );
      }
    }
  }

  // Flush any remaining block quote
  flushBlockQuote();

  return result;
}

// Build markdown-like sections from an LLM answer text.
// Pattern expected from system prompt: summary line(s) followed by a quoted line
// with a [mm:ss] or (mm:ss) timestamp. We extract the quote and pair it with
// the nearest citation item, rendering the quote as a blockquote with an
// inline trigger.
function buildAnswerSections({
  text,
  items,
  playNearest,
}: {
  text: string;
  items: Array<{
    label: string;
    title?: string;
    series?: string;
    url?: string;
    quote?: string;
    startSec?: number;
    endSec?: number;
    audioUrl?: string | undefined;
    thumbnailUrl?: string | null;
  }>;
  playNearest: (mm: number, ss: number) => void;
}) {
  const tsRe = /(\(|\[)(\d{1,2}):(\d{2})(\)|\])/g;
  const sections: Array<{
    summary?: React.ReactNode;
    quote?: string;
    item?: (typeof items)[number];
  }> = [];

  let cursor = 0;
  let m: RegExpExecArray | null = tsRe.exec(text);
  while (m) {
    const start = m.index;
    const end = start + m[0].length;
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const sec = mm * 60 + ss;

    // Summary: everything since last cursor up to the start of the surrounding quote (if found)
    const quoteInfo = extractQuoteBeforeIndex(text, start);
    const summaryStart = cursor;
    const summaryEnd = quoteInfo?.start ?? start;
    const rawSummary = text.slice(summaryStart, summaryEnd).trim();
    const summaryNode = rawSummary
      ? parseAnswerWithTimestamps(rawSummary, playNearest)
      : undefined;

    // Quote: prefer explicit quoted text; fallback to nearest citation chunk
    const nearest = findNearestItemBySec(items, sec);
    const quote = quoteInfo?.text || nearest?.quote || undefined;

    if (summaryNode || quote) {
      sections.push({ summary: summaryNode, quote, item: nearest });
    }

    cursor = end; // move past timestamp
    m = tsRe.exec(text);
  }

  // Tail summary after the last timestamp
  const tail = text.slice(cursor).trim();
  if (tail) {
    sections.push({ summary: parseAnswerWithTimestamps(tail, playNearest) });
  }

  return sections;
}

function extractQuoteBeforeIndex(
  text: string,
  idx: number,
): { text: string; start: number; end: number } | null {
  // Try smart quotes first
  const closeSmart = text.lastIndexOf("”", idx);
  if (closeSmart !== -1) {
    const openSmart = text.lastIndexOf("“", closeSmart - 1);
    if (openSmart !== -1 && openSmart < closeSmart) {
      return {
        text: text.slice(openSmart + 1, closeSmart).trim(),
        start: openSmart,
        end: closeSmart + 1,
      };
    }
  }
  // Fallback to straight quotes
  const close = text.lastIndexOf('"', idx);
  if (close !== -1) {
    const open = text.lastIndexOf('"', close - 1);
    if (open !== -1 && open < close) {
      return {
        text: text.slice(open + 1, close).trim(),
        start: open,
        end: close + 1,
      };
    }
  }
  return null;
}

function findNearestItemBySec(
  items: Array<{
    label: string;
    title?: string;
    series?: string;
    url?: string;
    quote?: string;
    startSec?: number;
    endSec?: number;
    audioUrl?: string | undefined;
    thumbnailUrl?: string | null;
  }>,
  targetSec: number,
) {
  if (!items.length) return undefined;
  let best = items[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const s = Number(it.startSec ?? 0);
    const d = Math.abs(s - targetSec);
    if (d < bestDelta) {
      bestDelta = d;
      best = it;
    }
  }
  return best;
}
