"use client";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { TranscriptData } from "@/types/transcript";

interface TranscriptDisplayProps {
  transcript: TranscriptData;
  speakerMappings?: Record<string, string> | null;
}

interface HighlightedTextProps {
  text: string;
  searchTerm: string;
  currentMatchIndex: number;
  matchIndexInText: number;
}

function HighlightedText({
  text,
  searchTerm,
  currentMatchIndex,
  matchIndexInText,
}: HighlightedTextProps) {
  if (!searchTerm.trim()) {
    return <>{text}</>;
  }

  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = text.split(regex);
  let matchCounter = matchIndexInText;

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark
            key={index}
            className={`px-1 rounded ${matchCounter === currentMatchIndex ? "bg-orange-400" : "bg-yellow-200"}`}
            data-match-index={matchCounter++}
          >
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

    if (currentParagraph.text === "") {
      currentParagraph.startTime = startTime;
      currentParagraph.text = text;
      currentParagraph.endTime = endTime;
      currentParagraph.speaker = segment.speaker;
    } else {
      const shouldStartNewParagraph =
        startTime - currentParagraph.endTime > 3 ||
        currentParagraph.text.length > 300 ||
        (/[.!?]\s*$/.test(currentParagraph.text.trim()) &&
          startTime - currentParagraph.endTime > 1) ||
        (segment.speaker !== undefined &&
          segment.speaker !== currentParagraph.speaker);

      if (shouldStartNewParagraph) {
        paragraphs.push({ ...currentParagraph });
        currentParagraph = {
          startTime: startTime,
          endTime: endTime,
          text: text,
          speaker: segment.speaker,
        };
      } else {
        currentParagraph.text += ` ${text}`;
        currentParagraph.endTime = endTime;
      }
    }
  }

  if (currentParagraph.text.trim()) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
}

export function TranscriptDisplay({
  transcript,
  speakerMappings,
}: TranscriptDisplayProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setCurrentMatchIndex(0);
  };

  const segments = useMemo(() => {
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
  }, [transcript]);

  const paragraphs = useMemo(
    () => (segments.length > 0 ? groupSegmentsIntoParagraphs(segments) : []),
    [segments],
  );

  const getSpeakerName = (speakerIndex: number | undefined): string => {
    if (speakerIndex === undefined) return "";
    const speakerKey = speakerIndex.toString();
    if (speakerMappings?.[speakerKey]) {
      return speakerMappings[speakerKey];
    }
    return `Speaker ${speakerIndex}`;
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setTotalMatches(0);
      return;
    }

    const regex = new RegExp(
      searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    let count = 0;

    for (const paragraph of paragraphs) {
      const matches = paragraph.text.match(regex);
      if (matches) {
        count += matches.length;
      }
    }

    setTotalMatches(count);
    setCurrentMatchIndex(0);
  }, [searchTerm, paragraphs]);

  useEffect(() => {
    if (totalMatches === 0 || !containerRef.current) return;

    const currentMark = containerRef.current.querySelector(
      `mark[data-match-index="${currentMatchIndex}"]`,
    );
    if (currentMark) {
      currentMark.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentMatchIndex, totalMatches]);

  const handleNext = () => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
  };

  const handlePrevious = () => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
  };

  let globalMatchIndex = 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search transcript..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-24"
            />
            {searchTerm && (
              <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handlePrevious}
                  disabled={totalMatches === 0}
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleNext}
                  disabled={totalMatches === 0}
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleSearch("")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} />
                </Button>
              </div>
            )}
          </div>
          {searchTerm && totalMatches > 0 && (
            <span className="text-base text-muted-foreground whitespace-nowrap">
              {currentMatchIndex + 1} / {totalMatches}
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="bg-muted/50 rounded-lg p-6 max-h-[60svh] sm:max-h-[70svh] overflow-y-auto"
      >
        <div className="space-y-4">
          {paragraphs.length > 0
            ? paragraphs.map((paragraph, index) => {
                const matchIndexInText = globalMatchIndex;
                const regex = new RegExp(
                  searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "gi",
                );
                const matches = paragraph.text.match(regex);
                if (matches) {
                  globalMatchIndex += matches.length;
                }

                return (
                  <div key={index} className="flex gap-3">
                    <span className="text-sm sm:text-base text-muted-foreground font-mono min-w-[4rem] mt-0.5">
                      {formatTimestamp(paragraph.startTime)}
                    </span>
                    <div className="flex-1">
                      {paragraph.speaker !== undefined && (
                        <div className="text-sm sm:text-base font-medium text-muted-foreground mb-1">
                          {getSpeakerName(paragraph.speaker)}:
                        </div>
                      )}
                      <span className="text-sm sm:text-base leading-relaxed">
                        <HighlightedText
                          text={paragraph.text}
                          searchTerm={searchTerm}
                          currentMatchIndex={currentMatchIndex}
                          matchIndexInText={matchIndexInText}
                        />
                      </span>
                    </div>
                  </div>
                );
              })
            : segments.length > 0
              ? segments.map((segment, index) => {
                  const matchIndexInText = globalMatchIndex;
                  const regex = new RegExp(
                    searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                    "gi",
                  );
                  const text = segment.transcript || segment.text || "";
                  const matches = text.match(regex);
                  if (matches) {
                    globalMatchIndex += matches.length;
                  }

                  return (
                    <div key={index} className="flex gap-3">
                      <span className="text-base text-muted-foreground font-mono min-w-[4rem] mt-0.5">
                        {formatTimestamp(segment.start || 0)}
                      </span>
                      <div className="flex-1">
                        {segment.speaker !== undefined && (
                          <div className="text-base font-medium text-muted-foreground mb-1">
                            {getSpeakerName(segment.speaker)}:
                          </div>
                        )}
                        <span className="text-base leading-relaxed">
                          <HighlightedText
                            text={text}
                            searchTerm={searchTerm}
                            currentMatchIndex={currentMatchIndex}
                            matchIndexInText={matchIndexInText}
                          />
                        </span>
                      </div>
                    </div>
                  );
                })
              : null}
        </div>
      </div>
    </div>
  );
}
