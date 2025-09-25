"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { TranscriptData } from "@/types/transcript";

interface TranscriptDisplayProps {
  transcript: TranscriptData;
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

interface TranscriptParagraph {
  startTime: number;
  endTime: number;
  text: string;
  speaker?: number;
}

function groupSegmentsIntoParagraphs(
  segments: Array<{
    start: number;
    end: number;
    transcript: string;
    text?: string;
    startSecond?: number;
    endSecond?: number;
    speaker?: number;
  }>,
): TranscriptParagraph[] {
  if (!segments || segments.length === 0) return [];

  const paragraphs: TranscriptParagraph[] = [];
  let currentParagraph: TranscriptParagraph = {
    startTime: 0,
    endTime: 0,
    text: "",
    speaker: undefined,
  };

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const text = segment.transcript || segment.text || "";
    const startTime = segment.start || segment.startSecond || 0;
    const endTime = segment.end || segment.endSecond || startTime;

    // Start new paragraph if this is the first segment
    if (currentParagraph.text === "") {
      currentParagraph.startTime = startTime;
      currentParagraph.text = text;
      currentParagraph.endTime = endTime;
      currentParagraph.speaker = segment.speaker;
    } else {
      // Check if we should start a new paragraph
      const shouldStartNewParagraph =
        // Long pause (more than 3 seconds gap)
        startTime - currentParagraph.endTime > 3 ||
        // Current paragraph is getting too long (more than 300 characters)
        currentParagraph.text.length > 300 ||
        // Text ends with sentence-ending punctuation and there's a pause
        (/[.!?]\s*$/.test(currentParagraph.text.trim()) &&
          startTime - currentParagraph.endTime > 1) ||
        // Speaker changed
        (segment.speaker !== undefined &&
          segment.speaker !== currentParagraph.speaker);

      if (shouldStartNewParagraph) {
        // Finish current paragraph
        paragraphs.push({ ...currentParagraph });
        // Start new paragraph
        currentParagraph = {
          startTime: startTime,
          endTime: endTime,
          text: text,
          speaker: segment.speaker,
        };
      } else {
        // Continue current paragraph
        // biome-ignore lint/style/useTemplate: **
        currentParagraph.text += " " + text;
        currentParagraph.endTime = endTime;
      }
    }
  }

  // Add the last paragraph if it has content
  if (currentParagraph.text.trim()) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
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

  // Get segments and group them into paragraphs
  const getSegments = () => {
    // Use utterances from Deepgram response as segments
    if (transcript && transcript.length > 0) {
      return transcript.map((utterance) => ({
        start: utterance.start,
        end: utterance.end,
        transcript: utterance.transcript,
        text: utterance.transcript,
        speaker: utterance.speaker,
      }));
    }

    return [];
  };

  const segments = getSegments();
  const paragraphs =
    segments.length > 0 ? groupSegmentsIntoParagraphs(segments) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Transcript</h2>
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
        <div className="space-y-4">
          {paragraphs.length > 0
            ? // Display paragraphs grouped from segments
              paragraphs.map((paragraph, index) => (
                <div key={index} className="flex gap-3">
                  <span className="text-xs text-muted-foreground font-mono min-w-[4rem] mt-0.5">
                    {formatTimestamp(paragraph.startTime)}
                  </span>
                  <div className="flex-1">
                    {paragraph.speaker !== undefined && (
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Speaker {paragraph.speaker}:
                      </div>
                    )}
                    <span className="text-sm leading-relaxed">
                      <HighlightedText
                        text={paragraph.text}
                        searchTerm={searchTerm}
                      />
                    </span>
                  </div>
                </div>
              ))
            : segments.length > 0
              ? // Fallback to individual segments if paragraph grouping fails
                segments.map((segment, index) => (
                  <div key={index} className="flex gap-3">
                    <span className="text-xs text-muted-foreground font-mono min-w-[4rem] mt-0.5">
                      {formatTimestamp(segment.start || 0)}
                    </span>
                    <div className="flex-1">
                      {segment.speaker !== undefined && (
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          Speaker {segment.speaker}:
                        </div>
                      )}
                      <span className="text-sm leading-relaxed">
                        <HighlightedText
                          text={segment.transcript || segment.text || ""}
                          searchTerm={searchTerm}
                        />
                      </span>
                    </div>
                  </div>
                ))
              : null}
        </div>
      </div>
    </div>
  );
}
