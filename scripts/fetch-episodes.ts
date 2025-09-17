#!/usr/bin/env tsx

import { db } from "@/db";
import {
  episode,
  episodeCategory,
  podcast,
  episodeWordTimestamp,
  episodeSegment,
} from "@/db/schema/podcast";
import { eq } from "drizzle-orm";

interface EpisodeCategory {
  category_id: string;
  category_name: string;
}

interface Episode {
  episode_fully_processed: boolean;
  episode_id: string;
  episode_guid: string;
  episode_title: string;
  episode_url: string;
  episode_audio_url: string;
  episode_image_url?: string;
  episode_duration: number;
  episode_word_count: number;
  episode_categories: EpisodeCategory[];
  episode_has_guests: boolean;
  episode_has_sponsors: boolean;
  episode_transcript?: string;
  episode_transcript_word_level_timestamps?: {
    segments: Array<{
      id: number;
      seek: number;
      start: number;
      end: number;
      text: string;
      temperature: number;
      avg_logprob: number;
      compression_ratio: number;
      no_speech_prob: number;
      words: Array<{
        start: number;
        end: number;
        word: string;
      }>;
    }>;
  };
  episode_description?: string;
  episode_permalink?: string;
  created_at: string;
  updated_at: string;
  posted_at: string;
}

async function processWordTimestamps(
  episodeDbId: string,
  episodeId: string,
  wordTimestamps?: {
    segments: Array<{
      id: number;
      seek: number;
      start: number;
      end: number;
      text: string;
      temperature: number;
      avg_logprob: number;
      compression_ratio: number;
      no_speech_prob: number;
      words: Array<{
        start: number;
        end: number;
        word: string;
      }>;
    }>;
  },
): Promise<void> {
  if (!wordTimestamps?.segments || wordTimestamps.segments.length === 0) {
    return;
  }

  // Flatten all words from all segments
  const allWords: Array<{
    word: string;
    start: number;
    end: number;
    segmentId: number;
  }> = [];

  for (const segment of wordTimestamps.segments) {
    for (const word of segment.words) {
      allWords.push({
        word: word.word,
        start: word.start,
        end: word.end,
        segmentId: segment.id,
      });
    }
  }

  if (allWords.length === 0) {
    return;
  }

  console.log(
    `  📝 Processing ${allWords.length} word timestamps from ${wordTimestamps.segments.length} segments...`,
  );

  try {
    // First, insert all segments
    const segmentIdMap = new Map<number, string>();

    for (const segment of wordTimestamps.segments) {
      const segmentDbId = `seg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      await db
        .insert(episodeSegment)
        .values({
          id: segmentDbId,
          episodeId: episodeDbId,
          segmentId: segment.id,
          seek: segment.seek,
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
          temperature: segment.temperature,
          avgLogprob: segment.avg_logprob,
          compressionRatio: segment.compression_ratio,
          noSpeechProb: segment.no_speech_prob,
        })
        .onConflictDoNothing();

      segmentIdMap.set(segment.id, segmentDbId);
    }

    // Then insert word timestamps with segment references
    let wordIndex = 0;
    for (const segment of wordTimestamps.segments) {
      const segmentDbId = segmentIdMap.get(segment.id);

      for (const word of segment.words) {
        await db
          .insert(episodeWordTimestamp)
          .values({
            id: `wt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            episodeId: episodeDbId,
            segmentId: segmentDbId,
            word: word.word,
            startTime: word.start,
            endTime: word.end,
            confidence: null, // Not provided in this format
            wordIndex: wordIndex++,
          })
          .onConflictDoNothing();
      }
    }

    console.log(
      `  ✓ Stored ${wordTimestamps.segments.length} segments and ${allWords.length} word timestamps`,
    );
  } catch (error) {
    console.warn(
      `  ⚠️  Failed to store segments/timestamps for ${episodeId}:`,
      error,
    );
  }
}

interface PodcastEpisodesResponse {
  episodes: Episode[];
  pagination: {
    total: string;
    per_page: string;
    current_page: string;
    last_page: string;
    from: string;
    to: string;
  };
}

async function fetchEpisodes(
  podcastId: string,
  bearerToken: string,
  page: number = 1,
): Promise<void> {
  try {
    console.log(`Fetching episodes for podcast: ${podcastId}`);

    const url = new URL(
      `https://podscan.fm/api/v1/podcasts/${podcastId}/episodes`,
    );
    if (page > 1) {
      url.searchParams.set("page", page.toString());
    }
    // Include full transcript and word-level timestamps
    url.searchParams.set("show_full_podcast", "true");
    url.searchParams.set("word_level_timestamps", "true");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data: PodcastEpisodesResponse = await response.json();

    console.log(`Found ${data.episodes.length} episodes`);

    // Ensure podcast record exists
    try {
      await db
        .insert(podcast)
        .values({
          id: `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          podcastId: podcastId,
          title: `Podcast ${podcastId}`, // Default title, can be updated later
          description: null,
        })
        .onConflictDoNothing(); // Don't overwrite existing podcast

      console.log(`✓ Ensured podcast record exists for ${podcastId}`);
    } catch (podcastError) {
      console.warn(
        `Failed to create podcast record for ${podcastId}:`,
        podcastError,
      );
    }

    for (const ep of data.episodes) {
      try {
        // Generate database ID
        const episodeDbId = `ep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        await db
          .insert(episode)
          .values({
            id: episodeDbId,
            episodeId: ep.episode_id,
            episodeGuid: ep.episode_guid,
            episodeTitle: ep.episode_title,
            episodeUrl: ep.episode_url,
            episodeAudioUrl: ep.episode_audio_url,
            episodeImageUrl: ep.episode_image_url || null,
            episodeDuration: ep.episode_duration,
            episodeWordCount: ep.episode_word_count,
            episodeHasGuests: ep.episode_has_guests,
            episodeHasSponsors: ep.episode_has_sponsors,
            episodeFullyProcessed: ep.episode_fully_processed,
            episodeTranscript: ep.episode_transcript || null,
            episodeDescription: ep.episode_description || null,
            episodePermalink: ep.episode_permalink || null,
            podcastId: podcastId,
            postedAt: new Date(ep.posted_at),
          })
          .onConflictDoUpdate({
            target: episode.episodeId,
            set: {
              episodeGuid: ep.episode_guid,
              episodeTitle: ep.episode_title,
              episodeUrl: ep.episode_url,
              episodeAudioUrl: ep.episode_audio_url,
              episodeImageUrl: ep.episode_image_url || null,
              episodeDuration: ep.episode_duration,
              episodeWordCount: ep.episode_word_count,
              episodeHasGuests: ep.episode_has_guests,
              episodeHasSponsors: ep.episode_has_sponsors,
              episodeFullyProcessed: ep.episode_fully_processed,
              episodeTranscript: ep.episode_transcript || null,
              episodeDescription: ep.episode_description || null,
              episodePermalink: ep.episode_permalink || null,
              updatedAt: new Date(),
            },
          });

        // Get the actual database ID (in case of conflict/update)
        const episodeRecord = await db
          .select({ id: episode.id })
          .from(episode)
          .where(eq(episode.episodeId, ep.episode_id))
          .limit(1);

        const actualEpisodeDbId = episodeRecord[0]?.id || episodeDbId;

        // Handle episode categories using the actual database ID
        for (const category of ep.episode_categories) {
          await db
            .insert(episodeCategory)
            .values({
              id: `ec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              episodeId: actualEpisodeDbId,
              categoryId: category.category_id,
            })
            .onConflictDoNothing();
        }

        // Process word-level timestamps if available
        await processWordTimestamps(
          actualEpisodeDbId,
          ep.episode_id,
          ep.episode_transcript_word_level_timestamps,
        );

        console.log(
          `✓ Inserted/Updated episode: ${ep.episode_title} with ${ep.episode_categories.length} categories`,
        );
      } catch (dbError) {
        console.error(`Failed to insert episode ${ep.episode_id}:`, dbError);
      }
    }

    console.log(
      `\nSuccessfully processed ${data.episodes.length} episodes for podcast ${podcastId}`,
    );
    console.log(
      `Pagination: Page ${data.pagination.current_page} of ${data.pagination.last_page}`,
    );
  } catch (error) {
    console.error("Error fetching episodes:", error);
    process.exit(1);
  }
}

async function fetchAllEpisodes(
  podcastId: string,
  bearerToken: string,
): Promise<void> {
  try {
    console.log(`Fetching ALL episodes for podcast: ${podcastId}`);

    let currentPage = 1;
    let totalPages = 1;

    do {
      console.log(`\n📄 Fetching page ${currentPage}...`);

      const url = new URL(
        `https://podscan.fm/api/v1/podcasts/${podcastId}/episodes`,
      );
      url.searchParams.set("page", currentPage.toString());
      // Include full transcript and word-level timestamps
      url.searchParams.set("show_full_podcast", "true");
      url.searchParams.set("word_level_timestamps", "true");

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data: PodcastEpisodesResponse = await response.json();
      totalPages = parseInt(data.pagination.last_page);

      console.log(
        `Found ${data.episodes.length} episodes on page ${currentPage}/${totalPages}`,
      );

      // Ensure podcast record exists (only on first page)
      if (currentPage === 1) {
        try {
          await db
            .insert(podcast)
            .values({
              id: `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              podcastId: podcastId,
              title: `Podcast ${podcastId}`,
              description: null,
            })
            .onConflictDoNothing();

          console.log(`✓ Ensured podcast record exists for ${podcastId}`);
        } catch (podcastError) {
          console.warn(
            `Failed to create podcast record for ${podcastId}:`,
            podcastError,
          );
        }
      }

      // Process episodes on this page
      for (const ep of data.episodes) {
        try {
          // Insert/update episode
          const episodeDbId = `ep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

          await db
            .insert(episode)
            .values({
              id: episodeDbId,
              episodeId: ep.episode_id,
              episodeGuid: ep.episode_guid,
              episodeTitle: ep.episode_title,
              episodeUrl: ep.episode_url,
              episodeAudioUrl: ep.episode_audio_url,
              episodeImageUrl: ep.episode_image_url || null,
              episodeDuration: ep.episode_duration,
              episodeWordCount: ep.episode_word_count,
              episodeHasGuests: ep.episode_has_guests,
              episodeHasSponsors: ep.episode_has_sponsors,
              episodeFullyProcessed: ep.episode_fully_processed,
              episodeTranscript: ep.episode_transcript || null,
              episodeDescription: ep.episode_description || null,
              episodePermalink: ep.episode_permalink || null,
              podcastId: podcastId,
              postedAt: new Date(ep.posted_at),
            })
            .onConflictDoUpdate({
              target: episode.episodeId,
              set: {
                episodeGuid: ep.episode_guid,
                episodeTitle: ep.episode_title,
                episodeUrl: ep.episode_url,
                episodeAudioUrl: ep.episode_audio_url,
                episodeImageUrl: ep.episode_image_url || null,
                episodeDuration: ep.episode_duration,
                episodeWordCount: ep.episode_word_count,
                episodeHasGuests: ep.episode_has_guests,
                episodeHasSponsors: ep.episode_has_sponsors,
                episodeFullyProcessed: ep.episode_fully_processed,
                episodeTranscript: ep.episode_transcript || null,
                episodeDescription: ep.episode_description || null,
                episodePermalink: ep.episode_permalink || null,
                updatedAt: new Date(),
              },
            });

          // Get the actual database ID (in case of conflict/update)
          const episodeRecord = await db
            .select({ id: episode.id })
            .from(episode)
            .where(eq(episode.episodeId, ep.episode_id))
            .limit(1);

          const actualEpisodeDbId = episodeRecord[0]?.id || episodeDbId;

          // Handle episode categories using the actual database ID
          for (const category of ep.episode_categories) {
            await db
              .insert(episodeCategory)
              .values({
                id: `ec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                episodeId: actualEpisodeDbId,
                categoryId: category.category_id,
              })
              .onConflictDoNothing();
          }

          // Process word-level timestamps if available
          await processWordTimestamps(
            actualEpisodeDbId,
            ep.episode_id,
            ep.episode_transcript_word_level_timestamps,
          );

          console.log(`  ✓ ${ep.episode_title}`);
        } catch (dbError) {
          console.error(
            `  ✗ Failed to insert episode ${ep.episode_id}:`,
            dbError,
          );
        }
      }

      console.log(
        `✅ Completed page ${currentPage}/${totalPages} - ${data.episodes.length} episodes`,
      );
      currentPage++;

      // Add small delay between pages to respect rate limits
      if (currentPage <= totalPages) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (currentPage <= totalPages);

    console.log(
      `\n🎉 Successfully fetched ALL episodes for podcast ${podcastId}`,
    );
    console.log(`📊 Total pages processed: ${totalPages}`);
  } catch (error) {
    console.error("Error fetching all episodes:", error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage:");
    console.error(
      "  Single page:  tsx scripts/fetch-episodes.ts <podcast_id> <bearer_token> [page_number]",
    );
    console.error(
      "  All pages:    tsx scripts/fetch-episodes.ts <podcast_id> <bearer_token> --all",
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  tsx scripts/fetch-episodes.ts pd_k42yajryg3n5p8ow your_token",
    );
    console.error(
      "  tsx scripts/fetch-episodes.ts pd_k42yajryg3n5p8ow your_token 2",
    );
    console.error(
      "  tsx scripts/fetch-episodes.ts pd_k42yajryg3n5p8ow your_token --all",
    );
    process.exit(1);
  }

  const [podcastId, bearerToken, pageOrAll] = args;

  if (!podcastId.startsWith("pd_")) {
    console.error('Error: Podcast ID should start with "pd_"');
    process.exit(1);
  }

  if (pageOrAll === "--all") {
    await fetchAllEpisodes(podcastId, bearerToken);
  } else {
    const page = pageOrAll ? parseInt(pageOrAll) : 1;
    if (isNaN(page) || page < 1) {
      console.error("Error: Page number must be a positive integer");
      process.exit(1);
    }
    await fetchEpisodes(podcastId, bearerToken, page);
  }
}

main().catch(console.error);
