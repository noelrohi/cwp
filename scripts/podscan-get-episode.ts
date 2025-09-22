#!/usr/bin/env tsx
import "dotenv/config";

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

  const url = new URL(`https://podscan.fm/api/v1/episodes/${episodeId}`);
  url.searchParams.set("show_full_podcast", "true");
  url.searchParams.set("word_level_timestamps", "true");

  console.log("GET", url.toString());

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    console.error("Request failed:", res.status, res.statusText);
    const body = await res.text();
    console.error(body);
    process.exit(1);
  }

  type Word = { start: number; end: number; word: string };
  type Segment = {
    id: number;
    start: number;
    end: number;
    text: string;
    words?: Word[];
  };
  type EpisodeResponse = {
    episode?: {
      episode_title?: string;
      episode_audio_url?: string;
      episode_transcript_word_level_timestamps?:
        | { segments?: Segment[] }
        | false;
    };
  };

  const data = (await res.json()) as EpisodeResponse;

  const title = data?.episode?.episode_title ?? "Untitled";
  const audio = data?.episode?.episode_audio_url ?? "";
  console.log(`\nTitle: ${title}`);
  console.log(`Audio: ${audio}`);

  const wlt = data?.episode?.episode_transcript_word_level_timestamps;
  if (!wlt || !wlt.segments) {
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
