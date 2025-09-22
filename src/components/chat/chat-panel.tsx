"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon } from "lucide-react";

import { useQueryState } from "nuqs";
import { type MouseEventHandler, useEffect, useRef, useState } from "react";
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
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { useAudioPlayer } from "@/components/providers/audio-player-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import {
  type CategoryKey,
  suggestionsByCategory,
  tabs,
} from "./chat-suggestions";
import { MessagePart } from "./message-part";
import { LatestSuggestions } from "./latest-suggestions";
import { SearchModeSelector } from "./search-mode-selector";
import { ModelSelector } from "./model-selector";

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
  const [_searchPickerOpen, setSearchPickerOpen] = useState(false);

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
                <SearchModeSelector
                  searchMode={searchMode}
                  onSearchModeChange={setSearchMode}
                />

                <ModelSelector model={model} onModelChange={setModel} />
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
