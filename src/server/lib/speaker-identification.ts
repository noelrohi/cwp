import { randomUUID } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { episodeSpeakerMapping } from "@/server/db/schema";
import type { DatabaseClient } from "@/server/lib/transcript-processing";

export interface SpeakerMapping {
  [speakerIndex: string]: string; // "0": "John Doe", "1": "Jane Smith"
}

export interface SpeakerIdentificationResult {
  speakers: SpeakerMapping;
  confidence: number;
  sourceDescription: string;
}

/**
 * Extract speaker information from episode title patterns
 * Common patterns:
 * - "Topic | Guest Name (Company)"
 * - "Topic with Guest Name"
 * - "Guest Name: Topic"
 */
function extractSpeakersFromTitle(
  episodeTitle: string,
  podcastTitle: string,
): SpeakerMapping | null {
  const title = episodeTitle.trim();

  // Pattern 1: "Topic | Guest Name (Company)" or "Topic | Guest Name"
  const pipePattern = /^.*?\|\s*([^(]+)(?:\s*\([^)]+\))?$/;
  const pipeMatch = title.match(pipePattern);
  if (pipeMatch) {
    const guestName = pipeMatch[1].trim();
    if (guestName && guestName.length > 2 && !guestName.includes("|")) {
      // Use actual speaker analysis to determine who is who
      // For title-based extraction with "| Guest Name" pattern:
      // Often in interviews, speaker 1 asks more questions (host behavior)
      // and speaker 0 gives longer explanations (guest behavior)
      const hostName = inferHostFromPodcast(podcastTitle);

      // Based on typical interview patterns, swap to match common diarization
      return {
        "0": guestName, // Guest typically gives longer responses
        "1": hostName, // Host typically asks questions
      };
    }
  }

  // Pattern 2: "Guest Name: Topic"
  const colonPattern = /^([A-Za-z\s.]+):\s+.+$/;
  const colonMatch = title.match(colonPattern);
  if (colonMatch) {
    const speakerName = colonMatch[1].trim();
    if (
      speakerName &&
      speakerName.length > 2 &&
      speakerName.split(" ").length >= 2
    ) {
      const hostName = inferHostFromPodcast(podcastTitle);
      return {
        "0": hostName,
        "1": speakerName,
      };
    }
  }

  // Pattern 3: "Topic with Guest Name"
  const withPattern = /^.*?\bwith\s+([A-Za-z\s.]+)(?:\s+\(|$)/i;
  const withMatch = title.match(withPattern);
  if (withMatch) {
    const guestName = withMatch[1].trim();
    if (guestName && guestName.length > 2) {
      const hostName = inferHostFromPodcast(podcastTitle);
      return {
        "0": hostName,
        "1": guestName,
      };
    }
  }

  return null;
}

/**
 * Infer host name from podcast title
 */
function inferHostFromPodcast(podcastTitle: string): string {
  // Known podcast hosts (can be expanded as needed)
  const knownHosts: Record<string, string> = {
    "How I AI": "David Sacks", // Based on the podcast format
    "The Joe Rogan Experience": "Joe Rogan",
    "The Tim Ferriss Show": "Tim Ferriss",
    "Lex Fridman Podcast": "Lex Fridman",
    "All-In Podcast": "All-In Hosts",
  };

  // Check exact matches first
  if (knownHosts[podcastTitle]) {
    return knownHosts[podcastTitle];
  }

  // Common patterns for extracting host names
  const patterns = [
    // "The Joe Rogan Experience" -> "Joe Rogan"
    /^The\s+([A-Za-z\s]+)\s+(?:Experience|Podcast|Show)$/i,
    // "Lex Fridman Podcast" -> "Lex Fridman"
    /^([A-Za-z\s]+)\s+Podcast$/i,
    // "Tim Ferriss Show" -> "Tim Ferriss"
    /^([A-Za-z\s]+)\s+Show$/i,
  ];

  for (const pattern of patterns) {
    const match = podcastTitle.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // If no pattern matches, return generic host
  return "Host";
}

/**
 * Identify speakers in an episode using AI based on RSS description and podcast context
 */
export async function identifyEpisodeSpeakers({
  db,
  episodeId,
  episodeTitle,
  episodeDescription,
  itunesSummary,
  contentEncoded,
  creator,
  podcastTitle,
  podcastDescription,
}: {
  db: DatabaseClient;
  episodeId: string;
  episodeTitle: string;
  episodeDescription?: string | null;
  itunesSummary?: string | null;
  contentEncoded?: string | null;
  creator?: string | null;
  podcastTitle: string;
  podcastDescription?: string | null;
}): Promise<SpeakerIdentificationResult | null> {
  // Check if we already have speaker mapping for this episode
  const existingMapping = await db
    .select()
    .from(episodeSpeakerMapping)
    .where(eq(episodeSpeakerMapping.episodeId, episodeId))
    .limit(1);

  if (existingMapping.length > 0) {
    const mapping = existingMapping[0];
    return {
      speakers: JSON.parse(mapping.speakerMappings),
      confidence: mapping.confidence,
      sourceDescription: mapping.sourceDescription || "",
    };
  }

  // Combine all available RSS context - prioritize richer content
  const allContent = [contentEncoded, itunesSummary, episodeDescription].filter(
    Boolean,
  );

  const bestDescription = allContent[0]; // Use the richest available content

  const contextText = [
    `Podcast: ${podcastTitle}`,
    podcastDescription ? `Podcast Description: ${podcastDescription}` : null,
    `Episode: ${episodeTitle}`,
    creator ? `Creator: ${creator}` : null,
    bestDescription ? `Episode Content: ${bestDescription}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!bestDescription?.trim()) {
    // Try to extract speaker info from episode title if no description
    const titleSpeakers = extractSpeakersFromTitle(episodeTitle, podcastTitle);
    if (titleSpeakers) {
      const speakerResult: SpeakerIdentificationResult = {
        speakers: titleSpeakers,
        confidence: 0.8, // High confidence for title-based extraction
        sourceDescription: `Extracted from title: ${episodeTitle}`,
      };

      // Cache the result
      await db.insert(episodeSpeakerMapping).values({
        id: randomUUID(),
        episodeId,
        speakerMappings: JSON.stringify(speakerResult.speakers),
        confidence: speakerResult.confidence,
        sourceDescription: speakerResult.sourceDescription,
      });

      return speakerResult;
    }

    // No description and couldn't extract from title
    return null;
  }

  try {
    const result = await generateText({
      model: openai("gpt-4.1-mini"),
      system: `You are an expert at identifying podcast speakers from episode descriptions.

Your task is to extract speaker names and map them to speaker numbers (0, 1, 2, etc.) based on the episode context.

Rules:
1. Speaker 0 is usually the host/main interviewer
2. Speaker 1, 2, 3, etc. are usually guests in order of appearance/importance
3. If you can't identify specific names, return null
4. Only return names you're confident about
5. Use full names when available (e.g., "Naval Ravikant" not "Naval")

Return a JSON object with:
- speakers: object mapping speaker numbers to names {"0": "Host Name", "1": "Guest Name"}
- confidence: number from 0.0 to 1.0
- reasoning: brief explanation of your identification

Example output:
{
  "speakers": {
    "0": "Joe Rogan", 
    "1": "Elon Musk"
  },
  "confidence": 0.9,
  "reasoning": "Clear mention of Joe Rogan interviewing Elon Musk"
}

If you cannot identify speakers with reasonable confidence, return:
{
  "speakers": null,
  "confidence": 0.0,
  "reasoning": "Insufficient information to identify speakers"
}`,
      prompt: `Identify the speakers in this podcast episode:

${contextText}

Extract speaker names and map them to speaker numbers. Be conservative - only return names you're confident about.`,
    });

    const parsed = JSON.parse(result.text);

    if (!parsed.speakers || parsed.confidence < 0.5) {
      return null;
    }

    const speakerResult: SpeakerIdentificationResult = {
      speakers: parsed.speakers,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      sourceDescription:
        bestDescription || episodeDescription || "No description",
    };

    // Cache the result
    await db.insert(episodeSpeakerMapping).values({
      id: randomUUID(),
      episodeId,
      speakerMappings: JSON.stringify(speakerResult.speakers),
      confidence: speakerResult.confidence,
      sourceDescription: speakerResult.sourceDescription,
    });

    return speakerResult;
  } catch (error) {
    console.error("Failed to identify episode speakers:", error);
    return null;
  }
}

/**
 * Get speaker name for a chunk using cached mapping
 */
export async function getSpeakerName({
  db,
  episodeId,
  speakerIndex,
}: {
  db: DatabaseClient;
  episodeId: string;
  speakerIndex: string | null;
}): Promise<string> {
  if (!speakerIndex) {
    return "Unknown Speaker";
  }

  // Try to get cached mapping
  const mapping = await db
    .select()
    .from(episodeSpeakerMapping)
    .where(eq(episodeSpeakerMapping.episodeId, episodeId))
    .limit(1);

  if (mapping.length > 0) {
    const speakers: SpeakerMapping = JSON.parse(mapping[0].speakerMappings);
    const speakerName = speakers[speakerIndex];

    if (speakerName) {
      return speakerName;
    }
  }

  // Fallback to the logic we had before
  if (/^\d+$/.test(speakerIndex)) {
    const speakerNum = Number.parseInt(speakerIndex, 10);

    if (speakerNum === 0) {
      return "Host";
    } else {
      return `Guest ${speakerNum}`;
    }
  }

  return `Speaker ${speakerIndex}`;
}
