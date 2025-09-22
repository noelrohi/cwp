"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import type { MyUIMessage } from "@/ai/schema";
import { Button } from "@/components/ui/button";

interface LatestSuggestionsProps {
  messages: MyUIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  onPick: (text: string) => void;
}

export function LatestSuggestions({
  messages,
  status,
  onPick,
}: LatestSuggestionsProps) {
  const [dismissedFromMessageId, setDismissedFromMessageId] = useState<
    string | null
  >(null);

  // Get the latest assistant message that has suggestions
  let latest: { id: string; suggestions: string[] } | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const p = m.parts.find((x) => x.type === "data-suggestions");
    if (p && Array.isArray(p.data) && p.data.length > 0) {
      latest = { id: m.id, suggestions: p.data as string[] };
      break;
    }
  }

  // Reset dismissal when a new suggestions message arrives
  const latestId = latest?.id ?? null;
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (latestId && lastIdRef.current !== latestId) {
      setDismissedFromMessageId(null);
      lastIdRef.current = latestId;
    }
  }, [latestId]);

  const shouldShow =
    status === "ready" &&
    latest &&
    latest.suggestions.length > 0 &&
    dismissedFromMessageId !== latest.id;

  if (!shouldShow) return null;

  return (
    <div className="mx-auto mb-3 w-full max-w-3xl px-4">
      <div className="rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium">
          <span className="tracking-tight">Suggested questions</span>
        </div>
        <div className="divide-y">
          {latest?.suggestions.map((s, idx) => (
            <div key={`${idx}-${s}`} className="flex items-center px-4 py-3">
              <div className="flex-1 text-sm text-foreground/90">{s}</div>
              <Button
                size="icon"
                variant="ghost"
                className="ml-2 size-6 rounded-full"
                onClick={() => {
                  onPick(s);
                  setDismissedFromMessageId(latest?.id ?? null);
                }}
                aria-label="Ask this question"
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
