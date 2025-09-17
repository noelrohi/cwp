"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, CheckIcon, GlobeIcon, LayersIcon, SearchIcon } from "lucide-react";
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
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
} from "@/components/ai-elements/prompt-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

export function ChatPanel({ className }: { className?: string }) {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>("openrouter/sonoma-dusk-alpha");
  // searchMode picker is always available; button is the trigger
  const [searchMode, setSearchMode] = useState<"similarity" | "sonar">(
    "similarity",
  );
  const [searchPickerOpen, setSearchPickerOpen] = useState(false);

  const { messages, sendMessage, status, stop } = useChat<MyUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, id }) {
        return {
          body: {
            messages,
            id,
            model,
            searchMode,
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
              <PromptInputTools className="gap-2">
                <Popover open={searchPickerOpen} onOpenChange={setSearchPickerOpen}>
                  <PopoverTrigger asChild>
                    <PromptInputButton variant="ghost" onClick={() => setSearchPickerOpen(true)}>
                      {searchMode === "sonar" ? (
                        <GlobeIcon className="size-4" />
                      ) : (
                        <LayersIcon className="size-4" />
                      )}
                      <span>Search</span>
                    </PromptInputButton>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search modes..." />
                      <CommandList>
                        <CommandEmpty>No modes found.</CommandEmpty>
                        <CommandGroup heading="Search Mode">
                          <CommandItem
                            value="sonar"
                            onSelect={() => {
                              setSearchMode("sonar");
                              setSearchPickerOpen(false);
                            }}
                          >
                            <div className="flex items-start gap-2 w-full">
                              <GlobeIcon className="mt-0.5 size-4" />
                              <div className="flex min-w-0 flex-col">
                                <span className="font-medium">Web</span>
                                <span className="text-muted-foreground text-xs">Search across the internet via Perplexity Sonar</span>
                              </div>
                              {searchMode === "sonar" ? (
                                <CheckIcon className="ml-auto size-4 opacity-70" />
                              ) : null}
                            </div>
                          </CommandItem>
                          <CommandItem
                            value="similarity"
                            onSelect={() => {
                              setSearchMode("similarity");
                              setSearchPickerOpen(false);
                            }}
                          >
                            <div className="flex items-start gap-2 w-full">
                              <LayersIcon className="mt-0.5 size-4" />
                              <div className="flex min-w-0 flex-col">
                                <span className="font-medium">Similarity</span>
                                <span className="text-muted-foreground text-xs">Search podcast segments via vector similarity</span>
                              </div>
                              {searchMode === "similarity" ? (
                                <CheckIcon className="ml-auto size-4 opacity-70" />
                              ) : null}
                            </div>
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <PromptInputModelSelect
                  value={model}
                  onValueChange={(value) => setModel(value)}
                >
                  <PromptInputModelSelectTrigger>
                    <PromptInputModelSelectValue />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {[
                      { id: "openrouter/sonoma-dusk-alpha", name: "Sonoma Dusk" },
                      {
                        id: "deepseek/deepseek-chat-v3.1:free",
                        name: "DeepSeek Chat v3.1 (Free)",
                      },
                      { id: "openai/gpt-5-low", name: "GPT-5 (Low)" },
                      { id: "openai/gpt-5-medium", name: "GPT-5 (Medium)" },
                      { id: "openai/gpt-5-high", name: "GPT-5 (High)" },
                      { id: "anthropic/claude-sonnet-4", name: "Claude 4 Sonnet" },
                    ].map((m) => (
                      <PromptInputModelSelectItem key={m.id} value={m.id}>
                        {m.name}
                      </PromptInputModelSelectItem>
                    ))}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
              </PromptInputTools>
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
