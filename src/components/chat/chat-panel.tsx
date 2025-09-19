"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowUpIcon,
  CheckIcon,
  GlobeIcon,
  LayersIcon,
  PlusIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import {
  type MouseEventHandler,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MyUIMessage } from "@/ai/schema";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  type PromptInputMessage,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { useAudioPlayer } from "@/components/providers/audio-player-provider";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useLocalStorage } from "@/hooks/use-local-storage";
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
  const { play } = useAudioPlayer();
  const [input, setInput] = useState("");
  const [model, setModel] = useLocalStorage<string>(
    "chat-model",
    "openrouter/sonoma-dusk-alpha",
  );
  // searchMode picker is always available; button is the trigger
  const [searchMode, setSearchMode] = useLocalStorage<"similarity" | "sonar">(
    "chat-search-mode",
    "similarity",
  );
  const [searchPickerOpen, setSearchPickerOpen] = useState(false);

  // Read URL params for contextual hints (e.g., episodeId)
  const [episodeId] = useQueryState("episodeId");
  const [q, setQ] = useQueryState("q");

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
            // Forward contextual episodeId so the server can narrow tools
            episodeId: episodeId ?? undefined,
          },
        };
      },
    }),
  });

  // Seed initial query from ?q=...
  const _router = useRouter();
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!q) return;
    if (seededRef.current === q) return;
    seededRef.current = q;
    sendMessage({ text: q });
    // Remove q from the URL to avoid re-sending on back/forward
    setQ(null);
  }, [q, sendMessage, setQ]);

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
            messages.map((message) => {
              const sourceParts = message.parts.filter(
                (p) => p.type === "source-url",
              ) as Array<{ type: "source-url"; url?: string; title?: string }>;
              const sourceCount = sourceParts.length;
              return (
                <Message from={message.role} key={message.id}>
                  <MessageContent variant="flat">
                    {message.parts.map((part, i) => {
                      return <MessagePart part={part} key={i} partIndex={i} />;
                    })}
                    {message.role === "assistant" && sourceCount > 0 ? (
                      <Sources>
                        <SourcesTrigger count={sourceCount} />
                        <SourcesContent>
                          {sourceParts.map((p, i) => {
                            const href = p.url ?? "";
                            const title = p.title ?? href;
                            const onClick: MouseEventHandler<
                              HTMLAnchorElement
                            > = (e) => {
                              if (!href) return;
                              // Attempt to play via audio player at the timestamp
                              try {
                                const [base, hash] = href.split("#");
                                const m = /(?:[?#]|^)t=(\d+)/.exec(hash ?? "");
                                const sec = m ? Number(m[1]) : 0;
                                e.preventDefault();
                                void play({
                                  url: base,
                                  title,
                                  startAtSec: sec,
                                });
                              } catch {
                                // fallback to default navigation
                              }
                            };
                            return (
                              <Source
                                key={`${message.id}-src-${i}`}
                                href={href}
                                title={title}
                                onClick={onClick}
                              />
                            );
                          })}
                        </SourcesContent>
                      </Sources>
                    ) : null}
                  </MessageContent>
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <LatestSuggestions
        messages={messages}
        status={status}
        onPick={(text) => {
          sendMessage({ text });
        }}
      />
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
                <Popover
                  open={searchPickerOpen}
                  onOpenChange={setSearchPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <PromptInputButton
                      variant="ghost"
                      onClick={() => setSearchPickerOpen(true)}
                    >
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
                                <span className="text-muted-foreground text-xs">
                                  Search across the internet via Perplexity
                                  Sonar
                                </span>
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
                                <span className="text-muted-foreground text-xs">
                                  Search podcast segments via vector similarity
                                </span>
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
                      {
                        id: "openrouter/sonoma-dusk-alpha",
                        name: "Sonoma Dusk",
                      },
                      {
                        id: "deepseek/deepseek-chat-v3.1:free",
                        name: "DeepSeek Chat v3.1 (Free)",
                      },
                      { id: "openai/gpt-5-low", name: "GPT-5 (Low)" },
                      { id: "openai/gpt-5-medium", name: "GPT-5 (Medium)" },
                      { id: "openai/gpt-5-high", name: "GPT-5 (High)" },
                      {
                        id: "anthropic/claude-sonnet-4",
                        name: "Claude 4 Sonnet",
                      },
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
            Found {data.items?.length || 0} segments
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

function LatestSuggestions({
  messages,
  status,
  onPick,
}: {
  messages: MyUIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  onPick: (text: string) => void;
}) {
  const [dismissedFromMessageId, setDismissedFromMessageId] = useState<
    string | null
  >(null);

  // Get the latest assistant message that has suggestions
  let latest: { id: string; suggestions: string[] } | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const p = m.parts.find((x) => x.type === "data-suggestions");
    if (p && Array.isArray(p.data) && p.data.length > 0) {
      latest = { id: m.id, suggestions: p.data as string[] };
      break;
    }
  }

  // Reset dismissal when a new suggestions message arrives
  const latestId = latest?.id ?? null;
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (latestId && lastIdRef.current !== latestId) {
      setDismissedFromMessageId(null);
      lastIdRef.current = latestId;
    }
  }, [latestId]);

  const shouldShow =
    status === "ready" &&
    latest &&
    latest.suggestions.length > 0 &&
    dismissedFromMessageId !== latest.id;

  if (!shouldShow) return null;

  return (
    <div className="mx-auto mb-3 w-full max-w-3xl px-4">
      <div className="rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium">
          <span className="tracking-tight">Suggested questions</span>
        </div>
        <div className="divide-y">
          {latest?.suggestions.map((s, idx) => (
            <div key={`${idx}-${s}`} className="flex items-center px-4 py-3">
              <div className="flex-1 text-sm text-foreground/90">{s}</div>
              <Button
                size="icon"
                variant="ghost"
                className="ml-2 size-6 rounded-full"
                onClick={() => {
                  onPick(s);
                  setDismissedFromMessageId(latest?.id ?? null);
                }}
                aria-label="Ask this question"
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
