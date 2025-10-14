"use client";

import {
  AiMicIcon,
  ArrowExpand02Icon,
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
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { SnipDialog } from "@/components/snip-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza";
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
import type { RouterOutput } from "@/server/trpc/client";

export function FlashcardItem({
  flashcard,
  isDeleting,
  onDelete,
}: {
  flashcard: RouterOutput["flashcards"]["list"][number];
  isDeleting: boolean;
  onDelete: (id: string) => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showExpandDialog, setShowExpandDialog] = useState(false);
  const episode = flashcard.signal?.chunk?.episode;
  const article = flashcard.signal?.chunk?.article;
  const podcast = episode?.podcast;
  const isStandalone = !episode && !article && flashcard.source;

  return (
    <article className="relative group">
      <div
        className="relative w-full cursor-pointer h-[280px]"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("[data-no-flip]")) {
            setIsFlipped(!isFlipped);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsFlipped(!isFlipped);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={isFlipped ? "Show front" : "Show back"}
      >
        <motion.div
          className="w-full h-full"
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
            <div className="flex items-center justify-between gap-2 w-full">
              {flashcard.tags && flashcard.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {flashcard.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: Contains only interactive button children */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click stops propagation to parent flip handler */}
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8"
                  onClick={() => setShowExpandDialog(true)}
                >
                  <HugeiconsIcon icon={ArrowExpand02Icon} size={16} />
                </Button>

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
                      {isStandalone ? (
                        <>
                          {flashcard.source && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon
                                icon={FileAttachmentIcon}
                                size={12}
                              />
                              <span className="truncate">
                                {flashcard.source}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <HugeiconsIcon icon={Calendar03Icon} size={12} />
                            <span>{formatDate(flashcard.createdAt)}</span>
                          </div>
                        </>
                      ) : episode ? (
                        <>
                          {episode.title && (
                            <div className="flex items-center gap-2">
                              <HugeiconsIcon icon={AiMicIcon} size={12} />
                              <Link
                                href={`/episode/${episode.id}?tab=signals&filter=actioned&action=saved`}
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
                                href={`/podcast/${podcast.id}?tab=signals&filter=actioned&action=saved`}
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
                                href={`/post/${article.id}?tab=signals&filter=actioned&action=saved`}
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
                      signalId={flashcard.signalId ?? undefined}
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

            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3">
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
            className="absolute inset-0 flex-col justify-between h-full overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="flex-1 flex items-start justify-center overflow-y-auto px-6 py-6">
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line text-left w-full line-clamp-6">
                {flashcard.back}
              </p>
            </div>
            <div className="text-center shrink-0 space-y-2">
              {flashcard.back.length > 300 && (
                <button
                  type="button"
                  data-no-flip
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowExpandDialog(true);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  See full content
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Click to see question
              </p>
            </div>
          </Item>
        </motion.div>
      </div>

      <Credenza open={showExpandDialog} onOpenChange={setShowExpandDialog}>
        <CredenzaContent className="sm:max-w-5xl flex flex-col max-h-[80vh]">
          <CredenzaHeader className="shrink-0">
            <CredenzaTitle className="sr-only">Flashcard Details</CredenzaTitle>
            <div className="space-y-2 text-sm">
              {isStandalone ? (
                <>
                  {flashcard.source && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={FileAttachmentIcon} size={16} />
                      <span className="truncate">{flashcard.source}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Calendar03Icon} size={16} />
                    <span>{formatDate(flashcard.createdAt)}</span>
                  </div>
                </>
              ) : episode ? (
                <>
                  {episode.title && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={AiMicIcon} size={16} />
                      <Link
                        href={`/episode/${episode.id}?tab=signals&filter=actioned&action=saved`}
                        className="hover:underline truncate"
                      >
                        {episode.title}
                      </Link>
                    </div>
                  )}
                  {podcast?.title && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={PodcastIcon} size={16} />
                      <Link
                        href={`/podcast/${podcast.id}?tab=signals&filter=actioned&action=saved`}
                        className="hover:underline truncate"
                      >
                        {podcast.title}
                      </Link>
                    </div>
                  )}
                  {episode.publishedAt && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Calendar03Icon} size={16} />
                      <span>{formatDate(episode.publishedAt)}</span>
                    </div>
                  )}
                </>
              ) : article ? (
                <>
                  {article.title && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={FileAttachmentIcon} size={16} />
                      <Link
                        href={`/post/${article.id}?tab=signals&filter=actioned&action=saved`}
                        className="hover:underline truncate"
                      >
                        {article.title}
                      </Link>
                    </div>
                  )}
                  {article.siteName && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Globe02Icon} size={16} />
                      <span className="truncate">{article.siteName}</span>
                    </div>
                  )}
                  {article.publishedAt && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Calendar03Icon} size={16} />
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
          </CredenzaHeader>

          <CredenzaBody className="space-y-6 pb-6 shrink-0">
            <div className="py-6 border-b">
              <h3 className="font-semibold text-lg leading-tight">
                {flashcard.front}
              </h3>
            </div>
          </CredenzaBody>

          <CredenzaBody className="pb-6 overflow-y-auto flex-1">
            <p className="text-base leading-relaxed whitespace-pre-line">
              {flashcard.back}
            </p>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    </article>
  );
}
