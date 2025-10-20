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
import { Item, ItemFooter } from "@/components/ui/item";
import { useTRPC } from "@/server/trpc/client";

interface MetaSignalsTabProps {
  episodeId: string;
}

export function MetaSignalsTab({ episodeId }: MetaSignalsTabProps) {
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

  const selectedCount = metaSignal.data?.quotes?.length ?? 0;

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

  return (
    <section className="space-y-6">
      {/* Meta Signal Card or Empty State */}
      {hasMetaSignal && metaSignal.data ? (
        <Item className="space-y-8" variant="muted">
          {/* Headline - Banger style */}
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
              {metaSignal.data.title}
            </h2>
          </div>

          {/* The Synthesis - Newsletter style narrative */}
          <div className="prose prose-base dark:prose-invert max-w-none">
            <p className="text-lg leading-relaxed font-normal text-foreground">
              {metaSignal.data.summary}
            </p>
          </div>

          {/* Best Quotes - Clean attribution */}
          {selectedCount > 0 && metaSignal.data.quotes && (
            <div className="space-y-6">
              <div className="h-px bg-border" />
              {metaSignal.data.quotes.map((quote) => (
                <div key={quote.id} className="space-y-3">
                  <blockquote className="text-base leading-relaxed text-foreground/90">
                    "{quote.extractedQuote || quote.chunkContent}"
                  </blockquote>
                  <p className="text-sm text-muted-foreground">
                    — {quote.signalSpeakerName || "Unknown"}
                    {quote.chunkStartTimeSec && (
                      <>
                        {" "}
                        • {Math.floor(quote.chunkStartTimeSec / 60)}:
                        {String(quote.chunkStartTimeSec % 60).padStart(2, "0")}
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <ItemFooter className="pt-6 border-t flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {selectedCount} {selectedCount === 1 ? "quote" : "quotes"} •
              AI-curated
            </div>
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
          </ItemFooter>
        </Item>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={SparklesIcon} size={20} />
            </EmptyMedia>
            <EmptyTitle>AI-Curated Meta Signal Card</EmptyTitle>
            <EmptyDescription>
              Automatically curate and synthesize the best insights from
              high-confidence signals into an executive-ready card.
            </EmptyDescription>
          </EmptyHeader>

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
        </Empty>
      )}
    </section>
  );
}
