"use client";

import { memo } from "react";
import type { MyUIMessage } from "@/ai/schema";
import { Response } from "@/components/ai-elements/response";
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
