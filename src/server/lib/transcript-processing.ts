import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import type { db as dbInstance } from "@/server/db";
import {
  episode as episodeSchema,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import type { TranscriptData } from "@/types/transcript";
import { getYouTubeTranscriptUtterances } from "./youtube-transcript";

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

  try {
    await db
      .update(episodeSchema)
      .set({ status: "processing" })
      .where(eq(episodeSchema.id, episode.id));

    let utterances: TranscriptData | null = null;
    let duration: number | undefined;
    let transcriptSource: "youtube" | "deepgram" = "deepgram";

    // Try YouTube transcript first if video ID is available
    if (episode.youtubeVideoId) {
      console.log(
        `Attempting to fetch YouTube transcript for video: ${episode.youtubeVideoId}`,
      );
      try {
        const youtubeUtterances = await getYouTubeTranscriptUtterances(
          episode.youtubeVideoId,
        );
        if (youtubeUtterances && youtubeUtterances.length > 0) {
          utterances = youtubeUtterances;
          transcriptSource = "youtube";
          console.log(
            `Successfully fetched YouTube transcript (${youtubeUtterances.length} utterances)`,
          );
        } else {
          console.log(
            "YouTube transcript unavailable, falling back to Deepgram",
          );
        }
      } catch (error) {
        console.error("YouTube transcript fetch failed:", error);
        console.log("Falling back to Deepgram");
      }
    }

    // Fall back to Deepgram if YouTube failed or unavailable
    if (!utterances) {
      if (!episode.audioUrl) {
        throw new Error(
          "Episode has no audio URL and YouTube transcript unavailable",
        );
      }

      const apiKey = deepgramApiKey ?? process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPGRAM_API_KEY environment variable is not set");
      }

      console.log(
        `Fetching Deepgram transcript for audio URL: ${episode.audioUrl}`,
      );
      const deepgram = createDeepgramClient(apiKey);
      const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
        { url: episode.audioUrl },
        defaultDeepgramOptions,
      );

      if (error) {
        throw new Error(`Deepgram transcription failed: ${error.message}`);
      }

      const deepgramUtterances = result.results.utterances;
      duration = result.metadata.duration;
      transcriptSource = "deepgram";

      if (!deepgramUtterances || deepgramUtterances.length === 0) {
        throw new Error("Deepgram returned no utterances for this episode");
      }

      utterances = deepgramUtterances;

      console.log(
        `Successfully fetched Deepgram transcript (${deepgramUtterances.length} utterances)`,
      );
    }

    // Store transcript in Vercel Blob
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
        transcriptSource,
        status: "processing",
      })
      .where(eq(episodeSchema.id, episode.id));

    return {
      transcriptUrl: blob.url,
      duration,
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
  skipEmbeddings?: boolean;
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

  console.time("chunk-transcript-build-chunks");
  const chunks = buildChunksFromTranscript({
    transcript: resolvedTranscript,
    minTokens,
    maxTokens,
  });
  console.timeEnd("chunk-transcript-build-chunks");

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // Batch insert all chunks (without embeddings)
  console.time("chunk-transcript-db-insert");
  const chunksToInsert = chunks.map((chunk, index) => ({
    id: `chunk_${episode.id}_${index}`,
    episodeId: episode.id,
    speaker: chunk.speaker,
    content: chunk.content,
    startTimeSec: Math.floor(chunk.startSec),
    endTimeSec: Math.ceil(chunk.endSec),
    wordCount: chunk.content.trim().split(/\s+/).length,
    embedding: null,
  }));

  await db.insert(transcriptChunk).values(chunksToInsert);
  console.timeEnd("chunk-transcript-db-insert");

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

    if (currentWord.speaker !== nextWord.speaker) {
      return { shouldBreak: true, mustBreak: true, priority: "high" };
    }

    if (nextWord.start - currentWord.end > 3) {
      return { shouldBreak: true, mustBreak: true, priority: "high" };
    }

    if (strongPunctuation.test(currentWord.word.trim())) {
      if (
        strongBoundaries.some((phrase) =>
          nextWord.word.toLowerCase().startsWith(phrase.toLowerCase()),
        )
      ) {
        return { shouldBreak: true, mustBreak: false, priority: "high" };
      }

      if (currentWord.utteranceIndex !== nextWord.utteranceIndex) {
        const currentUtterance = transcript[currentWord.utteranceIndex];
        const nextUtterance = transcript[nextWord.utteranceIndex];
        if (nextUtterance.start - currentUtterance.end > 0.5) {
          return { shouldBreak: true, mustBreak: false, priority: "high" };
        }
      }

      return { shouldBreak: true, mustBreak: false, priority: "medium" };
    }

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

  const pushCurrentChunk = (forceKeep = false) => {
    if (currentCount > 0 && currentChunk.content.trim()) {
      const hasEnding = /[.!?]\s*$/.test(currentChunk.content.trim());
      const meetsMinWords = currentCount >= minTokens;

      if (meetsMinWords || hasEnding || forceKeep) {
        chunks.push({ ...currentChunk });
      }
    }
    currentChunk = { content: "", speaker: null, startSec: 0, endSec: 0 };
    currentCount = 0;
  };

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];

    if (currentCount === 0) {
      currentChunk.startSec = Math.floor(word.start);
      currentChunk.speaker = word.speaker?.toString() ?? null;
    }

    const wordSpeaker = word.speaker?.toString() ?? null;
    if (currentCount > 0 && currentChunk.speaker !== wordSpeaker) {
      pushCurrentChunk();
      currentChunk.startSec = Math.floor(word.start);
      currentChunk.speaker = wordSpeaker;
    }

    currentChunk.content += currentChunk.content ? ` ${word.word}` : word.word;
    currentCount += 1;
    currentChunk.endSec = Math.ceil(word.end);

    const breakInfo = getBreakPoint(i);

    let shouldBreak = false;
    let forceKeep = false;

    if (breakInfo.mustBreak) {
      shouldBreak = true;
    } else if (currentCount >= maxTokens) {
      shouldBreak = true;
      forceKeep = true;
    } else if (currentCount >= minTokens) {
      if (breakInfo.priority === "high") {
        shouldBreak = true;
      } else if (
        currentCount >= maxTokens * 0.8 &&
        breakInfo.priority === "medium"
      ) {
        shouldBreak = true;
      } else if (currentCount >= maxTokens * 0.9 && breakInfo.shouldBreak) {
        shouldBreak = true;
      }
    }

    if (shouldBreak) {
      pushCurrentChunk(forceKeep);
    }
  }

  if (currentCount > 0) {
    pushCurrentChunk();
  }

  const wordCounts = chunks.map((c) => c.content.split(/\s+/).length);
  const avgWords = wordCounts.length
    ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
    : 0;
  console.log(
    `[CHUNK SUMMARY] Created ${chunks.length} chunks from ${allWords.length} words`,
  );
  console.log(
    `[CHUNK SUMMARY] Word count: min=${Math.min(...wordCounts)}, max=${Math.max(...wordCounts)}, avg=${avgWords}`,
  );

  return chunks;
}
