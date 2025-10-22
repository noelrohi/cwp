"use client";

import { Loading03Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { MetaSignalCard } from "./meta-signal-card";

interface MetaSignalsTabProps {
  episodeId: string;
  hasYouTubeVideo?: boolean;
  hasSignals?: boolean;
}

export function MetaSignalsTab({
  episodeId,
  hasYouTubeVideo = false,
  hasSignals = false,
}: MetaSignalsTabProps) {
  const trpc = useTRPC();

  // Get existing meta signal (if any)
  const metaSignal = useQuery({
    ...trpc.metaSignals.get.queryOptions({ episodeId }),
  });

  // Generate meta signal
  const generate = useMutation(
    trpc.metaSignals.generateForEpisode.mutationOptions(),
  );

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ episodeId });
      toast.success("Generating meta signal...", {
        description:
          "This will take a few seconds. The page will refresh when ready.",
      });
    } catch (error) {
      console.error("Failed to generate:", error);
      toast.error("Failed to generate meta signal");
    }
  };

  if (metaSignal.isPending) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </section>
    );
  }

  if (metaSignal.isError) {
    return (
      <section className="space-y-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia />
            <EmptyTitle>Error loading meta signal</EmptyTitle>
            <EmptyDescription>{metaSignal.error.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const hasMetaSignal = metaSignal.data?.title && metaSignal.data?.summary;
  const canGenerate = hasYouTubeVideo && hasSignals;

  return (
    <section className="space-y-6">
      {/* Twitter-like Feed or Empty State */}
      {hasMetaSignal && metaSignal.data ? (
        <div className="space-y-4">
          {/* Regenerate Button - only show when meta signal exists */}
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                  Working...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={SparklesIcon} size={16} />
                  Regenerate
                </>
              )}
            </Button>
          </div>

          {/* Meta Signal Card */}
          <MetaSignalCard signal={metaSignal.data} episodeId={episodeId} />
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={SparklesIcon} size={20} />
            </EmptyMedia>
            <EmptyTitle>AI-Curated Meta Signal Card</EmptyTitle>
            <EmptyDescription>
              {!hasYouTubeVideo
                ? "Connect a YouTube video to enable meta signal generation."
                : !hasSignals
                  ? "Generate signals first to create a meta signal card."
                  : "Automatically curate and synthesize the best insights from high-confidence signals into an executive-ready card."}
            </EmptyDescription>
          </EmptyHeader>

          {canGenerate && (
            <EmptyContent>
              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      className="animate-spin"
                    />
                    Generating...
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={SparklesIcon} size={16} />
                    Generate Meta Signal
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground mt-3">
                AI will select 2-4 best quotes and create a synthesized insight
                card.
              </p>

              {generate.isPending && (
                <p className="text-sm text-muted-foreground">
                  This usually takes 5-10 seconds
                </p>
              )}
            </EmptyContent>
          )}
        </Empty>
      )}
    </section>
  );
}
