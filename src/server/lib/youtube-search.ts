import { Innertube, YTNodes } from "youtubei.js";

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  durationSec: number;
  thumbnailUrl: string | null;
  channelName: string;
  channelId: string | null;
  videoUrl: string;
  viewCount: string | null;
};

export type YouTubeSearchOptions = {
  query: string;
  channelId?: string;
  maxResults?: number;
};

/**
 * Search YouTube for videos using the episode title
 * Optionally filter by channel ID
 */
export async function searchYouTubeVideos(
  options: YouTubeSearchOptions,
): Promise<YouTubeSearchResult[]> {
  const { query, channelId, maxResults = 20 } = options;

  try {
    console.log(`[YouTube Search] Searching for: "${query}"`);
    if (channelId) {
      console.log(`[YouTube Search] Filtering by channel: ${channelId}`);
    }

    const youtube = await Innertube.create();

    // Search with channel filter if provided
    const searchQuery = channelId ? `${query} channel:${channelId}` : query;
    const results = await youtube.search(searchQuery, {
      type: "video",
    });

    const videos: YouTubeSearchResult[] = [];

    // Process search results
    for (const item of results.videos) {
      // Only process Video items
      if (!(item instanceof YTNodes.Video)) continue;

      const videoId = item.id;
      if (!videoId || typeof videoId !== "string") continue;

      const title =
        item.title && typeof item.title === "object" && "text" in item.title
          ? String(item.title.text)
          : "";

      const description =
        item.description && typeof item.description === "string"
          ? item.description
          : "";

      // Get duration
      const duration =
        item.duration && typeof item.duration === "object" && "seconds" in item.duration
          ? Number(item.duration.seconds)
          : 0;

      // Get thumbnail
      const thumbnailUrl = (() => {
        if (!item.thumbnails || !Array.isArray(item.thumbnails)) return null;
        if (item.thumbnails.length === 0) return null;

        const firstThumb = item.thumbnails[0];
        if (
          firstThumb &&
          typeof firstThumb === "object" &&
          "url" in firstThumb
        ) {
          return String(firstThumb.url);
        }

        return null;
      })();

      // Get channel info
      const channelName =
        item.author && typeof item.author === "object" && "name" in item.author
          ? String(item.author.name)
          : "";

      const authorChannelId =
        item.author && typeof item.author === "object" && "id" in item.author
          ? String(item.author.id)
          : null;

      // Get published date from relative text
      const publishedText =
        item.published &&
        typeof item.published === "object" &&
        "text" in item.published
          ? String(item.published.text)
          : "";

      // Parse the relative date
      const { parseRelativeDate } = await import("./youtube-date-parser");
      const publishedAt = parseRelativeDate(publishedText);

      // Get view count if available
      const viewCount =
        item.view_count &&
        typeof item.view_count === "object" &&
        "text" in item.view_count
          ? String(item.view_count.text)
          : null;

      videos.push({
        videoId,
        title,
        description,
        publishedAt,
        durationSec: duration,
        thumbnailUrl,
        channelName,
        channelId: authorChannelId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        viewCount,
      });

      // Stop if we have enough results
      if (videos.length >= maxResults) {
        break;
      }
    }

    console.log(`[YouTube Search] Found ${videos.length} videos`);

    return videos;
  } catch (error) {
    console.error(`[YouTube Search] Failed to search:`, error);
    if (error instanceof Error) {
      console.error(`[YouTube Search] Error message: ${error.message}`);
    }
    return [];
  }
}

/**
 * Get channel ID from a channel URL or handle
 */
export async function getChannelId(
  channelUrlOrHandle: string,
): Promise<string | null> {
  try {
    const youtube = await Innertube.create();

    // Try to get channel info
    let channelId = channelUrlOrHandle;

    // If it's a URL, extract the channel identifier
    if (channelUrlOrHandle.includes("youtube.com")) {
      const url = new URL(channelUrlOrHandle);
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (pathParts[0] === "channel" && pathParts[1]) {
        channelId = pathParts[1];
      } else if (pathParts[0] === "@" || pathParts[0].startsWith("@")) {
        // Handle format
        const handle = pathParts[0].startsWith("@") ? pathParts[0] : `@${pathParts[0]}`;
        const channel = await youtube.getChannel(handle);
        return channel.header?.channel_id || null;
      } else if (pathParts[0] === "c" && pathParts[1]) {
        // Custom URL format
        const channel = await youtube.getChannel(pathParts[1]);
        return channel.header?.channel_id || null;
      }
    } else if (channelUrlOrHandle.startsWith("@")) {
      // Handle format
      const channel = await youtube.getChannel(channelUrlOrHandle);
      return channel.header?.channel_id || null;
    }

    return channelId;
  } catch (error) {
    console.error(`[YouTube] Failed to get channel ID:`, error);
    return null;
  }
}
