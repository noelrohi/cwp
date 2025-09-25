import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { db as dbInstance } from "@/server/db";
import { pattern } from "@/server/db/schema/podcast";
import type { TranscriptData, TranscriptUtterance } from "@/types/transcript";
import type { EpisodeRecord } from "./transcript-processing";
import { saveEvidenceRecords } from "./transcript-processing";

const MODEL_ID = "gpt-4o-mini";
const MAX_TRANSCRIPT_CHARS = 18000;
const MAX_UTTERANCES = 400;
const SUPPORTING_MAX_TRANSCRIPT_CHARS = 10000;
const SUPPORTING_MAX_UTTERANCES = 250;
const PATTERN_CONFIDENCE_THRESHOLD = 0.55;
const EVIDENCE_CONFIDENCE_THRESHOLD = 0.5;

const PRIMARY_EPISODE_KEY = "primary" as const;

const evidenceSchema = z.object({
  episodeKey: z.string(),
  type: z.enum(["entity", "claim"]).optional().default("claim"),
  label: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  text: z.string(),
  speaker: z.string().nullable().optional(),
  timestamp: z.number().min(0).optional(),
  endTimestamp: z.number().min(0).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const extractedPatternSchema = z.object({
  title: z.string(),
  insightMarkdown: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidences: z.array(evidenceSchema).optional().default([]),
});

const extractionSchema = z.object({
  patterns: z.array(extractedPatternSchema).max(5).optional().default([]),
});

export type ExtractedPattern = z.infer<typeof extractedPatternSchema>;

export type InsightFormat = "markdown" | "plain_text";

export interface SupportingEpisodeContext {
  key: string;
  episode: EpisodeRecord & {
    podcastTitle?: string | null;
    podcastSeries?: string | null;
  };
  transcript: TranscriptData;
}

export interface PatternExtractionParams {
  episode: EpisodeRecord & {
    podcastTitle?: string | null;
    podcastSeries?: string | null;
  };
  transcript: TranscriptData;
  maxPatterns?: number;
  supportingEpisodes?: SupportingEpisodeContext[];
  insightFormat?: InsightFormat;
}

export async function extractPatternsFromTranscript({
  episode,
  transcript,
  maxPatterns,
  supportingEpisodes = [],
  insightFormat = "markdown",
}: PatternExtractionParams): Promise<ExtractedPattern[]> {
  if (!transcript.length) {
    return [];
  }

  const primaryTranscript = prepareTranscriptForModel(transcript);
  const supportingContexts = supportingEpisodes.map((item) => ({
    key: item.key,
    id: item.episode.id,
    title: item.episode.title,
    series: item.episode.series ?? null,
    podcastTitle: item.episode.podcastTitle ?? null,
    podcastSeries: item.episode.podcastSeries ?? null,
    transcript: prepareTranscriptForModel(item.transcript, {
      maxChars: SUPPORTING_MAX_TRANSCRIPT_CHARS,
      maxUtterances: SUPPORTING_MAX_UTTERANCES,
    }),
  }));

  const { object } = await generateObject({
    model: openai(MODEL_ID),
    schema: extractionSchema,
    messages: [
      {
        role: "system",
        content:
          "You are a strategy analyst who synthesizes cross-episode podcast insights and returns structured JSON with Markdown-ready narrative summaries.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildExtractionPrompt({
              primaryEpisode: {
                key: PRIMARY_EPISODE_KEY,
                id: episode.id,
                title: episode.title,
                series: episode.series ?? null,
                podcastTitle: episode.podcastTitle ?? null,
                podcastSeries: episode.podcastSeries ?? null,
                transcript: primaryTranscript,
              },
              supportingEpisodes: supportingContexts,
              maxPatterns,
              insightFormat,
            }),
          },
        ],
      },
    ],
    temperature: 0.3,
  });

  const extracted = object?.patterns ?? [];
  return filterPatternsByConfidence(extracted);
}

interface PromptEpisodeContext {
  key: string;
  id: string;
  title: string | null;
  series: string | null;
  podcastTitle: string | null;
  podcastSeries: string | null;
  transcript: string;
}

interface BuildPromptParams {
  primaryEpisode: PromptEpisodeContext;
  supportingEpisodes: PromptEpisodeContext[];
  maxPatterns?: number;
  insightFormat: InsightFormat;
}

function buildExtractionPrompt({
  primaryEpisode,
  supportingEpisodes,
  maxPatterns,
  insightFormat,
}: BuildPromptParams) {
  const allowedKeys = [
    primaryEpisode.key,
    ...supportingEpisodes.map((episode) => episode.key),
  ];

  const formatInstruction =
    insightFormat === "markdown"
      ? "GitHub-flavored Markdown with short headings and bullet points where useful"
      : "concise plain text paragraphs";

  const header: string[] = [];
  header.push(
    `Primary episode key: ${primaryEpisode.key}`,
    `Primary episode ID: ${primaryEpisode.id}`,
    `Primary title: ${primaryEpisode.title ?? "Unknown Episode"}`,
    `Primary podcast: ${primaryEpisode.podcastTitle ?? "Unknown Show"}`,
  );

  if (primaryEpisode.series) {
    header.push(`Primary series: ${primaryEpisode.series}`);
  }

  if (supportingEpisodes.length > 0) {
    header.push(
      `Supporting episode keys: ${supportingEpisodes
        .map((episode) => `${episode.key} (${episode.id})`)
        .join(", ")}`,
    );
  }

  header.push(
    "",
    "Extract high-confidence daily insight patterns that tie together evidence across the provided episodes.",
    `- Return polished ${formatInstruction}.`,
    "- Highlight the shared theme, compare perspectives, and note points of tension or evolution.",
    "- Provide at least one sentence referencing why the insight matters for operators or strategists.",
    "- The evidence array must contain at least three items spanning at least two distinct episode keys.",
    `- Set episodeKey on each evidence item to one of: ${allowedKeys.join(", ")}.`,
    "- Include timestamps in seconds when possible and capture the speaker if mentioned.",
    "- Evidence can reference supporting episodes even when they are from other podcast series.",
    "- Confidence values should reflect your certainty between 0 and 1.",
  );

  if (typeof maxPatterns === "number") {
    header.push(`- Return at most ${maxPatterns} total patterns.`);
  }

  header.push(
    "- Do not invent content beyond the transcripts provided.",
    "",
    "Episode context below. Use it as your only source of truth.",
    "",
  );

  header.push(...renderEpisodeContext("Primary Episode", primaryEpisode));

  for (const supportingEpisode of supportingEpisodes) {
    header.push(
      ...renderEpisodeContext("Supporting Episode", supportingEpisode),
    );
  }

  return header.join("\n");
}

function renderEpisodeContext(
  label: string,
  episode: PromptEpisodeContext,
): string[] {
  const lines: string[] = [
    `${label} [${episode.key}]`,
    `Episode ID: ${episode.id}`,
    `Title: ${episode.title ?? "Unknown"}`,
  ];

  if (episode.series) {
    lines.push(`Series: ${episode.series}`);
  }

  if (episode.podcastTitle) {
    lines.push(`Podcast: ${episode.podcastTitle}`);
  }

  if (episode.podcastSeries) {
    lines.push(`Podcast Series: ${episode.podcastSeries}`);
  }

  lines.push("", "Transcript:", episode.transcript, "");
  return lines;
}

interface TranscriptFormatOptions {
  maxChars?: number;
  maxUtterances?: number;
}

function prepareTranscriptForModel(
  transcript: TranscriptData,
  options?: TranscriptFormatOptions,
): string {
  const maxUtterances = options?.maxUtterances ?? MAX_UTTERANCES;
  const maxChars = options?.maxChars ?? MAX_TRANSCRIPT_CHARS;

  const selected = transcript.slice(0, maxUtterances);

  const lines = selected.map((utterance) => {
    const timestamp = formatTimestamp(utterance.start ?? 0);
    const speaker = renderSpeakerLabel(utterance);
    const text = utterance.transcript || "";
    return `[${timestamp}] ${speaker}: ${text}`;
  });

  const combined = lines.join("\n");

  if (combined.length <= maxChars) {
    return combined;
  }

  return combined.slice(0, maxChars);
}

function renderSpeakerLabel(utterance: TranscriptUtterance) {
  if (utterance.speaker === null || utterance.speaker === undefined) {
    return "Speaker";
  }

  return `Speaker ${utterance.speaker}`;
}

function formatTimestamp(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const secs = (clamped % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function filterPatternsByConfidence(
  patterns: ExtractedPattern[],
): ExtractedPattern[] {
  return patterns
    .map((pattern) => ({
      ...pattern,
      evidences: (pattern.evidences ?? []).filter((evidence) => {
        if (evidence.confidence === null || evidence.confidence === undefined) {
          return true;
        }
        return evidence.confidence >= EVIDENCE_CONFIDENCE_THRESHOLD;
      }),
    }))
    .filter((pattern) => {
      const confidence = pattern.confidence ?? 0;
      return confidence >= PATTERN_CONFIDENCE_THRESHOLD;
    });
}

export interface PersistPatternsParams {
  db: typeof dbInstance;
  episode: EpisodeRecord & {
    podcastTitle?: string | null;
    podcastSeries?: string | null;
  };
  patternDate: Date;
  userId: string;
  patterns: ExtractedPattern[];
  supportingEpisodes?: Array<{
    key: string;
    episode: EpisodeRecord & {
      podcastTitle?: string | null;
      podcastSeries?: string | null;
    };
  }>;
}

export async function persistExtractedPatterns({
  db,
  episode,
  patternDate,
  userId,
  patterns,
  supportingEpisodes = [],
}: PersistPatternsParams) {
  if (patterns.length === 0) {
    return;
  }

  const patternDateValue = formatPatternDate(patternDate);

  const episodeLookup = new Map<
    string,
    {
      episodeId: string;
      title: string | null;
      podcastTitle: string | null;
      podcastSeries: string | null;
    }
  >();

  episodeLookup.set(PRIMARY_EPISODE_KEY, {
    episodeId: episode.id,
    title: episode.title,
    podcastTitle: episode.podcastTitle ?? null,
    podcastSeries: episode.podcastSeries ?? episode.series ?? null,
  });

  for (const supporting of supportingEpisodes) {
    episodeLookup.set(supporting.key, {
      episodeId: supporting.episode.id,
      title: supporting.episode.title,
      podcastTitle: supporting.episode.podcastTitle ?? null,
      podcastSeries:
        supporting.episode.podcastSeries ?? supporting.episode.series ?? null,
    });
  }

  await db
    .delete(pattern)
    .where(
      and(
        eq(pattern.userId, userId),
        eq(pattern.patternDate, patternDateValue),
        eq(pattern.episodeId, episode.id),
      ),
    );

  for (const extractedPattern of patterns) {
    const patternId = `pattern_${episode.id}_${nanoid(6)}`;

    await db.insert(pattern).values({
      id: patternId,
      userId,
      episodeId: episode.id,
      patternDate: patternDateValue,
      status: "completed",
      title: extractedPattern.title,
      synthesis: extractedPattern.insightMarkdown,
      entities: null,
      claims: null,
      metadata: null,
    });

    const evidencePayload = (extractedPattern.evidences ?? [])
      .map((evidence) => {
        const resolvedEpisode =
          episodeLookup.get(evidence.episodeKey) ??
          episodeLookup.get(PRIMARY_EPISODE_KEY);

        if (!resolvedEpisode) {
          return null;
        }

        return {
          patternId,
          episodeId: resolvedEpisode.episodeId,
          userId,
          speaker: evidence.speaker ?? null,
          content: evidence.text,
          evidenceType: evidence.type ?? "claim",
          entityLabel: evidence.label ?? null,
          entityCategory: evidence.category ?? null,
          confidence: evidence.confidence ?? null,
          showAtSec: evidence.timestamp ? Math.floor(evidence.timestamp) : null,
          endAtSec: evidence.endTimestamp
            ? Math.floor(evidence.endTimestamp)
            : null,
          episodeTitle: resolvedEpisode.title ?? episode.title,
          podcastTitle:
            resolvedEpisode.podcastTitle ?? episode.podcastTitle ?? null,
          podcastSeries:
            resolvedEpisode.podcastSeries ?? episode.podcastSeries ?? null,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    await saveEvidenceRecords(db, evidencePayload);
  }
}

export async function hasExistingPatternForEpisode({
  db,
  episodeId,
  userId,
  patternDate,
}: {
  db: typeof dbInstance;
  episodeId: string;
  userId: string;
  patternDate: Date;
}) {
  const existing = await db
    .select({ id: pattern.id })
    .from(pattern)
    .where(
      and(
        eq(pattern.userId, userId),
        eq(pattern.episodeId, episodeId),
        eq(pattern.patternDate, formatPatternDate(patternDate)),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

function formatPatternDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
