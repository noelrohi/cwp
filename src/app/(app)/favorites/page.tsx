"use client";

import { File02Icon, PodcastIcon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconArrowRight } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { useTRPC } from "@/server/trpc/client";

function getDateGroup(date: Date | string | null): string {
  if (!date) return "Unknown";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const favoriteDate = new Date(date);

  if (favoriteDate.toDateString() === today.toDateString()) {
    return "Today";
  } else if (favoriteDate.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return favoriteDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }
}

export default function FavoritesPage() {
  const trpc = useTRPC();
  const { data: favorites, isLoading } = useQuery(
    trpc.favorites.list.queryOptions(),
  );

  const groupedFavorites = useMemo(() => {
    if (!favorites || favorites.length === 0) return {};

    return favorites.reduce(
      (groups, fav) => {
        const dateGroup = getDateGroup(fav.createdAt);
        if (!groups[dateGroup]) {
          groups[dateGroup] = [];
        }
        groups[dateGroup].push(fav);
        return groups;
      },
      {} as Record<string, typeof favorites>,
    );
  }, [favorites]);

  if (isLoading) {
    return (
      <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-muted rounded mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-3">
                <div className="h-16 w-16 bg-muted rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const totalFavorites = favorites?.length || 0;

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl sm:text-2xl font-bold">Your Favorites</h1>

      {totalFavorites > 0 ? (
        <div className="space-y-6 sm:space-y-8">
          {Object.entries(groupedFavorites)
            .sort(([a, aItems], [b, bItems]) => {
              const order = { Today: 0, Yesterday: 1 };
              const aOrder = order[a as keyof typeof order] ?? 2;
              const bOrder = order[b as keyof typeof order] ?? 2;

              if (aOrder !== bOrder) return aOrder - bOrder;
              if (aOrder === 2 && bOrder === 2) {
                const aDate = aItems[0]?.createdAt
                  ? new Date(aItems[0].createdAt)
                  : new Date(0);
                const bDate = bItems[0]?.createdAt
                  ? new Date(bItems[0].createdAt)
                  : new Date(0);
                return bDate.getTime() - aDate.getTime();
              }
              return 0;
            })
            .map(([dateGroup, items]) => (
              <div key={dateGroup}>
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                  {dateGroup}
                </h3>
                <div className="space-y-0">
                  {items
                    .sort((a, b) => {
                      const aDate = a.createdAt
                        ? new Date(a.createdAt).getTime()
                        : 0;
                      const bDate = b.createdAt
                        ? new Date(b.createdAt).getTime()
                        : 0;
                      return bDate - aDate;
                    })
                    .map((fav) => {
                      if (fav.episode) {
                        return (
                          <Link
                            key={fav.id}
                            href={`/episode/${fav.episode.id}?tab=summary`}
                            className="flex gap-3 sm:gap-4 mb-3 sm:mb-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="relative h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                              {fav.episode.podcast?.imageUrl ? (
                                <Image
                                  src={fav.episode.podcast.imageUrl}
                                  alt={fav.episode.podcast.title}
                                  fill
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center">
                                  <HugeiconsIcon
                                    icon={PodcastIcon}
                                    size={24}
                                    className="text-muted-foreground"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="text-sm sm:text-base font-semibold leading-tight line-clamp-2 flex-1">
                                  {fav.episode.title}
                                </h3>
                              </div>
                              <p className="text-muted-foreground text-xs sm:text-sm">
                                {fav.episode.podcast?.title}
                              </p>
                            </div>

                            <div className="flex items-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                              >
                                View
                                <IconArrowRight size={16} />
                              </Button>
                            </div>
                          </Link>
                        );
                      }

                      if (fav.article) {
                        return (
                          <Link
                            key={fav.id}
                            href={`/post/${fav.article.id}?tab=article`}
                            className="flex gap-3 sm:gap-4 mb-3 sm:mb-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="relative h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                              <HugeiconsIcon
                                icon={File02Icon}
                                size={24}
                                className="text-muted-foreground"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="text-sm sm:text-base font-semibold leading-tight line-clamp-2 flex-1">
                                  {fav.article.title}
                                </h3>
                              </div>
                              <p className="text-muted-foreground text-xs sm:text-sm line-clamp-1">
                                {fav.article.feed?.title ||
                                  fav.article.siteName ||
                                  fav.article.author ||
                                  "Article"}
                              </p>
                            </div>

                            <div className="flex items-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                              >
                                Read
                                <IconArrowRight size={16} />
                              </Button>
                            </div>
                          </Link>
                        );
                      }

                      return null;
                    })}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Card className="w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HugeiconsIcon
              icon={StarIcon}
              size={64}
              className="text-muted-foreground mb-6"
            />
            <CardTitle className="mb-2">No Favorites Yet</CardTitle>
            <CardDescription className="text-center mb-6 max-w-md">
              Start favoriting episodes and articles to quickly access them
              here.
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
