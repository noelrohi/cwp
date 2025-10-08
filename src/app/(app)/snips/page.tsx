"use client";

import {
  AiMicIcon,
  Calendar03Icon,
  Delete02Icon,
  Edit02Icon,
  FileAttachmentIcon,
  Globe02Icon,
  InformationCircleIcon,
  Loading03Icon,
  MoreVerticalIcon,
  PodcastIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { SnipDialog } from "@/components/snip-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item } from "@/components/ui/item";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate } from "@/lib/signal-utils";
import { useTRPC } from "@/server/trpc/client";

export default function SnipsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const flashcardsQuery = useQuery(trpc.flashcards.list.queryOptions());
  const deleteMutation = useMutation(trpc.flashcards.delete.mutationOptions());

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: trpc.flashcards.list.queryKey(),
      });
      toast.success("Flashcard deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete flashcard.";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const isLoading = flashcardsQuery.isLoading;
  const flashcards = flashcardsQuery.data ?? [];

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold font-serif">Snips</h1>
          <p className="text-muted-foreground">
            Your flashcards from saved signals
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="flex flex-col items-end gap-0.5">
            <div className="font-bold font-serif text-base md:text-3xl">
              {flashcards.length}
            </div>
            <div className="text-muted-foreground text-xs md:text-sm">
              Total
            </div>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-xl border border-border/60 bg-muted/40 p-6 aspect-[3/2]"
            >
              <div className="h-4 w-3/4 rounded bg-muted-foreground/30" />
            </div>
          ))}
        </div>
      ) : flashcards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
          <p className="text-lg mb-2">No flashcards yet</p>
          <p className="text-sm">
            Create flashcards from your saved signals to start learning
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flashcards.map((flashcard) => (
            <FlashcardItem
              key={flashcard.id}
              flashcard={flashcard}
              isDeleting={deletingId === flashcard.id}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </main>
  );
}

type FlashcardWithSignal = {
  id: string;
  signalId: string;
  front: string;
  back: string;
  signal: {
    chunk: {
      episode: {
        id: string;
        title: string;
        publishedAt: string | null;
        podcast: {
          id: string;
          title: string;
        } | null;
      } | null;
      article: {
        id: string;
        title: string;
        url: string;
        siteName: string | null;
        publishedAt: string | null;
      } | null;
    };
  };
};

function FlashcardItem({
  flashcard,
  isDeleting,
  onDelete,
}: {
  flashcard: FlashcardWithSignal;
  isDeleting: boolean;
  onDelete: (id: string) => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const episode = flashcard.signal.chunk.episode;
  const article = flashcard.signal.chunk.article;
  const podcast = episode?.podcast;

  return (
    <article className="relative group">
      <button
        type="button"
        className="relative h-[280px] w-full cursor-pointer bg-transparent border-0 p-0"
        onClick={() => setIsFlipped(!isFlipped)}
        aria-label={isFlipped ? "Show front" : "Show back"}
      >
        <motion.div
          className="absolute inset-0 w-full h-full"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Item
            variant="outline"
            className="absolute inset-0 flex-col justify-between h-full"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="flex-1" />
              {/* biome-ignore lint/a11y/noStaticElementInteractions: Contains only interactive button children */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click stops propagation to parent flip handler */}
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Tooltip open={showInfo} onOpenChange={setShowInfo}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                      <HugeiconsIcon icon={InformationCircleIcon} size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="max-w-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-2 text-xs">
                      {episode ? (
                        <>
                          {episode.title && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon icon={AiMicIcon} size={12} />
                              <Link
                                href={`/episode/${episode.id}`}
                                className="hover:underline truncate"
                              >
                                {episode.title}
                              </Link>
                            </div>
                          )}
                          {podcast?.title && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon icon={PodcastIcon} size={12} />
                              <Link
                                href={`/podcast/${podcast.id}`}
                                className="hover:underline truncate"
                              >
                                {podcast.title}
                              </Link>
                            </div>
                          )}
                          {episode.publishedAt && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon icon={Calendar03Icon} size={12} />
                              <span>{formatDate(episode.publishedAt)}</span>
                            </div>
                          )}
                        </>
                      ) : article ? (
                        <>
                          {article.title && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon
                                icon={FileAttachmentIcon}
                                size={12}
                              />
                              <Link
                                href={`/article/${article.id}`}
                                className="hover:underline truncate"
                              >
                                {article.title}
                              </Link>
                            </div>
                          )}
                          {article.siteName && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon icon={Globe02Icon} size={12} />
                              <span className="truncate">
                                {article.siteName}
                              </span>
                            </div>
                          )}
                          {article.publishedAt && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon icon={Calendar03Icon} size={12} />
                              <span>{formatDate(article.publishedAt)}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground">
                          No source information available
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                      <HugeiconsIcon icon={MoreVerticalIcon} size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <SnipDialog
                      signalId={flashcard.signalId}
                      defaultBack={flashcard.back}
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <HugeiconsIcon icon={Edit02Icon} size={16} />
                          Edit
                        </DropdownMenuItem>
                      }
                    />
                    <DropdownMenuItem
                      onClick={() => onDelete(flashcard.id)}
                      disabled={isDeleting}
                      className="text-destructive focus:text-destructive"
                    >
                      {isDeleting ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <HugeiconsIcon icon={Delete02Icon} size={16} />
                      )}
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center px-6">
              <h3 className="font-semibold text-lg leading-tight text-center">
                {flashcard.front}
              </h3>
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Click to reveal answer
              </p>
            </div>
          </Item>

          <Item
            variant="muted"
            className="absolute inset-0 flex-col justify-between h-full"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="flex-1 flex items-center justify-center overflow-auto px-6">
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line text-center">
                {flashcard.back}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Click to see question
              </p>
            </div>
          </Item>
        </motion.div>
      </button>
    </article>
  );
}
