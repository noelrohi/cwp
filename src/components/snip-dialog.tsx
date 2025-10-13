"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "./ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "./ui/credenza";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

const flashcardSchema = z.object({
  front: z
    .string()
    .min(1, "Front is required")
    .max(500, "Front must be 500 characters or less"),
  back: z
    .string()
    .min(1, "Back is required")
    .max(5000, "Back must be 5000 characters or less"),
  tags: z.string().optional(),
});

type FlashcardFormData = z.infer<typeof flashcardSchema>;

type SnipDialogProps = {
  signalId?: string;
  articleId?: string;
  defaultBack?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectionSource?: "summary" | "article";
};

export function SnipDialog({
  signalId,
  articleId,
  defaultBack,
  trigger,
  open: controlledOpen,
  onOpenChange,
  selectionSource,
}: SnipDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);

  if (!signalId && !articleId) {
    throw new Error("SnipDialog requires either a signalId or articleId");
  }

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const isSignalMode = Boolean(signalId);

  const existingFlashcard = useQuery({
    ...trpc.flashcards.getBySignal.queryOptions({
      signalId: signalId ?? "",
    }),
    enabled: open && isSignalMode && Boolean(signalId),
  });

  const createMutation = useMutation(
    trpc.flashcards.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Flashcard created");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.flashcards.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.metrics.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.listArticleSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.articlesWithSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.episodesWithSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.flashcards.getBySignal.queryKey(),
          }),
        ]);
        handleOpenChange(false);
        form.reset();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const createFromSelectionMutation = useMutation(
    trpc.flashcards.createFromSelection.mutationOptions({
      onSuccess: async () => {
        toast.success("Flashcard created");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.flashcards.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.metrics.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.listArticleSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.articlesWithSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.episodesWithSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.byArticle.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.articleStats.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.articles.getSummary.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.articles.getRawContent.queryKey(),
          }),
        ]);
        handleOpenChange(false);
        form.reset();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.flashcards.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Flashcard updated");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.flashcards.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.flashcards.getBySignal.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.metrics.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.listArticleSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.articlesWithSignals.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.signals.episodesWithSignals.queryKey(),
          }),
        ]);
        handleOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm<FlashcardFormData>({
    resolver: zodResolver(flashcardSchema),
    values: existingFlashcard.data
      ? {
          front: existingFlashcard.data.front,
          back: existingFlashcard.data.back,
          tags: existingFlashcard.data.tags
            ? existingFlashcard.data.tags.join(",")
            : "",
        }
      : undefined,
    defaultValues: {
      front: "",
      back: defaultBack || "",
      tags: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (existingFlashcard.data) {
      form.reset({
        front: existingFlashcard.data.front,
        back: existingFlashcard.data.back,
        tags: existingFlashcard.data.tags
          ? existingFlashcard.data.tags.join(",")
          : "",
      });
      return;
    }

    form.reset({
      front: "",
      back: defaultBack || "",
      tags: "",
    });
  }, [existingFlashcard.data, open, defaultBack, form]);

  const onSubmit = (data: FlashcardFormData) => {
    const tags = data.tags
      ? data.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (existingFlashcard.data && isSignalMode && signalId) {
      updateMutation.mutate({
        id: existingFlashcard.data.id,
        front: data.front,
        back: data.back,
        tags,
      });
    } else if (isSignalMode && signalId) {
      createMutation.mutate({
        signalId,
        front: data.front,
        back: data.back,
        tags,
      });
    } else if (articleId) {
      createFromSelectionMutation.mutate({
        articleId,
        front: data.front,
        back: data.back,
        tags,
        source: selectionSource,
      });
    }
  };

  const isLoading =
    createMutation.isPending ||
    updateMutation.isPending ||
    createFromSelectionMutation.isPending;

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      {trigger && <CredenzaTrigger asChild>{trigger}</CredenzaTrigger>}
      <CredenzaContent className="sm:max-w-5xl">
        <CredenzaHeader className="text-left">
          <CredenzaTitle className="text-left text-2xl">
            {existingFlashcard.data ? "Edit Flashcard" : "Create Flashcard"}
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Mobile: Vertical (Front → Back → Tags), Desktop: Horizontal (Back left, Front+Tags right) */}

              {/* Front field - always first on mobile, right side on desktop */}
              <div className="md:hidden">
                <FormField
                  control={form.control}
                  name="front"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Front (Question/Title)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What's the key insight here?"
                          className="min-h-[80px] max-h-[120px] overflow-y-auto resize-none"
                          maxLength={500}
                          {...field}
                        />
                      </FormControl>
                      <div className="flex items-center justify-end">
                        <span className="text-xs text-muted-foreground">
                          {field.value.length}/500
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                {/* Back field - second on mobile, left side on desktop */}
                <div className="flex-1 md:order-1">
                  <FormField
                    control={form.control}
                    name="back"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Back (Answer/Content)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Your snipped content or answer"
                            className="min-h-[200px] max-h-[300px] md:min-h-[250px] md:max-h-[350px] overflow-y-auto resize-none"
                            maxLength={5000}
                            {...field}
                          />
                        </FormControl>
                        <div className="flex items-center justify-end">
                          <span className="text-xs text-muted-foreground">
                            {field.value.length}/5000
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Front & Tags - right side on desktop only */}
                <div className="hidden md:flex md:flex-col md:flex-1 md:order-2 md:space-y-4">
                  <FormField
                    control={form.control}
                    name="front"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Front (Question/Title)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="What's the key insight here?"
                            className="min-h-[80px] max-h-[120px] overflow-y-auto resize-none"
                            maxLength={500}
                            {...field}
                          />
                        </FormControl>
                        <div className="flex items-center justify-end">
                          <span className="text-xs text-muted-foreground">
                            {field.value.length}/500
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags (optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. productivity, learning, ai"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          Separate tags with commas
                        </p>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Tags - third on mobile only */}
              <div className="md:hidden">
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. productivity, learning, ai"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        Separate tags with commas
                      </p>
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </CredenzaBody>
        <CredenzaFooter>
          <div className="flex justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              onClick={form.handleSubmit(onSubmit)}
            >
              {isLoading
                ? "Saving..."
                : existingFlashcard.data
                  ? "Update"
                  : "Create"}
            </Button>
          </div>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
