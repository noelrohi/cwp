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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTRPC } from "@/server/trpc/client";
import { Item, ItemFooter } from "../../../../../components/ui/item";

export default function EpisodeSummaryPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const params = use(props.params);

  const episode = useQuery({
    ...trpc.episodes.get.queryOptions({ episodeId: params.id }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "processing" ? 2000 : false;
    },
  });

  const processEpisode = useMutation(
    trpc.episodes.processEpisode.mutationOptions({
      onSuccess: () => {
        toast.success("Episode processing started");
        episode.refetch();
        summary.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to process episode: ${error.message}`);
      },
    }),
  );

  const generateSummary = useMutation(
    trpc.episodes.generateSummary.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Summary generation started! This usually takes 10-30 seconds.",
        );
      },
      onError: (error) => {
        toast.error(`Failed to generate summary: ${error.message}`);
      },
    }),
  );

  const summary = useQuery({
    ...trpc.episodes.getSummary.queryOptions({ episodeId: params.id }),
    refetchInterval: (query) => {
      const hasSummary =
        query.state.data !== null && query.state.data !== undefined;
      const isProcessingOrGenerating =
        episode.data?.status === "processing" ||
        generateSummary.isPending ||
        processEpisode.isPending;
      return !hasSummary && isProcessingOrGenerating ? 3000 : false;
    },
  });

  if (episode.isLoading || summary.isLoading) {
    return <LoadingState />;
  }

  const episodeData = episode.data;
  const summaryData = summary.data;
  const isProcessing =
    episodeData?.status === "processing" || processEpisode.isPending;

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
          <Streamdown className="text-base">
            {summaryData.markdownContent}
          </Streamdown>
          <ItemFooter className="pt-6 border-t flex gap-3 justify-start">
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={SparklesIcon} size={20} />
            </EmptyMedia>
            <EmptyTitle>Quick Overview Summary</EmptyTitle>
            <EmptyDescription>
              {!episodeData?.transcriptUrl
                ? "Process this episode first to generate a bite-sized summary with key takeaways, examples, lessons, and impactful quotes."
                : "Generate a bite-sized summary with key takeaways, examples, lessons, and impactful quotes from this episode."}
            </EmptyDescription>
          </EmptyHeader>

          <EmptyContent>
            <Button
              size="lg"
              onClick={() =>
                !episodeData?.transcriptUrl
                  ? processEpisode.mutate({ episodeId: params.id })
                  : generateSummary.mutate({ episodeId: params.id })
              }
              disabled={generateSummary.isPending || isProcessing}
            >
              {generateSummary.isPending || isProcessing ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                  {!episodeData?.transcriptUrl
                    ? "Processing & Generating..."
                    : "Generating Summary..."}
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={SparklesIcon} size={16} />
                  {!episodeData?.transcriptUrl
                    ? "Process & Generate Summary"
                    : "Generate Summary"}
                </>
              )}
            </Button>

            {(generateSummary.isPending || isProcessing) && (
              <p className="text-sm text-muted-foreground">
                This usually takes{" "}
                {!episodeData?.transcriptUrl
                  ? "2.5-5.5 minutes"
                  : "10-30 seconds"}
              </p>
            )}
          </EmptyContent>
        </Empty>
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
