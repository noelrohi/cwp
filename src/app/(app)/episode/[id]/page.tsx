"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Play,
  User,
} from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/server/trpc/client";

export default function EpisodeDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const trpc = useTRPC();
  const params = use(props.params);

  const episode = useQuery(
    trpc.episodes.get.queryOptions({
      episodeId: params.id,
    }),
  );

  if (episode.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
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

  if (episode.error) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Podcasts
        </Link>
        <div className="text-center py-12">
          <div className="text-destructive mb-4">Episode not found</div>
          <p className="text-sm text-muted-foreground">
            The episode you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const episodeData = episode.data;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Back Navigation */}
      <Link
        href={
          episodeData?.podcast
            ? `/podcast/${episodeData.podcast.id}`
            : "/podcasts"
        }
        className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {episodeData?.podcast?.title || "Podcasts"}
      </Link>

      {/* Episode Header */}
      <div className="flex gap-6 mb-8">
        {/* Episode Thumbnail */}
        {episodeData?.thumbnailUrl && (
          <div className="relative h-32 w-32 rounded-lg bg-muted flex-shrink-0 group">
            <img
              src={episodeData.thumbnailUrl}
              alt={episodeData.title}
              className="h-full w-full rounded-lg object-cover"
            />
            {/* Play Button Overlay */}
            {episodeData?.audioUrl && (
              <a
                href={episodeData.audioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <div className="bg-white rounded-full p-3 shadow-lg hover:scale-110 transition-transform">
                  <Play className="h-6 w-6 text-black fill-current" />
                </div>
              </a>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-3">{episodeData?.title}</h1>

          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-4">
            {episodeData?.guest && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                Guest: {episodeData.guest}
              </div>
            )}

            {episodeData?.publishedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(episodeData.publishedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            )}

            {episodeData?.durationSec && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {Math.floor(episodeData.durationSec / 60)} min
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {episodeData?.transcriptUrl && (
              <Button variant="outline" asChild>
                <a
                  href={episodeData.transcriptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Transcript
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
