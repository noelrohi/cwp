import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embedding";
import type { db as dbInstance } from "@/server/db";
import {
  episode as episodeSchema,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import type { TranscriptData } from "@/types/transcript";

export type DatabaseClient = typeof dbInstance;
export type EpisodeRecord = typeof episodeSchema.$inferSelect;

export interface TranscriptGenerationResult {
  transcriptUrl: string;
  duration?: number;
  wasCreated: boolean;
}

export interface TranscriptChunkResult {
  chunkCount: number;
}

const defaultDeepgramOptions = {
  model: "nova-3",
  language: "en",
  smart_format: true,
  punctuate: true,
  paragraphs: true,
  diarize: true,
  utterances: true,
} as const;

interface EnsureTranscriptParams {
  db: DatabaseClient;
  episode: EpisodeRecord;
  force?: boolean;
  deepgramApiKey?: string;
}

export async function ensureEpisodeTranscript({
  db,
  episode,
  force = false,
  deepgramApiKey,
}: EnsureTranscriptParams): Promise<TranscriptGenerationResult> {
  if (!force && episode.transcriptUrl) {
    return {
      transcriptUrl: episode.transcriptUrl,
      duration: undefined,
      wasCreated: false,
    };
  }

  if (!episode.audioUrl) {
    throw new Error("Episode has no audio URL");
  }

  const apiKey = deepgramApiKey ?? process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY environment variable is not set");
  }

  try {
    await db
      .update(episodeSchema)
      .set({ status: "processing" })
      .where(eq(episodeSchema.id, episode.id));

    const deepgram = createDeepgramClient(apiKey);
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: episode.audioUrl },
      defaultDeepgramOptions,
    );

    if (error) {
      throw new Error(`Deepgram transcription failed: ${error.message}`);
    }

    const utterances = result.results.utterances;
    if (!utterances || utterances.length === 0) {
      throw new Error("Deepgram returned no utterances for this episode");
    }

    const jsonContent = JSON.stringify(utterances);
    const blob = await put(
      `transcripts/${episode.id}-${Date.now().toString()}.json`,
      jsonContent,
      {
        access: "public",
        contentType: "application/json",
      },
    );

    await db
      .update(episodeSchema)
      .set({
        transcriptUrl: blob.url,
        status: "processing",
      })
      .where(eq(episodeSchema.id, episode.id));

    return {
      transcriptUrl: blob.url,
      duration: result.metadata.duration,
      wasCreated: true,
    };
  } catch (error) {
    await db
      .update(episodeSchema)
      .set({ status: "failed" })
      .where(eq(episodeSchema.id, episode.id));

    throw error;
  }
}

interface ChunkTranscriptParams {
  db: DatabaseClient;
  episode: EpisodeRecord;
  minTokens: number;
  maxTokens: number;
  transcriptData?: TranscriptData;
}

export async function chunkEpisodeTranscript({
  db,
  episode,
  minTokens,
  maxTokens,
  transcriptData,
}: ChunkTranscriptParams): Promise<TranscriptChunkResult> {
  if (!episode.transcriptUrl) {
    throw new Error("Episode or transcript not found");
  }

  let resolvedTranscript = transcriptData;

  if (!resolvedTranscript) {
    const transcriptResponse = await fetch(episode.transcriptUrl);
    if (!transcriptResponse.ok) {
      throw new Error("Failed to fetch transcript");
    }

    resolvedTranscript = (await transcriptResponse.json()) as TranscriptData;
  }

  await db
    .delete(transcriptChunk)
    .where(eq(transcriptChunk.episodeId, episode.id));

  const chunks = buildChunksFromTranscript({
    transcript: resolvedTranscript,
    minTokens,
    maxTokens,
  });

  let index = 0;
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content);
    await db.insert(transcriptChunk).values({
      id: `chunk_${episode.id}_${index}`,
      episodeId: episode.id,
      speaker: chunk.speaker,
      content: chunk.content,
      startTimeSec: chunk.startSec,
      endTimeSec: chunk.endSec,
      embedding,
    });
    index += 1;
  }

  return { chunkCount: chunks.length };
}

interface BuildChunksParams {
  transcript: TranscriptData;
  minTokens: number;
  maxTokens: number;
}

interface BuiltChunk {
  content: string;
  speaker: string | null;
  startSec: number;
  endSec: number;
}

interface TimestampedWord {
  word: string;
  start: number;
  end: number;
  speaker: number | undefined;
  utteranceIndex: number;
}

function extractWordsWithTimestamps(
  transcript: TranscriptData,
): TimestampedWord[] {
  const allWords: TimestampedWord[] = [];

  for (let uttIdx = 0; uttIdx < transcript.length; uttIdx++) {
    const utterance = transcript[uttIdx];

    if (!utterance.words || utterance.words.length === 0) {
      const words = (utterance.transcript || "").trim().split(/\s+/);
      const duration = (utterance.end || 0) - (utterance.start || 0);
      const timePerWord = words.length > 0 ? duration / words.length : 0;

      words.forEach((word, wordIdx) => {
        if (word.trim()) {
          allWords.push({
            word: word.trim(),
            start: (utterance.start || 0) + wordIdx * timePerWord,
            end: (utterance.start || 0) + (wordIdx + 1) * timePerWord,
            speaker: utterance.speaker,
            utteranceIndex: uttIdx,
          });
        }
      });
    } else {
      utterance.words.forEach((word) => {
        if (word.word.trim()) {
          allWords.push({
            word: word.punctuated_word || word.word,
            start: word.start,
            end: word.end,
            speaker: word.speaker ?? utterance.speaker,
            utteranceIndex: uttIdx,
          });
        }
      });
    }
  }

  return allWords;
}

function createSemanticBreakDetector(
  allWords: TimestampedWord[],
  transcript: TranscriptData,
) {
  const strongBoundaries = [
    "So ",
    "Now ",
    "But here's ",
    "The thing is",
    "Let me tell you",
    "For example",
    "Speaking of",
    "Actually",
    "You know what",
    "Here's the thing",
    "What's interesting",
    "My point is",
    "The reality is",
    "To be honest",
    "In my experience",
    "What I've learned",
    "The bottom line",
    "Anyway",
    "Moving on",
    "That said",
    "In other words",
    "To summarize",
    "The key thing",
    "What matters",
  ];

  // Enhanced punctuation patterns - prioritize sentence endings
  const strongPunctuation = /[.!?]+\s*$/;
  const mediumPunctuation = /[,;:]\s*$/;

  return function isGoodBreakPoint(wordIndex: number): {
    shouldBreak: boolean;
    mustBreak: boolean;
    priority: "high" | "medium" | "low";
  } {
    if (wordIndex >= allWords.length - 1) {
      return { shouldBreak: true, mustBreak: true, priority: "high" };
    }

    const currentWord = allWords[wordIndex];
    const nextWord = allWords[wordIndex + 1];

    // MUST break on speaker change - this is non-negotiable
    if (currentWord.speaker !== nextWord.speaker) {
      return { shouldBreak: true, mustBreak: true, priority: "high" };
    }

    // MUST break on large gaps (likely pauses)
    if (nextWord.start - currentWord.end > 3) {
      return { shouldBreak: true, mustBreak: true, priority: "high" };
    }

    // HIGH priority: Strong punctuation + semantic boundaries
    if (strongPunctuation.test(currentWord.word.trim())) {
      if (
        strongBoundaries.some((phrase) =>
          nextWord.word.toLowerCase().startsWith(phrase.toLowerCase()),
        )
      ) {
        return { shouldBreak: true, mustBreak: false, priority: "high" };
      }

      // HIGH priority: sentence ending + utterance boundary
      if (currentWord.utteranceIndex !== nextWord.utteranceIndex) {
        const currentUtterance = transcript[currentWord.utteranceIndex];
        const nextUtterance = transcript[nextWord.utteranceIndex];
        if (nextUtterance.start - currentUtterance.end > 0.5) {
          return { shouldBreak: true, mustBreak: false, priority: "high" };
        }
      }

      // MEDIUM priority: just sentence ending
      return { shouldBreak: true, mustBreak: false, priority: "medium" };
    }

    // MEDIUM priority: Medium punctuation at utterance boundary
    if (
      mediumPunctuation.test(currentWord.word.trim()) &&
      currentWord.utteranceIndex !== nextWord.utteranceIndex
    ) {
      return { shouldBreak: true, mustBreak: false, priority: "medium" };
    }

    return { shouldBreak: false, mustBreak: false, priority: "low" };
  };
}

function buildChunksFromTranscript({
  transcript,
  minTokens,
  maxTokens,
}: BuildChunksParams): BuiltChunk[] {
  if (minTokens <= 0 || maxTokens <= 0 || minTokens > maxTokens) {
    throw new Error("Invalid chunking parameters supplied");
  }

  const allWords = extractWordsWithTimestamps(transcript);
  if (allWords.length === 0) return [];

  const getBreakPoint = createSemanticBreakDetector(allWords, transcript);
  const chunks: BuiltChunk[] = [];

  let currentChunk: BuiltChunk = {
    content: "",
    speaker: null,
    startSec: 0,
    endSec: 0,
  };
  let currentCount = 0;

  const pushCurrentChunk = () => {
    if (currentCount > 0 && currentChunk.content.trim()) {
      // Only push chunks that meet minimum length OR are complete speaker turns
      if (
        currentCount >= minTokens ||
        currentChunk.content.includes(".") ||
        currentChunk.content.includes("!") ||
        currentChunk.content.includes("?")
      ) {
        chunks.push({ ...currentChunk });
      }
    }
    currentChunk = { content: "", speaker: null, startSec: 0, endSec: 0 };
    currentCount = 0;
  };

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];

    // Initialize chunk with first word
    if (currentCount === 0) {
      currentChunk.startSec = Math.floor(word.start);
      currentChunk.speaker = word.speaker?.toString() ?? null;
    }

    // CRITICAL: Verify speaker consistency within chunk
    const wordSpeaker = word.speaker?.toString() ?? null;
    if (currentCount > 0 && currentChunk.speaker !== wordSpeaker) {
      // Force break on speaker change - this should never happen with our new logic
      // but adding as a safety net
      pushCurrentChunk();

      // Start new chunk with this word
      currentChunk.startSec = Math.floor(word.start);
      currentChunk.speaker = wordSpeaker;
    }

    currentChunk.content += currentChunk.content ? ` ${word.word}` : word.word;
    currentCount += 1;
    currentChunk.endSec = Math.ceil(word.end);

    const breakInfo = getBreakPoint(i);

    // Determine if we should break
    let shouldBreak = false;

    if (breakInfo.mustBreak) {
      // Mandatory breaks (speaker changes, long pauses)
      shouldBreak = true;
    } else if (currentCount >= maxTokens * 1.1) {
      // Hard limit - must break even if not ideal
      shouldBreak = true;
    } else if (currentCount >= minTokens) {
      // We have minimum content, check for good break points
      if (breakInfo.priority === "high") {
        // High priority breaks (sentence endings + semantic boundaries)
        shouldBreak = true;
      } else if (
        currentCount >= maxTokens * 0.8 &&
        breakInfo.priority === "medium"
      ) {
        // Medium priority breaks when approaching max length
        shouldBreak = true;
      } else if (currentCount >= maxTokens * 0.9 && breakInfo.shouldBreak) {
        // Any break point when very close to max length
        shouldBreak = true;
      }
    }

    if (shouldBreak) {
      pushCurrentChunk();
    }
  }

  // Handle final chunk
  if (currentCount > 0) {
    pushCurrentChunk();
  }

  return chunks;
}
