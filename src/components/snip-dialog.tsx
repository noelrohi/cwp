"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  source: z.string().optional(),
});

type FlashcardFormData = z.infer<typeof flashcardSchema>;

type SnipDialogProps = {
  signalId?: string;
  articleId?: string;
  flashcardId?: string;
  defaultBack?: string;
  defaultFront?: string;
  defaultTags?: string[];
  defaultSource?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectionSource?: "summary" | "article";
};

export function SnipDialog({
  signalId,
  articleId,
  flashcardId,
  defaultBack,
  defaultFront,
  defaultTags,
  defaultSource,
  trigger,
  open: controlledOpen,
  onOpenChange,
  selectionSource,
}: SnipDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);

  if (!signalId && !articleId && !flashcardId) {
    throw new Error(
      "SnipDialog requires either a signalId, articleId, or flashcardId",
    );
  }

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const isEditMode = Boolean(flashcardId);
  const isSignalMode = Boolean(signalId);

  const createMutation = useMutation(
    trpc.flashcards.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Flashcard created", {
          action: {
            label: "View Snips",
            onClick: () => {
              window.location.href = "/snips";
            },
          },
        });
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
        toast.success("Flashcard created", {
          action: {
            label: "View Snips",
            onClick: () => {
              window.location.href = "/snips";
            },
          },
        });
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
    defaultValues: {
      front: defaultFront || "",
      back: defaultBack || "",
      tags: defaultTags?.join(",") || "",
      source: defaultSource || "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    // Reset form with default values when dialog opens
    form.reset({
      front: defaultFront || "",
      back: defaultBack || "",
      tags: defaultTags?.join(",") || "",
      source: defaultSource || "",
    });
  }, [open, defaultFront, defaultBack, defaultTags, defaultSource, form]);

  const onSubmit = (data: FlashcardFormData) => {
    const tags = data.tags
      ? data.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (isEditMode && flashcardId) {
      // Edit mode - update existing flashcard
      updateMutation.mutate({
        id: flashcardId,
        front: data.front,
        back: data.back,
        tags,
        source: data.source,
      });
    } else if (isSignalMode && signalId) {
      // Create mode - from signal
      createMutation.mutate({
        signalId,
        front: data.front,
        back: data.back,
        tags,
      });
    } else if (articleId) {
      // Create mode - from article selection
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
            {isEditMode ? "Edit Snip" : "Create Snip"}
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="overflow-y-auto">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 [&_input]:font-medium [&_textarea]:font-medium [&_input::placeholder]:font-normal [&_textarea::placeholder]:font-normal [&_input::placeholder]:italic [&_textarea::placeholder]:italic [&_input::placeholder]:opacity-60 [&_textarea::placeholder]:opacity-60"
            >
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
                  {(isEditMode || defaultSource) && (
                    <FormField
                      control={form.control}
                      name="source"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Source</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Book: Deep Work, https://example.com/article"
                              maxLength={500}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              {/* Tags and Source - third on mobile only */}
              <div className="md:hidden space-y-4">
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
                {(isEditMode || defaultSource) && (
                  <FormField
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Book: Deep Work, https://example.com/article"
                            maxLength={500}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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
              {isLoading ? "Saving..." : isEditMode ? "Update" : "Create"}
            </Button>
          </div>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
