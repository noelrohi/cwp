/**
 * Utility functions for podcast source type detection and management
 */

/**
 * Check if a feed URL is a YouTube playlist URL
 */
export function isYouTubeFeedUrl(feedUrl: string | null): boolean {
  if (!feedUrl) return false;
  return (
    feedUrl.includes("youtube.com/playlist") ||
    feedUrl.includes("youtu.be/playlist")
  );
}

/**
 * Podcast source types
 */
export type PodcastSourceType = "rss" | "youtube" | "none";

/**
 * Determine the source type of a podcast based on its feedUrl and youtubePlaylistId
 *
 * Rules:
 * - If youtubePlaylistId exists OR feedUrl is a YouTube URL → youtube
 * - If feedUrl exists and is not YouTube → rss
 * - Otherwise → none
 */
export function getPodcastSourceType(
  feedUrl: string | null,
  youtubePlaylistId: string | null,
): PodcastSourceType {
  if (youtubePlaylistId || isYouTubeFeedUrl(feedUrl)) {
    return "youtube";
  }
  if (feedUrl) {
    return "rss";
  }
  return "none";
}
