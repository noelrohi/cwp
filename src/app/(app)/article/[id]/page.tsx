"use client";

import {
  ArrowLeft01Icon,
  Calendar03Icon,
  Clock01Icon,
  Link01Icon,
  RssIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/server/trpc/client";

const ARTICLE_PAGE_SIZE = 20;

export default function ArticleDetailPage(props: PageProps<"/article/[id]">) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const params = use(props.params);

  const feed = useQuery(
    trpc.articles.getFeed.queryOptions({
      feedId: params.id,
    }),
  );

  const parseFeedMutation = useMutation({
    ...trpc.articles.parseFeed.mutationOptions(),
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({
        queryKey: trpc.articles.getFeed.queryKey({ feedId: params.id }),
      });
      queryClient.invalidateQueries(
        trpc.articles.articlesInfinite.infiniteQueryFilter({
          feedId: params.id,
        }),
      );
    },
  });

  const articlesQuery = useInfiniteQuery({
    ...trpc.articles.articlesInfinite.infiniteQueryOptions({
      feedId: params.id,
      limit: ARTICLE_PAGE_SIZE,
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  if (feed.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-6" />
          <div className="flex gap-6 mb-8">
            <div className="h-32 w-32 bg-muted rounded-lg" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (feed.error) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/articles"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to Article Feeds
        </Link>
        <div className="text-center py-8 sm:py-12">
          <div className="text-destructive mb-4">Feed not found</div>
          <p className="text-sm text-muted-foreground">
            The article feed you're looking for doesn't exist or has been
            removed.
          </p>
        </div>
      </main>
    );
  }

  const feedData = feed.data;
  const articles =
    articlesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const isArticlesLoading = articlesQuery.isPending && articles.length === 0;
  const articleListEmpty = !isArticlesLoading && articles.length === 0;
  const totalArticles = feedData?.articleCount ?? 0;
  const articlesError =
    articlesQuery.error instanceof Error ? articlesQuery.error.message : null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/articles"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        Back to Article Feeds
      </Link>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="h-32 w-32 rounded-lg bg-muted flex-shrink-0">
            {feedData?.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: **
              <img
                src={feedData.imageUrl}
                alt={feedData.title}
                className="h-full w-full rounded-lg object-cover"
              />
            ) : (
              <div className="h-full w-full rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold mb-2">
                {feedData?.title}
              </h1>
              {feedData?.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {feedData.description}
                </p>
              )}
            </div>

            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Calendar03Icon} size={14} />
                <dt className="sr-only">Added</dt>
                <dd>
                  Added{" "}
                  {new Date(feedData?.createdAt || "").toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} size={14} />
                <dt className="sr-only">Articles</dt>
                <dd>{totalArticles} articles</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-x-visible">
          {feedData?.feedUrl && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() =>
                parseFeedMutation.mutate({
                  feedId: params.id,
                })
              }
              disabled={parseFeedMutation.isPending}
            >
              <HugeiconsIcon icon={RssIcon} size={16} />
              {parseFeedMutation.isPending ? "Parsing..." : "Parse Feed"}
            </Button>
          )}
          {feedData?.feedUrl && (
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <a
                href={feedData.feedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <HugeiconsIcon icon={Link01Icon} size={16} />
                RSS Feed
              </a>
            </Button>
          )}
        </div>
      </div>

      {parseFeedMutation.isPending && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Parsing Feed</span>
          </div>
          <div className="mb-2 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary animate-pulse w-full" />
          </div>
          <p className="text-xs text-muted-foreground">
            Processing feed and articles...
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base sm:text-lg font-semibold">Articles</h2>
        </div>

        {articlesQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load articles.
            {articlesError ? ` ${articlesError}` : " Please try again."}
          </div>
        ) : isArticlesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 w-full animate-pulse rounded-lg border bg-muted/70"
              />
            ))}
          </div>
        ) : !articleListEmpty ? (
          <>
            <div className="space-y-2">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/post/${article.id}`}
                  className="block rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors"
                >
                  <h3 className="font-medium text-base mb-1.5 hover:text-primary">
                    {article.title}
                  </h3>

                  {article.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {article.excerpt}
                    </p>
                  )}

                  <div className="flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {article.author && (
                      <div className="flex items-center gap-1.5">
                        <span>{article.author}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Calendar03Icon} size={14} />
                      <span>
                        {article.publishedAt
                          ? new Date(article.publishedAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )
                          : new Date(article.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {articlesQuery.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => articlesQuery.fetchNextPage()}
                  disabled={articlesQuery.isFetchingNextPage}
                >
                  {articlesQuery.isFetchingNextPage
                    ? "Loading..."
                    : "Load more"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-base text-muted-foreground mb-2">
              No articles found
            </div>
            <p className="text-base text-muted-foreground">
              Articles will appear here once the feed is parsed.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
