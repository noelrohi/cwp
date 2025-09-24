"use client";

import type { experimental_transcribe as transcribe } from "ai";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TranscriptionResult = Awaited<ReturnType<typeof transcribe>>;
interface TranscriptDisplayProps {
  transcript: TranscriptionResult;
  onClose: () => void;
}

interface HighlightedTextProps {
  text: string;
  searchTerm: string;
}

function HighlightedText({ text, searchTerm }: HighlightedTextProps) {
  if (!searchTerm.trim()) {
    return <>{text}</>;
  }

  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 px-1 rounded">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function TranscriptDisplay({
  transcript,
  onClose,
}: TranscriptDisplayProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Search functionality
  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Transcript</h2>
          {transcript.language && (
            <p className="text-sm text-muted-foreground">
              Language: {transcript.language}
              {transcript.durationInSeconds && (
                <span>
                  {" "}
                  • Duration: {formatTimestamp(transcript.durationInSeconds)}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search transcript..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 w-64"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => handleSearch("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Hide
          </Button>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-6 max-h-96 overflow-y-auto">
        <div className="space-y-3">
          {transcript.segments && transcript.segments.length > 0 ? (
            // Display segments with timestamps
            transcript.segments.map((segment, index) => (
              <div key={index} className="flex gap-3">
                <span className="text-xs text-muted-foreground font-mono min-w-[4rem] mt-0.5">
                  {formatTimestamp(segment.startSecond)}
                </span>
                <span className="text-sm leading-relaxed flex-1">
                  <HighlightedText
                    text={segment.text}
                    searchTerm={searchTerm}
                  />
                </span>
              </div>
            ))
          ) : (
            // Fall back to full text if no segments
            <div className="text-sm leading-relaxed">
              <HighlightedText text={transcript.text} searchTerm={searchTerm} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
