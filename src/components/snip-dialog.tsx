"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
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
    .max(250, "Front must be 250 characters or less"),
  back: z
    .string()
    .min(1, "Back is required")
    .max(1000, "Back must be 1000 characters or less"),
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
    if (newOpen && existingFlashcard.data) {
      const existingTags = Array.isArray(existingFlashcard.data.tags)
        ? existingFlashcard.data.tags.join(", ")
        : "";
      form.reset({
        front: existingFlashcard.data.front,
        back: existingFlashcard.data.back,
        tags: existingTags,
      });
    } else if (newOpen) {
      form.reset({
        front: "",
        back: defaultBack || "",
        tags: "",
      });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existingFlashcard.data ? "Edit Flashcard" : "Create Flashcard"}
          </DialogTitle>
          <DialogDescription>
            Create a flashcard to remember this insight. The front can be a
            question or blog post title, and the back is your snipped content.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="front"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Front (Question/Title)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What's the key insight here?"
                      className="min-h-[100px]"
                      maxLength={250}
                      {...field}
                    />
                  </FormControl>
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-muted-foreground">
                      {field.value.length}/250
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="back"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Back (Answer/Content)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Your snipped content or answer"
                      className="min-h-[150px]"
                      maxLength={1000}
                      {...field}
                    />
                  </FormControl>
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-muted-foreground">
                      {field.value.length}/1000
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? "Saving..."
                  : existingFlashcard.data
                    ? "Update"
                    : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
