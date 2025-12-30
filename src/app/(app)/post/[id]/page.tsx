"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Copy01Icon,
  InformationCircleIcon,
  Link01Icon,
  Loading03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { use } from "react";
import { toast } from "sonner";

import { Streamdown } from "streamdown";
import { FavoriteButton } from "@/components/favorite-button";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemFooter } from "@/components/ui/item";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTRPC } from "@/server/trpc/client";

export default function PostDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = use(props.params);
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringEnum<"summary" | "article">([
      "summary",
      "article",
    ]).withDefault("summary"),
  );

  const article = useQuery({
    ...trpc.articles.getById.queryOptions({
      id: params.id,
    }),
  });

  const generateSummary = useMutation(
    trpc.articles.generateSummary.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Summary generation started! This usually takes 10-30 seconds.",
        );
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getSummary.queryKey({ articleId: params.id }),
        });
      },
      onError: (error) => {
        toast.error(`Failed to generate summary: ${error.message}`);
      },
    }),
  );

  const summary = useQuery({
    ...trpc.articles.getSummary.queryOptions({ articleId: params.id }),
    enabled: activeTab === "summary",
  });

  const rawContent = useQuery({
    ...trpc.articles.getRawContent.queryOptions({ articleId: params.id }),
    enabled: activeTab === "article",
  });

  const processArticle = useMutation(
    trpc.articles.processArticle.mutationOptions({
      onSuccess: () => {
        toast.success("Article processing started");
        queryClient.invalidateQueries({
          queryKey: trpc.articles.getById.queryKey({ id: params.id }),
        });
      },
      onError: (error) => {
        toast.error(`Failed to process article: ${error.message}`);
      },
    }),
  );

  if (article.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-6" />
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </main>
    );
  }

  if (article.error) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Go back
        </button>
        <div className="text-center py-8 sm:py-12">
          <div className="text-base sm:text-lg font-semibold text-destructive mb-3 sm:mb-4">
            Article not found
          </div>
          <p className="text-base text-muted-foreground">
            The article you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const articleData = article.data;
  const currentStatus = articleData?.status;
  const currentErrorMessage = articleData?.errorMessage;
  const isProcessing = processArticle.isPending;
  const hasSummary = Boolean(articleData?.summary?.markdownContent);
  const isBusy = isProcessing || generateSummary.isPending;

  const statusLabel = (() => {
    switch (currentStatus) {
      case "processed":
        return "Processed";
      case "processing":
        return "Processing";
      case "failed":
        return "Failed";
      case "retrying":
        return "Retrying";
      case "pending":
        return "Pending";
      default:
        return currentStatus ? currentStatus : "Unknown";
    }
  })();

  const activeOperation = (() => {
    if (generateSummary.isPending) {
      return {
        title: "Generating summary",
        description:
          "Extracting content and creating a summary. This usually takes 1-3 minutes.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: true,
      } as const;
    }
    if (isProcessing) {
      return {
        title: "Processing article",
        description:
          "Extracting content and chunking for analysis. This usually takes 1-2 minutes.",
        icon: Loading03Icon,
        spinning: true,
        showProgress: true,
      } as const;
    }
    return null;
  })();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Go back
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3 justify-between">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight mb-2 text-balance">
                {articleData?.title}
              </h1>

              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="Article status details"
                    >
                      <HugeiconsIcon icon={InformationCircleIcon} size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs bg-background text-foreground">
                    <div className="space-y-1 text-xs">
                      <p>Status: {statusLabel}</p>
                      {currentErrorMessage && (
                        <p className="text-destructive">
                          Last error: {currentErrorMessage}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </dl>
              {currentErrorMessage && (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {currentErrorMessage}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <ButtonGroup>
              <CopyArticleContentButton articleId={params.id} />
              <FavoriteButton articleId={params.id} />
              {articleData?.url && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link
                        href={articleData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <HugeiconsIcon icon={Link01Icon} size={16} />
                        Read Original Article
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ButtonGroup>

            {!hasSummary && (
              <Button
                disabled={isBusy}
                size="sm"
                onClick={() => generateSummary.mutate({ articleId: params.id })}
              >
                {isBusy ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <HugeiconsIcon icon={SparklesIcon} size={16} />
                )}
                {isBusy ? "Processing..." : "Summarize Article"}
              </Button>
            )}
          </div>

          {activeOperation && (
            <div className="mt-2 rounded-lg border border-border bg-muted/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <HugeiconsIcon
                  icon={activeOperation.icon}
                  size={16}
                  className={
                    activeOperation.spinning ? "animate-spin" : undefined
                  }
                />
                {activeOperation.title}
              </div>
              {activeOperation.showProgress && (
                <div className="mt-3 h-2 rounded-full bg-muted">
                  <div className="h-2 w-full rounded-full bg-primary animate-pulse" />
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {activeOperation.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="mt-6"
      >
        <TabsList className="w-full">
          <TabsTrigger value="summary" className="flex-1">
            Summary
          </TabsTrigger>
          <TabsTrigger value="article" className="flex-1">
            Full Article
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "summary" && (
        <section className="space-y-4">
          {summary.isPending ? (
            <LoadingState />
          ) : summary.data ? (
            <Item className="space-y-6" variant="muted">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => {
                    if (summary.data?.markdownContent) {
                      navigator.clipboard.writeText(
                        summary.data.markdownContent,
                      );
                      toast.success("Summary copied to clipboard");
                    }
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                </Button>
                <Streamdown className="text-base">
                  {summary.data.markdownContent}
                </Streamdown>
              </div>
              <ItemFooter className="pt-6 border-t flex gap-3 justify-start">
                <Button
                  variant="outline"
                  onClick={() =>
                    generateSummary.mutate({ articleId: params.id })
                  }
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
                  Summarize this article to get key takeaways, examples,
                  lessons, and quotes. Perfect for quick triage.
                </EmptyDescription>
              </EmptyHeader>

              <EmptyContent>
                <Button
                  size="lg"
                  onClick={() =>
                    generateSummary.mutate({ articleId: params.id })
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
                      Summarizing...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                      Summarize Article
                    </>
                  )}
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </section>
      )}

      {activeTab === "article" && (
        <section className="space-y-4">
          {rawContent.isPending ? (
            <LoadingState />
          ) : rawContent.data?.rawContent ? (
            <Item className="space-y-6" variant="muted">
              <Streamdown className="text-base prose prose-neutral dark:prose-invert max-w-none">
                {rawContent.data.rawContent}
              </Streamdown>
            </Item>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={InformationCircleIcon} size={20} />
                </EmptyMedia>
                <EmptyTitle>Full Article Content</EmptyTitle>
                <EmptyDescription>
                  Process this article to read the full content parsed by Jina
                  AI.
                </EmptyDescription>
              </EmptyHeader>

              <EmptyContent>
                <Button
                  size="lg"
                  onClick={() =>
                    processArticle.mutate({ articleId: params.id })
                  }
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                      />
                      Processing...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                      Process Article
                    </>
                  )}
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </section>
      )}
    </main>
  );
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 bg-muted rounded" />
      <div className="h-4 w-full bg-muted rounded" />
      <div className="h-4 w-full bg-muted rounded" />
      <div className="h-4 w-3/4 bg-muted rounded" />
    </div>
  );
}

function CopyArticleContentButton({ articleId }: { articleId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const handleCopyContent = async () => {
    try {
      const { content } = await queryClient.fetchQuery(
        trpc.articles.getContent.queryOptions({
          articleId,
        }),
      );

      if (!content || content.trim().length === 0) {
        toast.error("No content available to copy");
        return;
      }

      await navigator.clipboard.writeText(content);
      toast.success("Article content copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy content");
      console.error(error);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleCopyContent}>
      <HugeiconsIcon icon={Copy01Icon} size={16} />
      Copy Content
    </Button>
  );
}
