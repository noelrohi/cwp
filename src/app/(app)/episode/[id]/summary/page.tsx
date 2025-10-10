"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Clock01Icon,
  Loading03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/server/trpc/client";
import { Item, ItemFooter } from "../../../../../components/ui/item";

export default function EpisodeSummaryPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const params = use(props.params);

  const episode = useQuery(
    trpc.episodes.get.queryOptions({ episodeId: params.id }),
  );

  const summary = useQuery(
    trpc.episodes.getSummary.queryOptions({ episodeId: params.id }),
  );

  const generateSummary = useMutation(
    trpc.episodes.generateSummary.mutationOptions({
      onSuccess: () => {
        toast.success("Summary generated!");
        summary.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to generate summary: ${error.message}`);
      },
    }),
  );

  if (episode.isLoading || summary.isLoading) {
    return <LoadingState />;
  }

  const episodeData = episode.data;
  const summaryData = summary.data;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={`/episode/${params.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        Back to Episode
      </Link>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {episodeData?.thumbnailUrl && (
            <div className="relative h-32 w-32 hidden sm:block shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image
                src={episodeData.thumbnailUrl}
                alt={episodeData.title}
                className="h-full w-full object-cover"
                fill
              />
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-3 justify-between">
            <div className="flex gap-3 items-start">
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2 text-balance">
                  {episodeData?.title}
                </h1>

                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {episodeData?.publishedAt && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Calendar03Icon} size={14} />
                      <dt className="sr-only">Published</dt>
                      <dd>
                        {new Date(episodeData.publishedAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </dd>
                    </div>
                  )}
                  {episodeData?.durationSec && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Clock01Icon} size={14} />
                      <dt className="sr-only">Duration</dt>
                      <dd>{Math.floor(episodeData.durationSec / 60)} min</dd>
                    </div>
                  )}
                </dl>
              </div>

              {episodeData?.thumbnailUrl && (
                <div className="relative h-16 w-16 sm:hidden shrink-0 overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={episodeData.thumbnailUrl}
                    alt={episodeData.title}
                    className="h-full w-full object-cover"
                    fill
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {summaryData ? (
        <Item className="space-y-6" variant="muted">
          <Streamdown>{summaryData.markdownContent}</Streamdown>
          <ItemFooter className="pt-6 border-t flex gap-3 justify-start">
            <Link href={`/episode/${params.id}`}>
              <Button>
                <HugeiconsIcon icon={SparklesIcon} size={16} />
                Process Full Episode
              </Button>
            </Link>

            <Button
              variant="outline"
              onClick={() => generateSummary.mutate({ episodeId: params.id })}
              disabled={generateSummary.isPending}
            >
              {generateSummary.isPending ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <HugeiconsIcon icon={SparklesIcon} size={16} />
              )}
              Regenerate
            </Button>
          </ItemFooter>
        </Item>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-12 text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Quick Overview Summary</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Generate a bite-sized summary with key takeaways, examples,
              lessons, and impactful quotes from this episode.
            </p>
          </div>

          <Button
            size="lg"
            onClick={() => generateSummary.mutate({ episodeId: params.id })}
            disabled={generateSummary.isPending}
          >
            {generateSummary.isPending ? (
              <>
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  className="animate-spin"
                />
                Generating Summary...
              </>
            ) : (
              <>
                <HugeiconsIcon icon={SparklesIcon} size={16} />
                Generate Summary
              </>
            )}
          </Button>

          {generateSummary.isPending && (
            <p className="text-sm text-muted-foreground">
              This usually takes 10-30 seconds
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function LoadingState() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="h-10 w-3/4 bg-muted rounded" />
        <div className="space-y-3 mt-8">
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
        </div>
      </div>
    </main>
  );
}
