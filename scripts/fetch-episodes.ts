#!/usr/bin/env tsx

import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episode, podcast, transcriptChunk } from "@/db/schema/podcast";

const generateEmbeddings = async (values: string[]): Promise<number[][]> => {
  if (values.length === 0) return [];

  // Clean input values
  const cleanedValues = values.map((value) => value.replaceAll("\n", " "));

  if (cleanedValues.length === 1) {
    // Use single embed for one value
    const { embedding } = await embed({
      model: openai.textEmbeddingModel("text-embedding-3-small"),
      value: cleanedValues[0],
    });
    return [embedding];
  }

  // Use embedMany for multiple values
  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    values: cleanedValues,
  });

  return embeddings;
};

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
  episode_has_guests: boolean;
  episode_has_sponsors: boolean;
  episode_categories?: {
    category_id: string;
    category_name: string;
  };
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
  podcast: {
    podcast_id: string;
    podcast_name: string;
    podcast_url: string;
  };
  metadata: {
    hosts?: {
      host_name: string;
      host_company: string;
      host_social_media_links?: {
        platform: string;
        url: string;
      };
      speaker_label: string;
    };
    guests?: {
      guest_name: string;
      guest_company: string;
      guest_social_media_links?: {
        platform: string;
        url: string;
      };
      guest_industry: string;
      guest_occupation: string;
      speaker_label: string;
    };
    sponsors?: Array<{
      sponsor_url: string;
      sponsor_name: string;
      sponsor_is_commercial: boolean;
      sponsor_product_mentioned: string;
      speaker_label: string;
    }>;
    has_hosts: boolean;
    has_guests: boolean;
    has_sponsors: boolean;
    is_branded: boolean;
    is_branded_confidence_score: number;
    is_branded_confidence_reason: string;
    summary_keywords: string[];
    summary_long: string;
    summary_short: string;
    speakers: Record<string, unknown>;
  };
  topics: Array<{
    topic_id: string;
    topic_name: string;
    topic_name_normalized: string;
  }>;
  created_at: string;
  updated_at: string;
  posted_at: string;
}

function chunkFromSegments(
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>,
  maxWords = 180,
): Array<{ start: number; end: number; text: string }> {
  const chunks: Array<{ start: number; end: number; text: string }> = [];
  let currentText: string[] = [];
  let currentStart = segments[0]?.start ?? 0;
  let currentEnd = segments[0]?.end ?? 0;
  let wordCount = 0;

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/);
    if (wordCount + words.length > maxWords && currentText.length > 0) {
      chunks.push({
        start: currentStart,
        end: currentEnd,
        text: currentText.join(" "),
      });
      currentText = [];
      wordCount = 0;
      currentStart = seg.start;
    }
    currentText.push(seg.text.trim());
    wordCount += words.length;
    currentEnd = seg.end;
  }
  if (currentText.length > 0) {
    chunks.push({
      start: currentStart,
      end: currentEnd,
      text: currentText.join(" "),
    });
  }
  return chunks;
}

function chunkPlainText(text: string, maxWords = 180): Array<{ text: string }> {
  const words = text.trim().split(/\s+/);
  const chunks: Array<{ text: string }> = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push({ text: words.slice(i, i + maxWords).join(" ") });
  }
  return chunks;
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

    // Ensure podcast record exists and get the internal ID
    let podcastInternalId: string | null = null;
    try {
      // Get the first episode to extract podcast information
      const firstEpisode = data.episodes[0];
      const podcastName =
        firstEpisode?.podcast?.podcast_name || `Podcast ${podcastId}`;

      const insertedPodcast = await db
        .insert(podcast)
        .values({
          id: `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          podcastId: podcastId,
          title: podcastName,
          description: null,
        })
        .onConflictDoNothing()
        .returning({ id: podcast.id });

      podcastInternalId = insertedPodcast[0]?.id ?? null;
    } catch (podcastError) {
      console.warn(
        `Failed to create podcast record for ${podcastId}:`,
        podcastError,
      );
    }

    // Get podcast internal ID if not created above
    if (!podcastInternalId) {
      const [existingPodcast] = await db
        .select({ id: podcast.id })
        .from(podcast)
        .where(eq(podcast.podcastId, podcastId))
        .limit(1);
      podcastInternalId = existingPodcast?.id ?? null;
    }

    for (const ep of data.episodes) {
      try {
        const insertedEpisode = await db
          .insert(episode)
          .values({
            id: `ep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            episodeId: ep.episode_id,
            podcastId: podcastInternalId,
            series: null, // Clear series field as it should contain actual series name, not podcast ID
            title: ep.episode_title,
            audioUrl: ep.episode_audio_url,
            thumbnailUrl: ep.episode_image_url ?? undefined,
            durationSec: ep.episode_duration,
            publishedAt: new Date(ep.posted_at),
            language: undefined,
            guest:
              ep.metadata?.guests?.guest_name ||
              (ep.episode_has_guests ? "" : undefined),
            // Host information
            hostName: ep.metadata?.hosts?.host_name,

            transcriptUrl: undefined,
          })
          .onConflictDoUpdate({
            target: episode.episodeId,
            set: {
              podcastId: podcastInternalId,
              series: null,
              title: ep.episode_title,
              audioUrl: ep.episode_audio_url,
              ...(ep.episode_image_url
                ? { thumbnailUrl: ep.episode_image_url }
                : {}),
              durationSec: ep.episode_duration,
              publishedAt: new Date(ep.posted_at),
              // Host information
              hostName: ep.metadata?.hosts?.host_name,
              updatedAt: new Date(),
            },
          })
          .returning({ id: episode.id });

        const episodeDbId = insertedEpisode[0]?.id;

        // Insert transcript chunks with embeddings
        if (episodeDbId) {
          const segs =
            ep.episode_transcript_word_level_timestamps?.segments?.map((s) => ({
              id: s.id,
              start: s.start,
              end: s.end,
              text: s.text,
            }));
          if (segs && segs.length > 0) {
            const chunks = chunkFromSegments(segs);
            const texts = chunks.map((c) => c.text);
            const embeddings = await generateEmbeddings(texts);

            for (let i = 0; i < chunks.length; i++) {
              const c = chunks[i];
              const embedding = embeddings[i];
              await db
                .insert(transcriptChunk)
                .values({
                  chunkId: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                  episodeId: episodeDbId,
                  startSec: c.start.toString(),
                  endSec: c.end.toString(),
                  text: c.text,
                  embedding,
                })
                .onConflictDoNothing();
            }
          } else if (ep.episode_transcript) {
            const chunks = chunkPlainText(ep.episode_transcript);
            const texts = chunks.map((c) => c.text);
            const embeddings = await generateEmbeddings(texts);

            for (let i = 0; i < chunks.length; i++) {
              const c = chunks[i];
              const embedding = embeddings[i];
              await db
                .insert(transcriptChunk)
                .values({
                  chunkId: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                  episodeId: episodeDbId,
                  startSec: null,
                  endSec: null,
                  text: c.text,
                  embedding,
                })
                .onConflictDoNothing();
            }
          }
        }

        console.log(`✓ Inserted/Updated episode: ${ep.episode_title}`);
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
      totalPages = parseInt(data.pagination.last_page, 10);

      console.log(
        `Found ${data.episodes.length} episodes on page ${currentPage}/${totalPages}`,
      );

      // Ensure podcast record exists and get the internal ID
      let podcastInternalId: string | null = null;
      if (currentPage === 1) {
        try {
          const insertedPodcast = await db
            .insert(podcast)
            .values({
              id: `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              podcastId: podcastId,
              title: `Podcast ${podcastId}`, // TODO: Get real podcast title from API
              description: null,
            })
            .onConflictDoNothing()
            .returning({ id: podcast.id });

          podcastInternalId = insertedPodcast[0]?.id ?? null;
          console.log(`✓ Ensured podcast record exists for ${podcastId}`);
        } catch (podcastError) {
          console.warn(
            `Failed to create podcast record for ${podcastId}:`,
            podcastError,
          );
        }
      }

      // Get podcast internal ID if not created on this page
      if (!podcastInternalId) {
        const [existingPodcast] = await db
          .select({ id: podcast.id })
          .from(podcast)
          .where(eq(podcast.podcastId, podcastId))
          .limit(1);
        podcastInternalId = existingPodcast?.id ?? null;
      }

      // Process episodes on this page
      for (const ep of data.episodes) {
        try {
          // Insert/update episode with proper foreign key
          const insertedEpisode = await db
            .insert(episode)
            .values({
              id: `ep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              episodeId: ep.episode_id,
              podcastId: podcastInternalId,
              series: null, // Clear series field as it should contain actual series name, not podcast ID
              title: ep.episode_title,
              audioUrl: ep.episode_audio_url,
              thumbnailUrl: ep.episode_image_url ?? undefined,
              durationSec: ep.episode_duration,
              publishedAt: new Date(ep.posted_at),
              guest:
                ep.metadata?.guests?.guest_name ||
                (ep.episode_has_guests ? "" : undefined),
              // Host information
              hostName: ep.metadata?.hosts?.host_name,
            })
            .onConflictDoUpdate({
              target: episode.episodeId,
              set: {
                podcastId: podcastInternalId,
                series: null,
                title: ep.episode_title,
                audioUrl: ep.episode_audio_url,
                ...(ep.episode_image_url
                  ? { thumbnailUrl: ep.episode_image_url }
                  : {}),
                durationSec: ep.episode_duration,
                publishedAt: new Date(ep.posted_at),
                guest:
                  ep.metadata?.guests?.guest_name ||
                  (ep.episode_has_guests ? "" : undefined),
                // Host information
                hostName: ep.metadata?.hosts?.host_name,
                updatedAt: new Date(),
              },
            })
            .returning({ id: episode.id });

          const episodeDbId = insertedEpisode[0]?.id;

          // Insert transcript chunks with embeddings
          if (episodeDbId) {
            const segs =
              ep.episode_transcript_word_level_timestamps?.segments?.map(
                (s) => ({
                  id: s.id,
                  start: s.start,
                  end: s.end,
                  text: s.text,
                }),
              );
            if (segs && segs.length > 0) {
              const chunks = chunkFromSegments(segs);
              const texts = chunks.map((c) => c.text);
              const embeddings = await generateEmbeddings(texts);

              for (let i = 0; i < chunks.length; i++) {
                const c = chunks[i];
                const embedding = embeddings[i];
                await db
                  .insert(transcriptChunk)
                  .values({
                    chunkId: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                    episodeId: episodeDbId,
                    startSec: c.start.toString(),
                    endSec: c.end.toString(),
                    text: c.text,
                    embedding,
                  })
                  .onConflictDoNothing();
              }
            } else if (ep.episode_transcript) {
              const chunks = chunkPlainText(ep.episode_transcript);
              const texts = chunks.map((c) => c.text);
              const embeddings = await generateEmbeddings(texts);

              for (let i = 0; i < chunks.length; i++) {
                const c = chunks[i];
                const embedding = embeddings[i];
                await db
                  .insert(transcriptChunk)
                  .values({
                    chunkId: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                    episodeId: episodeDbId,
                    startSec: null,
                    endSec: null,
                    text: c.text,
                    embedding,
                  })
                  .onConflictDoNothing();
              }
            }
          }

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
    const page = pageOrAll ? parseInt(pageOrAll, 10) : 1;
    if (Number.isNaN(page) || page < 1) {
      console.error("Error: Page number must be a positive integer");
      process.exit(1);
    }
    await fetchEpisodes(podcastId, bearerToken, page);
  }
}

main().catch(console.error);
