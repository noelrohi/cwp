#!/usr/bin/env tsx

import { db } from "@/db";
import { episode } from "@/db/schema/podcast";
import { eq, isNull } from "drizzle-orm";

interface EpisodeTranscriptResponse {
  episode_id: string;
  episode_title: string;
  episode_transcript: string;
  episode_transcript_word_level_timestamps?: Array<{
    word: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
  episode_description?: string;
  // Other episode fields...
}

async function fetchTranscript(
  episodeId: string,
  bearerToken: string,
): Promise<void> {
  try {
    console.log(`Fetching transcript for episode: ${episodeId}`);

    const response = await fetch(
      `https://podscan.fm/api/v1/episodes/${episodeId}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data: EpisodeTranscriptResponse = await response.json();

    if (!data.episode_transcript) {
      console.log(
        `⚠️  No transcript available for episode: ${data.episode_title || episodeId}`,
      );
      return;
    }

    console.log(`Found transcript for: ${data.episode_title}`);
    console.log(
      `Transcript length: ${data.episode_transcript.length} characters`,
    );

    // Update the episode with the transcript
    try {
      await db
        .update(episode)
        .set({
          episodeTranscript: data.episode_transcript,
          episodeDescription: data.episode_description || undefined,
          updatedAt: new Date(),
        })
        .where(eq(episode.episodeId, episodeId));

      console.log(`✓ Updated episode ${episodeId} with transcript`);

      if (data.episode_transcript_word_level_timestamps) {
        console.log(
          `📝 Word-level timestamps available: ${data.episode_transcript_word_level_timestamps.length} words`,
        );
        // Could store word-level timestamps in a separate table if needed
      }
    } catch (dbError) {
      console.error(`Failed to update episode ${episodeId}:`, dbError);
    }
  } catch (error) {
    console.error("Error fetching transcript:", error);
    process.exit(1);
  }
}

async function fetchAllTranscripts(bearerToken: string): Promise<void> {
  try {
    console.log("Fetching transcripts for all episodes without transcripts...");

    // Get all episodes that don't have transcripts yet
    const episodesWithoutTranscripts = await db
      .select({
        episodeId: episode.episodeId,
        episodeTitle: episode.episodeTitle,
      })
      .from(episode)
      .where(isNull(episode.episodeTranscript))
      .limit(50); // Process in batches to avoid rate limits

    console.log(
      `Found ${episodesWithoutTranscripts.length} episodes without transcripts`,
    );

    for (const ep of episodesWithoutTranscripts) {
      console.log(`\nProcessing: ${ep.episodeTitle}`);
      await fetchTranscript(ep.episodeId, bearerToken);

      // Add a small delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `\n✅ Completed processing ${episodesWithoutTranscripts.length} episodes`,
    );
  } catch (error) {
    console.error("Error fetching transcripts:", error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage:");
    console.error(
      "  Fetch single episode: tsx scripts/fetch-transcript.ts <episode_id> <bearer_token>",
    );
    console.error(
      "  Fetch all missing:    tsx scripts/fetch-transcript.ts --all <bearer_token>",
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  tsx scripts/fetch-transcript.ts ep_eb98jygz6d2njmga your_bearer_token",
    );
    console.error("  tsx scripts/fetch-transcript.ts --all your_bearer_token");
    process.exit(1);
  }

  if (args[0] === "--all") {
    if (args.length !== 2) {
      console.error(
        "Usage: tsx scripts/fetch-transcript.ts --all <bearer_token>",
      );
      process.exit(1);
    }
    await fetchAllTranscripts(args[1]);
  } else {
    if (args.length !== 2) {
      console.error(
        "Usage: tsx scripts/fetch-transcript.ts <episode_id> <bearer_token>",
      );
      process.exit(1);
    }

    const [episodeId, bearerToken] = args;

    if (!episodeId.startsWith("ep_")) {
      console.error('Error: Episode ID should start with "ep_"');
      process.exit(1);
    }

    await fetchTranscript(episodeId, bearerToken);
  }
}

main().catch(console.error);
