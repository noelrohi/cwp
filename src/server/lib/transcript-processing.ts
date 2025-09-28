import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embedding";
import type { db as dbInstance } from "@/server/db";
import {
  episode as episodeSchema,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import type { TranscriptData, TranscriptUtterance } from "@/types/transcript";

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

function buildChunksFromTranscript({
  transcript,
  minTokens,
  maxTokens,
}: BuildChunksParams): BuiltChunk[] {
  if (minTokens <= 0 || maxTokens <= 0 || minTokens > maxTokens) {
    throw new Error("Invalid chunking parameters supplied");
  }

  const chunks: BuiltChunk[] = [];
  let currentChunk: BuiltChunk = {
    content: "",
    speaker: null,
    startSec: 0,
    endSec: 0,
  };
  let currentCount = 0;

  // Strong semantic boundaries that indicate complete thoughts
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

  // Sentence endings that indicate thought completion
  const sentenceEndings = /[.!?]\s*$/;

  // Question patterns that indicate complete thoughts
  const questionPatterns = /\?\s*$/;

  const isStrongBoundary = (text: string): boolean => {
    return strongBoundaries.some((phrase) =>
      text.toLowerCase().startsWith(phrase.toLowerCase()),
    );
  };

  const endsWithCompleteSentence = (text: string): boolean => {
    return (
      sentenceEndings.test(text.trim()) || questionPatterns.test(text.trim())
    );
  };

  const isGoodBreakPoint = (
    utterance: TranscriptUtterance,
    nextUtterance?: TranscriptUtterance,
  ): boolean => {
    const text = utterance.transcript?.trim() || "";
    const nextText = nextUtterance?.transcript?.trim() || "";

    // Complete sentence + next starts with strong boundary
    if (
      endsWithCompleteSentence(text) &&
      nextText &&
      isStrongBoundary(nextText)
    ) {
      return true;
    }

    // Speaker change + complete sentence
    if (
      endsWithCompleteSentence(text) &&
      nextUtterance &&
      utterance.speaker !== nextUtterance.speaker
    ) {
      return true;
    }

    // Long pause (>2 seconds) + complete sentence
    const pauseDuration = nextUtterance
      ? (nextUtterance.start || 0) - (utterance.end || 0)
      : 0;
    if (endsWithCompleteSentence(text) && pauseDuration > 2) {
      return true;
    }

    return false;
  };

  const pushCurrentChunk = () => {
    if (currentCount >= minTokens && currentChunk.content.trim()) {
      chunks.push({ ...currentChunk });
    }
    currentChunk = {
      content: "",
      speaker: null,
      startSec: 0,
      endSec: 0,
    };
    currentCount = 0;
  };

  for (let i = 0; i < transcript.length; i++) {
    const utterance = transcript[i];
    const nextUtterance = transcript[i + 1];
    const text = utterance.transcript?.trim();

    if (!text) continue;

    const words = text.split(/\s+/);

    if (currentCount === 0) {
      currentChunk.startSec = Math.floor(utterance.start ?? 0);
      currentChunk.speaker = utterance.speaker?.toString() ?? null;
    }

    // Add content to current chunk
    for (const word of words) {
      currentChunk.content += currentChunk.content ? ` ${word}` : word;
      currentCount += 1;
      currentChunk.endSec = Math.floor(utterance.end ?? currentChunk.endSec);
    }

    // Check if we should break after this utterance
    const shouldBreak =
      currentCount >= minTokens &&
      // Ideal break point: semantic boundary within reasonable size
      ((currentCount <= maxTokens &&
        isGoodBreakPoint(utterance, nextUtterance)) ||
        // Force break: approaching max tokens and we have a sentence ending
        (currentCount >= maxTokens * 0.8 && endsWithCompleteSentence(text)) ||
        // Hard limit: must break to avoid oversized chunks
        currentCount >= maxTokens * 1.2);

    if (shouldBreak) {
      pushCurrentChunk();
    }
  }

  // Handle remaining content
  if (currentCount >= minTokens) {
    chunks.push({ ...currentChunk });
  }

  return chunks;
}
