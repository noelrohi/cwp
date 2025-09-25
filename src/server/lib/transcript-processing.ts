import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { put } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateEmbedding } from "@/lib/embedding";
import type { db as dbInstance } from "@/server/db";
import {
  episode as episodeSchema,
  patternEvidence,
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
        status: "processed",
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

export type EvidenceRecord = typeof patternEvidence.$inferSelect;

export interface EvidenceInput {
  patternId: string;
  episodeId: string;
  userId: string;
  speaker: string | null;
  content: string;
  evidenceType: (typeof patternEvidence.$inferInsert)["evidenceType"];
  entityLabel?: string | null;
  entityCategory?: string | null;
  confidence?: number | null;
  showAtSec?: number | null;
  endAtSec?: number | null;
  episodeTitle?: string | null;
  podcastTitle?: string | null;
  podcastSeries?: string | null;
}

export async function saveEvidenceRecords(
  db: DatabaseClient,
  evidences: EvidenceInput[],
) {
  if (evidences.length === 0) {
    return;
  }

  const sanitizeIdSegment = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const buildEvidenceId = (item: EvidenceInput) => {
    const segments = ["evidence", item.patternId, item.episodeId];

    if (item.showAtSec != null) {
      segments.push(`t${item.showAtSec}`);
    }
    if (item.evidenceType) {
      segments.push(item.evidenceType);
    }

    if (item.entityLabel) {
      const sanitisedLabel = sanitizeIdSegment(item.entityLabel);
      if (sanitisedLabel) {
        segments.push(sanitisedLabel);
      }
    }

    const candidate = segments.join("_");
    if (candidate.length <= 255) {
      return candidate;
    }

    return `${candidate.slice(0, 200)}_${nanoid(6)}`;
  };

  const values = evidences.map((item) => ({
    id:
      item.showAtSec == null
        ? `evidence_${item.patternId}_${nanoid(6)}`
        : buildEvidenceId(item),
    patternId: item.patternId,
    episodeId: item.episodeId,
    userId: item.userId,
    speaker: item.speaker,
    content: item.content,
    evidenceType: item.evidenceType,
    entityLabel: item.entityLabel ?? null,
    entityCategory: item.entityCategory ?? null,
    confidence: item.confidence ?? null,
    showAtSec: item.showAtSec ?? null,
    endAtSec: item.endAtSec ?? null,
    episodeTitle: item.episodeTitle ?? null,
    podcastTitle: item.podcastTitle ?? null,
    podcastSeries: item.podcastSeries ?? null,
  }));

  await db
    .insert(patternEvidence)
    .values(values)
    .onConflictDoUpdate({
      target: patternEvidence.id,
      set: {
        patternId: sql`excluded.pattern_id`,
        episodeId: sql`excluded.episode_id`,
        userId: sql`excluded.user_id`,
        speaker: sql`excluded.speaker`,
        content: sql`excluded.content`,
        evidenceType: sql`excluded.evidence_type`,
        entityLabel: sql`excluded.entity_label`,
        entityCategory: sql`excluded.entity_category`,
        confidence: sql`excluded.confidence`,
        showAtSec: sql`excluded.show_at_sec`,
        endAtSec: sql`excluded.end_at_sec`,
        episodeTitle: sql`excluded.episode_title`,
        podcastTitle: sql`excluded.podcast_title`,
        podcastSeries: sql`excluded.podcast_series`,
        updatedAt: sql`now()`,
      },
    });
}
