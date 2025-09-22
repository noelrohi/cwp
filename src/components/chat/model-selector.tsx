"use client";

import {
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
} from "@/components/ai-elements/prompt-input";

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
}

export function ModelSelector({ model, onModelChange }: ModelSelectorProps) {
  return (
    <PromptInputModelSelect value={model} onValueChange={onModelChange}>
      <PromptInputModelSelectTrigger>
        <PromptInputModelSelectValue />
      </PromptInputModelSelectTrigger>
      <PromptInputModelSelectContent>
        {[
          {
            id: "x-ai/grok-4-fast:free",
            name: "Grok 4 Fast",
          },
          {
            id: "deepseek/deepseek-chat-v3.1:free",
            name: "DeepSeek Chat v3.1 (Free)",
          },
          { id: "openai/gpt-5-low", name: "GPT-5 (Low)" },
          { id: "openai/gpt-5-medium", name: "GPT-5 (Medium)" },
          { id: "openai/gpt-5-high", name: "GPT-5 (High)" },
          {
            id: "anthropic/claude-sonnet-4",
            name: "Claude 4 Sonnet",
          },
        ].map((m) => (
          <PromptInputModelSelectItem key={m.id} value={m.id}>
            {m.name}
          </PromptInputModelSelectItem>
        ))}
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}
