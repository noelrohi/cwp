import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/server/db";
import { episode, metaSignal } from "@/server/db/schema";

/**
 * Extracts YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Creates a YouTube embed URL with start and end time
 */
function createYouTubeEmbedUrl(
  videoUrl: string,
  startTime: number,
  endTime: number,
): string | null {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) {
    return null;
  }

  // YouTube embed URL with start and end parameters
  return `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}&end=${Math.floor(endTime)}&autoplay=1`;
}

export const generateClipForMetaSignal = inngest.createFunction(
  {
    id: "generate-clip-meta-signal",
    name: "Generate Video Clip for Meta Signal",
    retries: 2,
  },
  { event: "meta-signal/generate.clip" },
  async ({ event, step }) => {
    const { metaSignalId, episodeId, timestampStart, timestampEnd } =
      event.data;

    // Step 1: Get episode info and create clip URL
    const clipData = await step.run("create-clip-url", async () => {
      const result = await db
        .select({
          id: episode.id,
          title: episode.title,
          youtubeVideoUrl: episode.youtubeVideoUrl,
          youtubeVideoId: episode.youtubeVideoId,
        })
        .from(episode)
        .where(eq(episode.id, episodeId))
        .limit(1);

      if (result.length === 0) {
        throw new Error(`Episode ${episodeId} not found`);
      }

      const ep = result[0];

      if (!ep.youtubeVideoUrl && !ep.youtubeVideoId) {
        throw new Error(
          `Episode ${episodeId} has no YouTube video available for clips`,
        );
      }

      // Create YouTube embed URL with timestamps
      const videoUrl =
        ep.youtubeVideoUrl ||
        `https://youtube.com/watch?v=${ep.youtubeVideoId}`;
      const embedUrl = createYouTubeEmbedUrl(
        videoUrl,
        timestampStart,
        timestampEnd,
      );

      if (!embedUrl) {
        throw new Error(`Could not create embed URL from: ${videoUrl}`);
      }

      console.log("[clip-generation] Created embed URL:", embedUrl);

      return {
        episodeId: ep.id,
        title: ep.title,
        clipUrl: embedUrl,
        videoId: ep.youtubeVideoId || extractYouTubeVideoId(videoUrl),
      };
    });

    // Step 2: Generate thumbnail URL (YouTube's default thumbnail)
    const thumbnailUrl = clipData.videoId
      ? `https://img.youtube.com/vi/${clipData.videoId}/maxresdefault.jpg`
      : null;

    // Step 3: Update meta signal with clip URLs
    await step.run("update-meta-signal", async () => {
      await db
        .update(metaSignal)
        .set({
          clipUrl: clipData.clipUrl,
          clipThumbnailUrl: thumbnailUrl,
          updatedAt: new Date(),
        })
        .where(eq(metaSignal.id, metaSignalId));
    });

    return {
      metaSignalId,
      clipUrl: clipData.clipUrl,
      thumbnailUrl,
      clipDuration: timestampEnd - timestampStart,
    };
  },
);
