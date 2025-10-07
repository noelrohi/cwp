"use client";

import { useChat } from "@ai-sdk/react";
import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconMessage2Bolt } from "@tabler/icons-react";
import { DefaultChatTransport } from "ai";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ChatUIMessage } from "@/app/api/chat/route";
import { SignalCard } from "@/blocks/signals/signal-card";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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

  const { messages, sendMessage, status } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text?.trim()) {
      sendMessage({ text: message.text });
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-svh">
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

      {/* Scrollable conversation area with bottom padding for fixed input */}
      <Conversation className="flex-1 pb-[120px]">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              className="mt-24"
              icon={<IconMessage2Bolt className="size-12" />}
              title="Start a conversation"
              description="Ask anything about your saved signals"
            />
          ) : (
            messages.map((message: ChatUIMessage) => (
              <Message from={message.role} key={message.id}>
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
                      case "text":
                        return (
                          <Response key={`${message.id}-${i}`}>
                            {part.text}
                          </Response>
                        );
                      default:
                        return null;
                    }
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Fixed prompt input at bottom */}
      <div className="absolute bottom-0 inset-x-0 p-4 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={handleSubmit}>
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
                {/* <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu> */}
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
