"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon } from "lucide-react";
import { memo, useState } from "react";
import type { MyUIMessage } from "@/ai/schema";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import { Task, TaskContent, TaskItem, TaskTrigger } from "../ai-elements/task";
import {
  type CategoryKey,
  suggestionsByCategory,
  tabs,
} from "./chat-suggestions";

export function ChatPanel({
  className,
  initialMessages,
}: {
  className?: string;
  initialMessages?: MyUIMessage[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop } = useChat<MyUIMessage>({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, id }) {
        return {
          body: {
            message: messages[messages.length - 1],
            id,
          },
        };
      },
    }),
  });

  const [category, setCategory] = useState<CategoryKey>("growth");

  const handleSubmit = ({ files }: PromptInputMessage, e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage({ files, text: trimmed });
    setInput("");
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className={cn(
        "mx-auto flex h-full min-w-3xl max-w-3xl flex-col",
        className,
      )}
    >
      <Conversation className="flex-1">
        <ConversationContent>
          {!hasMessages ? (
            <ConversationEmptyState className="items-start justify-start p-0 text-left">
              <div className="mx-auto mt-20 flex w-full max-w-2xl flex-col justify-center px-2 py-10 sm:px-0 sm:py-12">
                <h2 className="text-balance font-bold font-serif text-2xl tracking-tight sm:text-3xl">
                  {`How can I help you?`}
                </h2>

                <div className="mt-5 flex flex-wrap gap-2">
                  {tabs.map((t) => (
                    <Button
                      key={t.key}
                      className="rounded-full"
                      size="sm"
                      variant={category === t.key ? "default" : "outline"}
                      onClick={() => setCategory(t.key)}
                    >
                      {t.icon}
                      {t.label}
                    </Button>
                  ))}
                </div>

                <div className="mt-6 overflow-hidden rounded-xl">
                  {suggestionsByCategory[category].map((suggestion, i, arr) => (
                    <div key={suggestion}>
                      <button
                        className={cn(
                          "w-full text-left",
                          "px-1 py-4 text-sm sm:text-base",
                          "text-foreground/80 hover:text-foreground",
                        )}
                        onClick={() => {
                          sendMessage({ text: suggestion });
                        }}
                        type="button"
                      >
                        {suggestion}
                      </button>
                      {i < arr.length - 1 ? (
                        <Separator className="opacity-60" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent variant="flat">
                  {message.parts.map((part, i) => {
                    return <MessagePart part={part} key={i} partIndex={i} />;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
      </Conversation>
      <div className="sticky inset-x-0 bottom-0 z-10 mx-auto w-full px-4 pb-0">
        <PromptInput
          onSubmit={handleSubmit}
          className="rounded-b-none border-4 border-primary border-b-0 bg-transparent backdrop-blur-xl"
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Type your message here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <PromptInputToolbar className="relative px-2 pt-0 pb-2">
              <PromptInputTools className="gap-2"></PromptInputTools>
              <PromptInputSubmit
                status={status}
                onClick={status === "streaming" ? stop : undefined}
                type={status === "streaming" ? "button" : "submit"}
              >
                <ArrowUpIcon className="size-4" />
              </PromptInputSubmit>
            </PromptInputToolbar>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}

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
    return (
      <Task>
        <TaskTrigger title={part.data.text} />
        <TaskContent>
          <TaskItem>Found {part.data.items?.length} segments.</TaskItem>
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
