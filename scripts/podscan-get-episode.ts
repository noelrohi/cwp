#!/usr/bin/env tsx
import "dotenv/config";
import {
  createPodscanClient,
  type Segment,
  type Word,
} from "../src/lib/podscan.js";

/**
 * Inspect a single Podscan episode with word-level timestamps.
 *
 * Usage:
 *   tsx scripts/podscan-get-episode.ts <episode_id> <bearer_token>
 *
 * Example:
 *   tsx scripts/podscan-get-episode.ts ep_abc123 $PODSCAN_TOKEN
 */

async function main() {
  const [episodeId, token] = process.argv.slice(2);
  if (!episodeId || !token) {
    console.error(
      "Usage: tsx scripts/podscan-get-episode.ts <episode_id> <bearer_token>",
    );
    process.exit(1);
  }

  const client = createPodscanClient(token);

  console.log(`Getting episode: ${episodeId}`);

  let data;
  try {
    data = await client.getEpisode(episodeId, {
      showFullPodcast: true,
      wordLevelTimestamps: true,
    });
  } catch (error) {
    console.error("Request failed:", error);
    process.exit(1);
  }

  const title = data?.episode?.episode_title ?? "Untitled";
  const audio = data?.episode?.episode_audio_url ?? "";
  console.log(`\nTitle: ${title}`);
  console.log(`Audio: ${audio}`);

  const wlt = data?.episode?.episode_transcript_word_level_timestamps;
  if (!wlt || typeof wlt === "boolean" || !wlt.segments) {
    console.log("No word-level timestamps present in response.");
    return;
  }

  const segments = (wlt.segments as Segment[]) ?? [];
  console.log(`\nSegments: ${segments.length}`);
  const sample = segments.slice(0, Math.min(2, segments.length));

  sample.forEach((seg, i) => {
    const words = Array.isArray(seg.words) ? seg.words : [];
    const firstWords = words
      .slice(0, 6)
      .map((w: Word) => w.word)
      .join(" ");
    console.log(
      `  #${i + 1}: [${seg.start?.toFixed?.(2) ?? seg.start} - ${
        seg.end?.toFixed?.(2) ?? seg.end
      }] words=${words.length} text="${String(seg.text).slice(0, 80)}$${
        String(seg.text).length > 80 ? "…" : ""
      }"`,
    );
    console.log(`      first words: ${firstWords}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
