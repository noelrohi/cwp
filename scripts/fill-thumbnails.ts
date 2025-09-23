#!/usr/bin/env tsx
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { createPodscanClient } from "@/lib/podscan";
import { db } from "@/server/db";
import { episode } from "@/server/db/schema/podcast";

interface EpisodeApiItem {
  episode_id: string;
  episode_title: string;
  episode_image_url?: string;
}

interface EpisodesPage {
  episodes: EpisodeApiItem[];
  pagination: {
    total: string;
    per_page: string;
    current_page: string;
    last_page: string;
    from: string;
    to: string;
  };
}

async function fetchEpisodesForPodcast(
  podcastId: string,
  bearerToken: string,
): Promise<Map<string, string>> {
  const imageByEpisodeId = new Map<string, string>();
  let page = 1;
  let totalPages = 1;

  do {
    const client = createPodscanClient(bearerToken);
    const data = (await client.getPodcastEpisodes(podcastId, {
      page,
      showFullPodcast: true,
      wordLevelTimestamps: false,
    })) as EpisodesPage;
    totalPages = parseInt(data.pagination.last_page, 10) || 1;
    for (const ep of data.episodes) {
      if (ep.episode_image_url) {
        imageByEpisodeId.set(ep.episode_id, ep.episode_image_url);
      }
    }
    page += 1;
    // Light rate-limit spacing
    if (page <= totalPages) await new Promise((r) => setTimeout(r, 200));
  } while (page <= totalPages);

  return imageByEpisodeId;
}

async function main() {
  const args = process.argv.slice(2);
  const explicitPodcastIds = args.filter((a) => a.startsWith("pd_"));
  const bearerToken =
    process.env.PODSCAN_BEARER_TOKEN || args.find((a) => a.startsWith("psk_"));

  if (!bearerToken) {
    console.error(
      "Missing Podscan API token. Provide PODSCAN_BEARER_TOKEN env or pass a token arg (starting with psk_).",
    );
    process.exit(1);
  }

  // Get episodes missing thumbnails
  const missing = await db
    .select({
      id: episode.id,
      episodeId: episode.episodeId,
      series: episode.series,
    })
    .from(episode)
    .where(isNull(episode.thumbnailUrl));

  if (missing.length === 0) {
    console.log("No episodes with missing thumbnails.");
    return;
  }

  // Determine which podcast series to update
  const seriesSet = new Set<string>();
  const seriesToEpisodes = new Map<
    string,
    Array<{ id: string; episodeId: string }>
  >();

  for (const row of missing) {
    if (!row.series) continue; // skip if we don't have a series id
    if (
      explicitPodcastIds.length > 0 &&
      !explicitPodcastIds.includes(row.series)
    )
      continue;
    seriesSet.add(row.series);
    const arr = seriesToEpisodes.get(row.series) || [];
    arr.push({ id: row.id, episodeId: row.episodeId });
    seriesToEpisodes.set(row.series, arr);
  }

  if (seriesSet.size === 0) {
    console.log("No target series found matching the criteria.");
    return;
  }

  console.log(`Will backfill thumbnails for ${seriesSet.size} podcast series.`);

  for (const seriesId of seriesSet) {
    try {
      console.log(`Fetching images for series: ${seriesId}`);
      const map = await fetchEpisodesForPodcast(seriesId, bearerToken);
      const rows = seriesToEpisodes.get(seriesId) || [];
      let updated = 0;

      for (const r of rows) {
        const img = map.get(r.episodeId);
        if (!img) continue;
        await db
          .update(episode)
          .set({ thumbnailUrl: img, updatedAt: new Date() })
          .where(and(eq(episode.id, r.id), isNull(episode.thumbnailUrl)));
        updated += 1;
      }
      console.log(
        `Series ${seriesId}: updated ${updated} of ${rows.length} episodes.`,
      );
    } catch (err) {
      console.error(`Failed updating series ${seriesId}:`, err);
    }
  }

  console.log("Done backfilling thumbnails.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
