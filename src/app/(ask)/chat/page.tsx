"use client";

import { useChat } from "@ai-sdk/react";
import {
  File01Icon,
  PodcastIcon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  IconAdjustments,
  IconCheck,
  IconCopy,
  IconMessage2Bolt,
  IconRefresh,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { BookmarkIcon, ChevronDown, Sparkles } from "lucide-react";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Fragment, useEffect, useState } from "react";
import type { ChatUIMessage } from "@/app/api/chat/route";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { SignalCard } from "@/components/blocks/signals/signal-card";
import { StreamdownWithSnip } from "@/components/streamdown-with-snip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSidebar } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/server/trpc/client";
import { Action, Actions } from "../../../components/ai-elements/actions";

type ChunkData = {
  content: string;
  podcast: string;
  episode: string;
  speaker: string;
  timestamp: string;
  citation: string;
  similarity: number;
  relevanceScore?: number;
  startTimeSec?: number;
  endTimeSec?: number;
  episodeAudioUrl?: string;
};

function CollapsibleChunks({ chunks }: { chunks: ChunkData[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {chunks.length} source{chunks.length !== 1 ? "s" : ""} retrieved
        </p>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            {isOpen ? "Hide" : "Show"} sources
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-3">
        {chunks.map((chunk, idx) => (
          <SignalCard
            key={`chunk-${idx}`}
            chunkContent={chunk.content}
            speakerLabel={chunk.speaker}
            startTimeSec={chunk.startTimeSec ?? null}
            endTimeSec={chunk.endTimeSec ?? null}
            className="w-full sm:max-w-2xl"
            metadata={[
              { label: chunk.podcast },
              { label: chunk.episode },
              {
                label: `${Math.round(chunk.similarity * 100)}% match`,
              },
            ]}
            audio={
              chunk.episodeAudioUrl && chunk.startTimeSec && chunk.endTimeSec
                ? {
                    id: `${chunk.episode}-${idx}`,
                    title: chunk.episode,
                    subtitle: chunk.podcast,
                    audioUrl: chunk.episodeAudioUrl,
                    startTimeSec: chunk.startTimeSec,
                    endTimeSec: chunk.endTimeSec,
                  }
                : undefined
            }
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { toggleSidebar, isMobile } = useSidebar();
  const trpc = useTRPC();

  const [episodeId] = useQueryState("episodeId", parseAsString);
  const [articleId] = useQueryState("articleId", parseAsString);
  const [useSnipsTool, setUseSnipsTool] = useQueryState(
    "useSnipsTool",
    parseAsBoolean.withDefault(false),
  );
  const [useSignalsTool, setUseSignalsTool] = useQueryState(
    "useSignalsTool",
    parseAsBoolean.withDefault(false),
  );

  const episode = useQuery({
    ...trpc.episodes.get.queryOptions({
      episodeId: episodeId as string,
    }),
    enabled: !!episodeId,
  });

  const article = useQuery({
    ...trpc.articles.getById.queryOptions({
      id: articleId as string,
    }),
    enabled: !!articleId,
  });

  const { messages, sendMessage, status, regenerate } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, id }) => {
        return {
          body: {
            messages,
            id,
            articleId,
            episodeId,
            useSnipsTool: useSnipsTool ?? false,
            useSignalsTool: useSignalsTool ?? false,
          },
        };
      },
    }),
  });

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text?.trim()) {
      sendMessage({ text: message.text });
      setInput("");
    }
  };

  const contextTitle = episode.data?.title || article.data?.title;
  const contextType = episodeId ? "episode" : articleId ? "article" : null;

  const suggestionPrompts = [
    {
      title: "Simulate thought leaders",
      description: "Have Deutsch, Karpathy & Naval analyze your saved content",
      prompt:
        "Review everything in the saved signals and snips. Simulate David Deutsch, Andrej Karpathy, and Naval Ravikant. Have them analyze and discuss what they're finding in everything that's been saved, applying their unique perspectives to challenge the thinking and frameworks.",
    },
    {
      title: "Map knowledge connections",
      description: "Find patterns and themes across your saved signals",
      prompt:
        "Analyze patterns across all my saved signals and create a knowledge map showing how different ideas connect. Identify emerging themes, contradictions, and unexplored connections between concepts.",
    },
    {
      title: "Challenge assumptions",
      description: "Extract contrarian insights from your content",
      prompt:
        "Generate a synthesis of the most contrarian or counter-intuitive insights from my saved content. What assumptions am I making that might be wrong? What perspectives am I missing?",
    },
  ];

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="relative flex size-full flex-col h-dvh overflow-hidden">
      {/* Floating sidebar trigger for mobile only */}
      {isMobile && (
        <Button
          onClick={toggleSidebar}
          size="icon"
          variant="outline"
          className="fixed top-4 left-4 z-50 size-10 rounded-full border border-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70 md:hidden"
        >
          <HugeiconsIcon icon={SidebarLeftIcon} size={20} />
        </Button>
      )}

      <Conversation className="scrollbar-hide">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center">
              <ConversationEmptyState
                className="mt-24"
                icon={<IconMessage2Bolt className="size-12" />}
                title="Start a conversation"
                description="Ask anything about your saved signals"
              />
              <div className="mt-8 w-full max-w-2xl px-4 grid gap-3">
                {suggestionPrompts.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start text-left hover:bg-accent/50 transition-colors"
                    onClick={() => handleSuggestionClick(suggestion.prompt)}
                  >
                    <div className="font-medium text-base mb-1">
                      {suggestion.title}
                    </div>
                    <div className="text-sm text-muted-foreground font-normal">
                      {suggestion.description}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message: ChatUIMessage) => (
              <Message from={message.role} key={message.id} className="group">
                <MessageContent variant="flat">
                  {message.parts.map((part, i: number) => {
                    switch (part.type) {
                      case "data-searchResults":
                        return (
                          <Task
                            key={`${message.id}-search-${i}`}
                            className="mb-4"
                            defaultOpen
                          >
                            <TaskTrigger
                              title={
                                part.data.status === "searching"
                                  ? `Searching for "${part.data.query}"...`
                                  : `Found ${part.data.totalFound} result${part.data.totalFound !== 1 ? "s" : ""} for "${part.data.query}"`
                              }
                            />
                            <TaskContent>
                              {part.data.status === "searching" ? (
                                <TaskItem>
                                  <span className="text-muted-foreground">
                                    Searching your saved podcast content...
                                  </span>
                                </TaskItem>
                              ) : (
                                <TaskItem>
                                  <span className="text-sm text-muted-foreground">
                                    Retrieved {part.data.totalFound} relevant
                                    transcript segments
                                  </span>
                                </TaskItem>
                              )}
                            </TaskContent>
                          </Task>
                        );
                      case "data-retrievedChunks":
                        return (
                          <CollapsibleChunks
                            key={`${message.id}-chunks-${i}`}
                            chunks={part.data.chunks}
                          />
                        );
                      case "data-searchedSnips":
                        return (
                          <Task
                            key={`${message.id}-snips-${i}`}
                            className="mb-4"
                            defaultOpen={false}
                          >
                            <TaskTrigger
                              title={`Found ${part.data.totalFound} snip${part.data.totalFound !== 1 ? "s" : ""} for "${part.data.query}"`}
                            />
                            <TaskContent>
                              <TaskItem>
                                <span className="text-sm text-muted-foreground">
                                  Retrieved {part.data.totalFound} flashcard
                                  {part.data.totalFound !== 1 ? "s" : ""} from
                                  your saved snips
                                </span>
                              </TaskItem>
                            </TaskContent>
                          </Task>
                        );
                      case "data-retrievedSignals":
                        return (
                          <Task
                            key={`${message.id}-signals-${i}`}
                            className="mb-4"
                            defaultOpen={false}
                          >
                            <TaskTrigger
                              title={`Retrieved ${part.data.totalFound} saved signal${part.data.totalFound !== 1 ? "s" : ""}`}
                            />
                            <TaskContent>
                              <TaskItem>
                                <span className="text-sm text-muted-foreground">
                                  Retrieved {part.data.totalFound} saved
                                  highlight
                                  {part.data.totalFound !== 1 ? "s" : ""} from
                                  podcast episodes and articles
                                </span>
                              </TaskItem>
                            </TaskContent>
                          </Task>
                        );
                      case "reasoning":
                        if (part.text === "[REDACTED]") {
                          return null;
                        }
                        return (
                          <Reasoning
                            key={i}
                            className="w-full"
                            isStreaming={part.state === "streaming"}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{part.text}</ReasoningContent>
                          </Reasoning>
                        );
                      case "data-retrievedContent":
                        return (
                          <div
                            key={`${message.id}-content-${i}`}
                            className="mb-4 p-4 rounded-lg bg-muted/50 border"
                          >
                            <div className="flex items-center gap-2">
                              {part.data.status === "loading" ? (
                                <Shimmer className="text-sm font-medium">
                                  Retrieving {part.data.type} content...
                                </Shimmer>
                              ) : (
                                <p className="text-sm font-medium">
                                  Retrieved {part.data.type} content...
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      case "text": {
                        const isLatestAssistant =
                          message.role === "assistant" &&
                          message.id ===
                            messages
                              .filter((m) => m.role === "assistant")
                              .slice(-1)[0]?.id;
                        return (
                          <Fragment key={`${message.id}-${i}`}>
                            {message.role === "assistant" ? (
                              <StreamdownWithSnip
                                content={part.text}
                                articleId={articleId ?? undefined}
                                episodeId={episodeId ?? undefined}
                              />
                            ) : (
                              <Response>{part.text}</Response>
                            )}
                            {message.role === "assistant" &&
                              part.state === "done" && (
                                <Actions
                                  className={cn(
                                    !isLatestAssistant &&
                                      "opacity-0 group-hover:opacity-100 transition-opacity",
                                  )}
                                >
                                  <Action
                                    onClick={() => regenerate()}
                                    label="Retry"
                                    tooltip="Retry"
                                  >
                                    <IconRefresh className="size-4" />
                                  </Action>
                                  <CopyAction text={part.text} />
                                </Actions>
                              )}
                          </Fragment>
                        );
                      }
                      default:
                        return null;
                    }
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "streaming" &&
            !messages
              .slice()
              .reverse()
              .find((msg) => msg.role === "assistant")
              ?.parts.some(
                (part) =>
                  part.type === "text" &&
                  (part.state === "streaming" || part.state === "done"),
              ) && (
              <Message from="assistant">
                <MessageContent variant="flat">
                  <Loader className="text-muted-foreground" />
                </MessageContent>
              </Message>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Sticky prompt input at bottom */}
      <div className="grid shrink-0 gap-4 bg-background">
        <div className="mx-auto w-full max-w-3xl mb-2">
          {contextTitle && contextType && (
            <div className="mb-0 text-xs sm:text-sm text-muted-foreground bg-muted border border-b-0 rounded-t-lg px-3 py-2 w-[calc(100%-0.5rem)] mx-auto flex items-center gap-2">
              <Badge
                variant="outline"
                className="inline-flex items-center shrink-0"
              >
                <HugeiconsIcon
                  icon={contextType === "episode" ? PodcastIcon : File01Icon}
                  size={12}
                  className="sm:mr-1 shrink-0"
                />
                <span className="hidden sm:inline capitalize">
                  {contextType}
                </span>
              </Badge>
              <span>{contextTitle}</span>
            </div>
          )}
          <PromptInput
            onSubmit={handleSubmit}
            className="backdrop-blur-md dark:bg-[#30302E]"
          >
            <PromptInputBody className="border-none">
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
              <PromptInputTextarea
                value={input}
                placeholder="Ask a question..."
                className="md:text-base"
                onChange={(e) => setInput(e.currentTarget.value)}
              />
            </PromptInputBody>
            <PromptInputToolbar className="border-none">
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger>
                    <IconAdjustments className="size-4" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent>
                    <PromptInputActionMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setUseSnipsTool(!useSnipsTool);
                      }}
                    >
                      <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-4" />
                          <span>Search Snips</span>
                        </div>
                        <Switch checked={useSnipsTool} />
                      </div>
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setUseSignalsTool(!useSignalsTool);
                      }}
                    >
                      <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2">
                          <BookmarkIcon className="size-4" />
                          <span>Access Saved Signals</span>
                        </div>
                        <Switch checked={useSignalsTool} />
                      </div>
                    </PromptInputActionMenuItem>
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                {useSnipsTool && (
                  <div
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "pointer-events-none",
                    )}
                  >
                    <Sparkles className="size-3.5" />
                    <span>Snips</span>
                  </div>
                )}
                {useSignalsTool && (
                  <div
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "pointer-events-none",
                    )}
                  >
                    <BookmarkIcon className="size-3.5" />
                    <span>Signals</span>
                  </div>
                )}
              </PromptInputTools>
              <PromptInputSubmit
                status={status === "streaming" ? "streaming" : "ready"}
                disabled={!input.trim()}
              />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

function CopyAction({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
  };

  return (
    <Action
      onClick={handleCopy}
      label={isCopied ? "Copied" : "Copy"}
      tooltip={isCopied ? "Copied" : "Copy"}
    >
      {isCopied ? (
        <IconCheck className="size-4" />
      ) : (
        <IconCopy className="size-4" />
      )}
    </Action>
  );
}
