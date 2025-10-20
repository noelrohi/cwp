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

const standaloneFlashcardSchema = z.object({
  front: z
    .string()
    .min(1, "Question/Statement is required")
    .max(500, "Question must be 500 characters or less"),
  back: z
    .string()
    .min(1, "Answer is required")
    .max(5000, "Answer must be 5000 characters or less"),
  tags: z.string().optional(),
  source: z
    .string()
    .min(1, "Source is required")
    .max(500, "Source must be 500 characters or less"),
});

type StandaloneFlashcardFormData = z.infer<typeof standaloneFlashcardSchema>;

type StandaloneSnipDialogProps = {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultBack?: string;
};

export function StandaloneSnipDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultBack,
}: StandaloneSnipDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const createMutation = useMutation(
    trpc.flashcards.createStandalone.mutationOptions({
      onSuccess: async () => {
        toast.success("Snip created");
        await queryClient.invalidateQueries({
          queryKey: trpc.flashcards.list.queryKey(),
        });
        handleOpenChange(false);
        form.reset();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm<StandaloneFlashcardFormData>({
    resolver: zodResolver(standaloneFlashcardSchema),
    defaultValues: {
      front: "",
      back: defaultBack || "",
      tags: "",
      source: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    // Reset form with default values when dialog opens
    form.reset({
      front: "",
      back: defaultBack || "",
      tags: "",
      source: "",
    });
  }, [open, defaultBack, form]);

  const onSubmit = (data: StandaloneFlashcardFormData) => {
    const tags = data.tags
      ? data.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    createMutation.mutate({
      front: data.front,
      back: data.back,
      tags,
      source: data.source,
    });
  };

  const isLoading = createMutation.isPending;

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      {trigger && <CredenzaTrigger asChild>{trigger}</CredenzaTrigger>}
      <CredenzaContent className="sm:max-w-5xl">
        <CredenzaHeader className="text-left">
          <CredenzaTitle className="text-left text-2xl">
            Create Snip
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="overflow-y-auto">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 [&_input]:font-medium [&_textarea]:font-medium [&_input::placeholder]:font-normal [&_textarea::placeholder]:font-normal [&_input::placeholder]:italic [&_textarea::placeholder]:italic [&_input::placeholder]:opacity-60 [&_textarea::placeholder]:opacity-60"
            >
              <div className="md:hidden">
                <FormField
                  control={form.control}
                  name="front"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question/Statement</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What's the key insight?"
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
                <div className="flex-1 md:order-1">
                  <FormField
                    control={form.control}
                    name="back"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Answer</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Your answer or content"
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

                <div className="hidden md:flex md:flex-col md:flex-1 md:order-2 md:space-y-4">
                  <FormField
                    control={form.control}
                    name="front"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question/Statement</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="What's the key insight?"
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

              <div className="md:hidden space-y-4">
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
              {isLoading ? "Creating..." : "Create Snip"}
            </Button>
          </div>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
