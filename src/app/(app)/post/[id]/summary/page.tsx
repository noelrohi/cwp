"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Loading03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
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

export default function ArticleSummaryPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const params = use(props.params);

  const article = useQuery({
    ...trpc.articles.getById.queryOptions({ id: params.id }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "processing" ? 2000 : false;
    },
  });

  const processArticle = useMutation(
    trpc.articles.processArticle.mutationOptions({
      onSuccess: () => {
        toast.success("Article processing started");
        article.refetch();
        summary.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to process article: ${error.message}`);
      },
    }),
  );

  const generateSummary = useMutation(
    trpc.articles.generateSummary.mutationOptions({
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
    ...trpc.articles.getSummary.queryOptions({ articleId: params.id }),
    refetchInterval: (query) => {
      const hasSummary =
        query.state.data !== null && query.state.data !== undefined;
      const isProcessingOrGenerating =
        article.data?.status === "processing" ||
        generateSummary.isPending ||
        processArticle.isPending;
      return !hasSummary && isProcessingOrGenerating ? 3000 : false;
    },
  });

  if (article.isLoading || summary.isLoading) {
    return <LoadingState />;
  }

  const articleData = article.data;
  const summaryData = summary.data;
  const isProcessing =
    articleData?.status === "processing" || processArticle.isPending;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={`/post/${params.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        Back to Article
      </Link>

      <div className="space-y-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3 justify-between">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2 text-balance">
                {articleData?.title}
              </h1>

              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {articleData?.author && (
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Author</dt>
                    <dd>By {articleData.author}</dd>
                  </div>
                )}
                {articleData?.publishedAt && (
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Calendar03Icon} size={14} />
                    <dt className="sr-only">Published</dt>
                    <dd>
                      {new Date(articleData.publishedAt).toLocaleDateString(
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
              </dl>

              {articleData?.excerpt && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">
                  {articleData.excerpt}
                </p>
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
              onClick={() => generateSummary.mutate({ articleId: params.id })}
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
              {!articleData?.hasContent
                ? "Process this article first to generate a bite-sized summary with key takeaways, examples, lessons, and impactful quotes."
                : "Generate a bite-sized summary with key takeaways, examples, lessons, and impactful quotes from this article."}
            </EmptyDescription>
          </EmptyHeader>

          <EmptyContent>
            <Button
              size="lg"
              onClick={() =>
                !articleData?.hasContent
                  ? processArticle.mutate({ articleId: params.id })
                  : generateSummary.mutate({ articleId: params.id })
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
                  {!articleData?.hasContent
                    ? "Processing & Generating..."
                    : "Generating Summary..."}
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={SparklesIcon} size={16} />
                  {!articleData?.hasContent
                    ? "Process & Generate Summary"
                    : "Generate Summary"}
                </>
              )}
            </Button>

            {(generateSummary.isPending || isProcessing) && (
              <p className="text-sm text-muted-foreground">
                This usually takes{" "}
                {!articleData?.hasContent ? "1-3 minutes" : "10-30 seconds"}
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
