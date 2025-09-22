"use client";

import { PlayIcon } from "lucide-react";
import { memo } from "react";
import type { MyUIMessage } from "@/ai/schema";
import { Response } from "@/components/ai-elements/response";
import { useAudioPlayer } from "@/components/providers/audio-player-provider";
import { Button } from "@/components/ui/button";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import { Task, TaskContent, TaskItem, TaskTrigger } from "../ai-elements/task";

interface Props {
  part: MyUIMessage["parts"][number];
  partIndex: number;
  isStreaming?: boolean;
}

export const MessagePart = memo(function MessagePart({
  part,
  isStreaming,
}: Props) {
  const { play } = useAudioPlayer();
  if (part.type === "data-vector-search") {
    const data = part.data;
    return (
      <Task>
        <TaskTrigger title={data.text} />
        <TaskContent>
          {data.query && (
            <TaskItem>
              <strong>Query:</strong> "{data.query}"
              {data.episodeId && " (scoped to episode)"}
              {data.limit && ` • Limit: ${data.limit}`}
            </TaskItem>
          )}
          <TaskItem>
            Found {JSON.stringify(part.data.items, null, 2)} segments
            {data.duration && ` in ${data.duration}ms`}
          </TaskItem>
        </TaskContent>
      </Task>
    );
  }
  if (part.type === "data-episode-details") {
    const data = part.data;
    return (
      <Task>
        <TaskTrigger title="Episode details" />
        <TaskContent>
          <TaskItem>{data.text}</TaskItem>
        </TaskContent>
      </Task>
    );
  }
  if (part.type === "data-answers") {
    const data = part.data as MyUIMessage["parts"][number]["data"] & {
      items?: Array<{
        id: string;
        quote: string;
        guestName?: string | null;
        episodeTitle?: string | null;
        audioUrl?: string | null;
        startMs?: number | null;
        endMs?: number | null;
      }>;
    };
    const items = data.items ?? [];
    return (
      <div className="not-prose my-2 space-y-2">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">
          Answers
        </div>
        <div className="grid gap-2">
          {items.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3"
            >
              <div className="flex-1">
                <p className="text-sm">“{a.quote}”</p>
                <div className="mt-1 text-muted-foreground text-xs">
                  {a.guestName ? a.guestName : "Unknown guest"}
                  {a.episodeTitle ? ` • ${a.episodeTitle}` : ""}
                </div>
              </div>
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!a.audioUrl) return;
                    const startAtSec = Math.max(
                      0,
                      Math.floor((a.startMs ?? 0) / 1000),
                    );
                    const endAtSec = a.endMs
                      ? Math.max(0, Math.floor(a.endMs / 1000))
                      : undefined;
                    void play({
                      url: a.audioUrl,
                      title: a.episodeTitle ?? undefined,
                      startAtSec,
                      endAtSec,
                    });
                  }}
                >
                  <PlayIcon className="mr-1 size-3.5" />
                  Play
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // Suggestions are rendered separately at the bottom.
  if (part.type === "data-suggestions") return null;
  if (part.type === "text") {
    return <Response>{part.text}</Response>;
  }
  if (part.type === "reasoning") {
    return (
      <Reasoning className="w-full" isStreaming={isStreaming ?? false}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }
  return null;
});
