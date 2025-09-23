"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowUpIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTRPC } from "@/server/trpc/client";

export default function QuestionsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [sort, setSort] = useState<"newest" | "active">("newest");
  const [searchMode, setSearchMode] = useState<"quotes" | "global">("global");

  const router = useRouter();

  const createQuestion = useMutation(trpc.questions.create.mutationOptions());
  const listQuery = useInfiniteQuery({
    ...trpc.questions.list.infiniteQueryOptions(
      { limit: 20, sort },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  });

  async function handleAsk({ text }: { text?: string }) {
    const raw = (text ?? "").trim();
    if (!raw) return;
    // Persist query immediately and trigger background answer generation.
    try {
      const res = await createQuestion.mutateAsync({
        question: raw,
        mode: searchMode,
      });
      router.push(`/question/${res.queryId}`);
    } catch (_err) {}
    qc.invalidateQueries({
      queryKey: trpc.questions.list.infiniteQueryKey({ limit: 20, sort }),
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Questions</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ask and browse questions.
        </p>
      </header>

      {/* Composer */}
      <section className="mx-auto mb-8 max-w-3xl">
        {/* Search Mode Selection */}
        <div className="mb-4 flex justify-center gap-2">
          <Button
            variant={searchMode === "global" ? "default" : "outline"}
            size="sm"
            onClick={() => setSearchMode("global")}
            className="h-8"
          >
            Global Search
          </Button>
          <Button
            variant={searchMode === "quotes" ? "default" : "outline"}
            size="sm"
            onClick={() => setSearchMode("quotes")}
            className="h-8"
          >
            Episode Search
          </Button>
        </div>

        <PromptInput
          className="rounded-xl border bg-background shadow-sm"
          onSubmit={async (msg, e) => {
            e.preventDefault();
            await handleAsk({ text: msg.text });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={
                searchMode === "global"
                  ? "Ask a question and get quotes from across all episodes…"
                  : "Ask for quotes from podcast episodes…"
              }
              disabled={createQuestion.isPending}
            />
            <PromptInputToolbar className="px-2 py-1.5">
              <div />
              <PromptInputSubmit disabled={createQuestion.isPending}>
                {createQuestion.isPending ? (
                  <svg
                    className="size-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-label="Loading"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </PromptInputSubmit>
            </PromptInputToolbar>
          </PromptInputBody>
        </PromptInput>
      </section>

      {/* Toolbar */}
      <section className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {listQuery.data?.pages.reduce(
            (total, page) => total + page.items.length,
            0,
          ) ?? 0}{" "}
          questions
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Sort by</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <Separator className="mb-6" />

      {/* List */}
      <section className="grid grid-cols-1 gap-4">
        {listQuery.data?.pages.map((page, pageIndex) => (
          <Fragment key={pageIndex}>
            {page.items.map((q) => {
              const raw = (q.queryText ?? "").trim();
              const title = raw.slice(0, 80);
              return (
                <article
                  key={q.queryId}
                  className="grid grid-cols-[auto_1fr] gap-4 rounded-lg border bg-background p-4 shadow-xs items-center"
                >
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-xs min-w-[60px]">
                    <Stat
                      label="answers"
                      value={Number(q.answersCount ?? 0)}
                      highlighted={(q.answersCount ?? 0) > 0}
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold">
                      <Link
                        href={`/question/${q.queryId}`}
                        className="hover:underline"
                      >
                        {title}
                      </Link>
                    </h3>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-muted-foreground text-xs">
                        asked{" "}
                        {timeAgo(
                          String(q.createdAt ?? new Date().toISOString()),
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </Fragment>
        ))}
      </section>

      {/* Load More Button */}
      {listQuery.hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => listQuery.fetchNextPage()}
            disabled={listQuery.isFetchingNextPage}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {listQuery.isFetchingNextPage ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border px-2 py-1 text-center " +
        (highlighted
          ? "bg-secondary text-secondary-foreground"
          : "bg-background")
      }
    >
      <div className="text-foreground text-sm font-semibold leading-none">
        {value}
      </div>
      <div className="text-muted-foreground text-[10px] leading-tight">
        {label}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Active results and inline answer rendering removed in favor of dedicated detail page.
