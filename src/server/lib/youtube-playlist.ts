import { Innertube, YTNodes } from "youtubei.js";
import { parseRelativeDate } from "./youtube-date-parser";

/**
 * Extract clean playlist ID from URL or ID string
 * Handles formats like:
 * - PLXbjwMUf4AZhghVY61Q6yA9pO4yiCPPrJ
 * - https://youtube.com/playlist?list=PLXbjwMUf4AZhghVY61Q6yA9pO4yiCPPrJ
 * - https://youtube.com/playlist?list=PLXbjwMUf4AZhghVY61Q6yA9pO4yiCPPrJ&si=xxx
 */
export function extractPlaylistId(input: string): string {
  // If it's already a clean ID (starts with PL), return as-is
  if (input.startsWith("PL") && !input.includes("&") && !input.includes("?")) {
    return input;
  }

  try {
    // Try to parse as URL
    const url = new URL(input);
    const listParam = url.searchParams.get("list");
    if (listParam) {
      return listParam;
    }
  } catch {
    // Not a valid URL, might be ID with parameters
    if (input.includes("?list=")) {
      const match = input.match(/[?&]list=([^&]+)/);
      if (match) {
        return match[1];
      }
    }
  }

  // Remove any trailing parameters
  return input.split("&")[0].split("?")[0];
}

export type YouTubePlaylistVideo = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  durationSec: number;
  thumbnailUrl: string | null;
  channelName: string;
  videoUrl: string;
};

export type YouTubePlaylistInfo = {
  playlistId: string;
  title: string;
  description: string;
  channelName: string;
  videos: YouTubePlaylistVideo[];
};

/**
 * Fetch all videos from a YouTube playlist
 */
export async function fetchPlaylistVideos(
  playlistId: string,
): Promise<YouTubePlaylistInfo | null> {
  try {
    // Clean the playlist ID (remove URL parameters, etc.)
    const cleanPlaylistId = extractPlaylistId(playlistId);
    console.log(
      `[YouTube] Fetching playlist: ${cleanPlaylistId} (original: ${playlistId})`,
    );

    // Validate the playlist ID
    if (!cleanPlaylistId || cleanPlaylistId.length < 10) {
      console.error(`[YouTube] Invalid playlist ID: ${cleanPlaylistId}`);
      return null;
    }

    const youtube = await Innertube.create();
    const playlist = await youtube.getPlaylist(cleanPlaylistId);

    if (!playlist) {
      console.error(`[YouTube] Playlist not found: ${cleanPlaylistId}`);
      return null;
    }

    console.log(`[YouTube] Playlist found: ${playlist.info.title}`);
    const videos: YouTubePlaylistVideo[] = [];

    // Get all videos from the playlist
    for (const item of playlist.items) {
      // Type guard: only process PlaylistVideo items
      if (!(item instanceof YTNodes.PlaylistVideo)) continue;

      const video = item;

      // Type guards for video properties
      const videoId =
        video && typeof video === "object" && "id" in video ? video.id : null;

      if (!videoId || typeof videoId !== "string") continue;

      const title =
        video && typeof video === "object" && "title" in video && video.title
          ? typeof video.title === "object" && "text" in video.title
            ? String(video.title.text)
            : ""
          : "";

      const description =
        video &&
        typeof video === "object" &&
        "description" in video &&
        typeof video.description === "string"
          ? video.description
          : "";

      // NOTE: Playlist video items don't have absolute published dates
      // They only have relative dates in video_info (e.g., "7 months ago")
      // which cannot be reliably converted to absolute timestamps.
      // Individual video API calls would be needed for exact dates, but that's too slow.

      const duration =
        video &&
        typeof video === "object" &&
        "duration" in video &&
        video.duration
          ? typeof video.duration === "object" && "seconds" in video.duration
            ? Number(video.duration.seconds)
            : 0
          : 0;

      // Get thumbnail from thumbnails array (first/largest one)
      const thumbnailUrl = (() => {
        if (!video || typeof video !== "object") return null;
        if (!("thumbnails" in video)) return null;

        const thumbs = video.thumbnails;
        if (!Array.isArray(thumbs) || thumbs.length === 0) return null;

        const firstThumb = thumbs[0];
        if (
          firstThumb &&
          typeof firstThumb === "object" &&
          "url" in firstThumb
        ) {
          return String(firstThumb.url);
        }

        return null;
      })();

      const channelName =
        video && typeof video === "object" && "author" in video && video.author
          ? typeof video.author === "object" && "name" in video.author
            ? String(video.author.name)
            : ""
          : "";

      // Try to get published date from video_info (contains relative date like "7 months ago")
      const videoInfoText =
        video.video_info &&
        typeof video.video_info === "object" &&
        "text" in video.video_info
          ? String(video.video_info.text)
          : "";

      // Parse the relative date
      const publishedDate = parseRelativeDate(videoInfoText) || new Date();

      videos.push({
        videoId,
        title,
        description,
        publishedAt: publishedDate,
        durationSec: duration,
        thumbnailUrl,
        channelName,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }

    // Deduplicate videos by videoId (some playlists have duplicates)
    const uniqueVideosMap = new Map<string, YouTubePlaylistVideo>();
    for (const video of videos) {
      if (!uniqueVideosMap.has(video.videoId)) {
        uniqueVideosMap.set(video.videoId, video);
      }
    }
    const uniqueVideos = Array.from(uniqueVideosMap.values());

    console.log(
      `[YouTube] Successfully parsed ${videos.length} videos (${uniqueVideos.length} unique) from playlist`,
    );

    return {
      playlistId: cleanPlaylistId,
      title: playlist.info.title || "",
      description: playlist.info.description || "",
      channelName: playlist.info.author?.name || "",
      videos: uniqueVideos,
    };
  } catch (error) {
    console.error(`[YouTube] Failed to fetch playlist ${playlistId}:`, error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error(`[YouTube] Error message: ${error.message}`);
      console.error(`[YouTube] Error stack: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Fetch a single video's metadata
 */
export async function fetchVideoMetadata(
  videoId: string,
): Promise<YouTubePlaylistVideo | null> {
  try {
    const youtube = await Innertube.create();
    const video = await youtube.getInfo(videoId);

    if (!video) {
      console.error(`Video not found: ${videoId}`);
      return null;
    }

    const publishedText =
      video.primary_info &&
      typeof video.primary_info === "object" &&
      "published" in video.primary_info &&
      video.primary_info.published &&
      typeof video.primary_info.published === "object" &&
      "text" in video.primary_info.published
        ? String(video.primary_info.published.text)
        : null;

    const thumbnailUrl =
      video.basic_info.thumbnail &&
      Array.isArray(video.basic_info.thumbnail) &&
      video.basic_info.thumbnail[0] &&
      typeof video.basic_info.thumbnail[0] === "object" &&
      "url" in video.basic_info.thumbnail[0]
        ? String(video.basic_info.thumbnail[0].url)
        : null;

    return {
      videoId,
      title: video.basic_info.title || "",
      description: video.basic_info.short_description || "",
      publishedAt: publishedText ? new Date(publishedText) : new Date(),
      durationSec: video.basic_info.duration || 0,
      thumbnailUrl,
      channelName: video.basic_info.author || "",
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (error) {
    console.error(`Failed to fetch YouTube video ${videoId}:`, error);
    return null;
  }
}
