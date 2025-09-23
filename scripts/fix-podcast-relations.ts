#!/usr/bin/env tsx

import { eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { episode, podcast } from "@/server/db/schema/podcast";

/**
 * Migration script to fix existing episode-podcast relationships
 * This script:
 * 1. Finds episodes where podcastId is null but series contains a podcast ID
 * 2. Links those episodes to the correct podcast record
 * 3. Clears the series field so it can be used for actual series names
 */

async function fixPodcastRelations() {
  console.log("🔄 Starting podcast relations migration...");

  try {
    // Find all episodes with null podcastId but non-null series
    const episodesNeedingFix = await db
      .select({
        id: episode.id,
        episodeId: episode.episodeId,
        series: episode.series,
        title: episode.title,
      })
      .from(episode)
      .where(isNull(episode.podcastId));

    console.log(
      `📊 Found ${episodesNeedingFix.length} episodes needing podcast relation fix`,
    );

    if (episodesNeedingFix.length === 0) {
      console.log("✅ No episodes need fixing!");
      return;
    }

    let fixedCount = 0;
    let skippedCount = 0;

    for (const ep of episodesNeedingFix) {
      try {
        // If series field contains a podcast ID, try to find the matching podcast
        if (ep.series) {
          const [matchingPodcast] = await db
            .select({ id: podcast.id, title: podcast.title })
            .from(podcast)
            .where(eq(podcast.podcastId, ep.series))
            .limit(1);

          if (matchingPodcast) {
            // Update episode to link to the correct podcast
            await db
              .update(episode)
              .set({
                podcastId: matchingPodcast.id,
                series: null, // Clear series field for future use
                updatedAt: new Date(),
              })
              .where(eq(episode.id, ep.id));

            console.log(
              `✅ Fixed episode "${ep.title}" -> linked to podcast "${matchingPodcast.title}"`,
            );
            fixedCount++;
          } else {
            console.log(
              `⚠️  Skipped episode "${ep.title}" - no matching podcast found for series "${ep.series}"`,
            );
            skippedCount++;
          }
        } else {
          console.log(
            `⚠️  Skipped episode "${ep.title}" - no series information to work with`,
          );
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Error fixing episode ${ep.episodeId}:`, error);
        skippedCount++;
      }
    }

    console.log(`\n📈 Migration Summary:`);
    console.log(`   ✅ Fixed: ${fixedCount} episodes`);
    console.log(`   ⚠️  Skipped: ${skippedCount} episodes`);
    console.log(`   📊 Total: ${episodesNeedingFix.length} episodes processed`);

    if (fixedCount > 0) {
      console.log(`\n🎉 Migration completed successfully!`);
      console.log(
        `   Episodes are now properly linked to podcasts via foreign keys`,
      );
      console.log(
        `   The series field is cleared and ready for actual series names`,
      );
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

async function main() {
  await fixPodcastRelations();
}

main().catch(console.error);
