"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { StandaloneSnipDialog } from "@/components/standalone-snip-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/server/trpc/client";
import { FlashcardItem } from "../../../components/blocks/snips/flashcard-item";

export default function SnipsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const flashcardsQuery = useQuery(trpc.flashcards.list.queryOptions());
  const deleteMutation = useMutation(trpc.flashcards.delete.mutationOptions());

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: trpc.flashcards.list.queryKey(),
      });
      toast.success("Flashcard deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete flashcard.";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const isLoading = flashcardsQuery.isLoading;
  const flashcards = flashcardsQuery.data ?? [];

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold font-serif">Snips</h1>
          <p className="text-muted-foreground">
            Your flashcards from saved signals
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-end gap-0.5">
            <div className="font-bold font-serif text-base md:text-3xl">
              {flashcards.length}
            </div>
            <div className="text-muted-foreground text-xs md:text-sm">
              Total
            </div>
          </div>
          <StandaloneSnipDialog
            trigger={
              <Button size="sm" className="gap-2">
                <HugeiconsIcon icon={Add01Icon} size={16} />
                <span className="hidden sm:inline">Create Snip</span>
              </Button>
            }
          />
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-xl border border-border/60 bg-muted/40 p-6 aspect-[3/2]"
            >
              <div className="h-4 w-3/4 rounded bg-muted-foreground/30" />
            </div>
          ))}
        </div>
      ) : flashcards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
          <p className="text-lg mb-2">No flashcards yet</p>
          <p className="text-sm">
            Create flashcards from your saved signals to start learning
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-max">
          {flashcards.map((flashcard) => (
            <FlashcardItem
              key={flashcard.id}
              flashcard={flashcard}
              isDeleting={deletingId === flashcard.id}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </main>
  );
}
