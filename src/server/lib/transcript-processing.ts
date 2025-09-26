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

  const pushCurrentChunk = () => {
    if (currentCount >= minTokens) {
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

  const appendUtterance = (utterance: TranscriptUtterance) => {
    const text = utterance.transcript?.trim();
    if (!text) {
      return;
    }

    const words = text.split(/\s+/);
    if (currentCount === 0) {
      currentChunk.startSec = Math.floor(utterance.start ?? 0);
      currentChunk.speaker = utterance.speaker?.toString() ?? null;
    }

    for (const word of words) {
      if (currentCount >= maxTokens) {
        currentChunk.endSec = Math.floor(
          utterance.start ?? currentChunk.endSec,
        );
        pushCurrentChunk();
        currentChunk.startSec = Math.floor(utterance.start ?? 0);
        currentChunk.speaker = utterance.speaker?.toString() ?? null;
      }

      currentChunk.content += currentChunk.content ? ` ${word}` : word;
      currentCount += 1;
      currentChunk.endSec = Math.floor(utterance.end ?? currentChunk.endSec);
    }
  };

  for (const utterance of transcript) {
    appendUtterance(utterance);
  }

  if (currentCount >= minTokens) {
    chunks.push({ ...currentChunk });
  }

  return chunks;
}
