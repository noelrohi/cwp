"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/server/trpc/client";

export default function LibraryPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();

  const { data, isLoading, error } = useQuery(
    trpc.episodes.list.queryOptions({ limit: 24 }),
  );

  const createQuestion = useMutation(trpc.questions.create.mutationOptions());

  async function handleAskQuestion({
    question,
    episodeId,
  }: {
    question: string;
    episodeId: string;
  }) {
    try {
      const res = await createQuestion.mutateAsync({
        question,
        episodeId,
      });
      router.push(
        `/?episodeId=${res.queryId}&q=${encodeURIComponent(question)}`,
      );
    } catch (err) {
      console.error("Failed to create question:", err);
    }
    qc.invalidateQueries({
      queryKey: trpc.questions.list.queryKey({ limit: 20, sort: "newest" }),
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ask question from these episodes
        </p>
        <div className="mt-4">
          <Input
            placeholder="Try: Summarize this episode in 3 bullet points"
            className="max-w-xl"
          />
        </div>
      </header>

      {isLoading && <p className="text-sm">Loading episodes…</p>}
      {error && (
        <p className="text-destructive text-sm">Failed to load episodes.</p>
      )}

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((ep) => (
          <article
            key={ep.id}
            className="rounded-lg border bg-background p-4 shadow-sm"
          >
            {ep.thumbnailUrl ? (
              <div className="relative mb-3 h-40 w-full overflow-hidden rounded-md bg-muted">
                <Image
                  alt={ep.title ?? "Episode thumbnail"}
                  src={ep.thumbnailUrl}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  unoptimized
                  priority={false}
                />
              </div>
            ) : (
              <div className="mb-3 h-40 w-full rounded-md bg-muted" />
            )}
            <h2 className="line-clamp-2 text-base font-semibold">{ep.title}</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {ep.guest ? `Guest: ${ep.guest}` : ""}
            </p>

            {ep.starterQuestions?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {ep.starterQuestions.slice(0, 5).map((q) => (
                  <Badge
                    key={q.id}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      handleAskQuestion({
                        question: q.question,
                        episodeId: String(ep.id),
                      })
                    }
                  >
                    {q.question}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-3 text-xs">
                No starter questions yet.
              </p>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
