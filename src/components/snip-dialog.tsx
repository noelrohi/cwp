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
  signalId: string;
  defaultBack?: string;
  trigger: React.ReactNode;
};

export function SnipDialog({
  signalId,
  defaultBack,
  trigger,
}: SnipDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const existingFlashcard = useQuery({
    ...trpc.flashcards.getBySignal.queryOptions({ signalId }),
    enabled: open,
  });

  const createMutation = useMutation(
    trpc.flashcards.create.mutationOptions({
      onSuccess: () => {
        toast.success("Flashcard created");
        queryClient.invalidateQueries({
          queryKey: trpc.flashcards.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.metrics.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.listArticleSignals.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articlesWithSignals.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.episodesWithSignals.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.flashcards.getBySignal.queryKey(),
        });
        setOpen(false);
        form.reset();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.flashcards.update.mutationOptions({
      onSuccess: () => {
        toast.success("Flashcard updated");
        queryClient.invalidateQueries({
          queryKey: trpc.flashcards.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.flashcards.getBySignal.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.metrics.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.listArticleSignals.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.articlesWithSignals.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.signals.episodesWithSignals.queryKey(),
        });
        setOpen(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm<FlashcardFormData>({
    resolver: zodResolver(flashcardSchema),
    defaultValues: {
      front: "",
      back: defaultBack || "",
      tags: "",
    },
  });

  // Reset form when existing flashcard data loads
  useEffect(() => {
    if (existingFlashcard.data) {
      form.reset({
        front: existingFlashcard.data.front,
        back: existingFlashcard.data.back,
        tags: existingFlashcard.data.tags
          ? existingFlashcard.data.tags.join(",")
          : "",
      });
    } else if (open) {
      // Reset to default values when creating new flashcard
      form.reset({
        front: "",
        back: defaultBack || "",
        tags: "",
      });
    }
  }, [existingFlashcard.data, open, defaultBack, form]);

  const onSubmit = (data: FlashcardFormData) => {
    const tags = data.tags
      ? data.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (existingFlashcard.data) {
      updateMutation.mutate({
        id: existingFlashcard.data.id,
        front: data.front,
        back: data.back,
        tags,
      });
    } else {
      createMutation.mutate({
        signalId,
        front: data.front,
        back: data.back,
        tags,
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaTrigger asChild>{trigger}</CredenzaTrigger>
      <CredenzaContent className="max-w-6xl">
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
                          className="min-h-[120px]"
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
                            className="min-h-[300px] md:min-h-[400px]"
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
                            className="min-h-[120px]"
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
              onClick={() => setOpen(false)}
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
