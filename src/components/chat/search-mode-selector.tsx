"use client";

import { useState } from "react";
import { CheckIcon, GlobeIcon, LayersIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";

interface SearchModeSelectorProps {
  searchMode: "similarity" | "sonar";
  onSearchModeChange: (mode: "similarity" | "sonar") => void;
}

export function SearchModeSelector({
  searchMode,
  onSearchModeChange,
}: SearchModeSelectorProps) {
  const [searchPickerOpen, setSearchPickerOpen] = useState(false);

  return (
    <Popover open={searchPickerOpen} onOpenChange={setSearchPickerOpen}>
      <PopoverTrigger asChild>
        <PromptInputButton
          variant="ghost"
          onClick={() => setSearchPickerOpen(true)}
        >
          {searchMode === "sonar" ? (
            <GlobeIcon className="size-4" />
          ) : (
            <LayersIcon className="size-4" />
          )}
          <span>Search</span>
        </PromptInputButton>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search modes..." />
          <CommandList>
            <CommandEmpty>No modes found.</CommandEmpty>
            <CommandGroup heading="Search Mode">
              <CommandItem
                value="sonar"
                onSelect={() => {
                  onSearchModeChange("sonar");
                  setSearchPickerOpen(false);
                }}
              >
                <div className="flex items-start gap-2 w-full">
                  <GlobeIcon className="mt-0.5 size-4" />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">Web</span>
                    <span className="text-muted-foreground text-xs">
                      Search across the internet via Perplexity Sonar
                    </span>
                  </div>
                  {searchMode === "sonar" ? (
                    <CheckIcon className="ml-auto size-4 opacity-70" />
                  ) : null}
                </div>
              </CommandItem>
              <CommandItem
                value="similarity"
                onSelect={() => {
                  onSearchModeChange("similarity");
                  setSearchPickerOpen(false);
                }}
              >
                <div className="flex items-start gap-2 w-full">
                  <LayersIcon className="mt-0.5 size-4" />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">Similarity</span>
                    <span className="text-muted-foreground text-xs">
                      Search podcast segments via vector similarity
                    </span>
                  </div>
                  {searchMode === "similarity" ? (
                    <CheckIcon className="ml-auto size-4 opacity-70" />
                  ) : null}
                </div>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
