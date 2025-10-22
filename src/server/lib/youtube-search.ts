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

export type YouTubePlaylistSearchResult = {
  playlistId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelName: string;
  channelId: string | null;
  videoCount: number | null;
  playlistUrl: string;
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
        item.duration &&
        typeof item.duration === "object" &&
        "seconds" in item.duration
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
 * Search YouTube for playlists
 */
export async function searchYouTubePlaylists(
  query: string,
  maxResults = 10,
): Promise<YouTubePlaylistSearchResult[]> {
  try {
    console.log(`[YouTube Search] Searching for playlists: "${query}"`);

    const youtube = await Innertube.create();
    const results = await youtube.search(query, {
      type: "playlist",
    });

    const playlists: YouTubePlaylistSearchResult[] = [];

    // YouTube search returns playlists in the playlists property, not results
    const items = results.playlists || results.results || [];

    for (const item of items) {
      // Handle both LockupView (new format) and Playlist (old format)
      // biome-ignore lint/suspicious/noExplicitAny: **
      const itemData = item as any;

      // Extract playlist ID from LockupView format
      const playlistId =
        itemData.content_id ||
        itemData.content?.playlist_id ||
        itemData.id ||
        itemData.playlist_id ||
        null;
      if (!playlistId || typeof playlistId !== "string") continue;

      // Extract title from LockupView metadata
      const title = (() => {
        const titleData =
          itemData.metadata?.title ||
          itemData.content?.title ||
          itemData.title ||
          itemData.headline;
        if (titleData && typeof titleData === "object" && "text" in titleData) {
          return String(titleData.text);
        }
        if (typeof titleData === "string") {
          return titleData;
        }
        return "";
      })();

      const description = "";

      // Extract thumbnail from LockupView content_image.primary_thumbnail.image (array)
      const thumbnailUrl = (() => {
        const imgData = itemData.content_image;
        if (
          imgData &&
          typeof imgData === "object" &&
          imgData !== null &&
          "primary_thumbnail" in imgData
        ) {
          const primaryThumb = (imgData as { primary_thumbnail: unknown })
            .primary_thumbnail;
          if (
            primaryThumb &&
            typeof primaryThumb === "object" &&
            primaryThumb !== null &&
            "image" in primaryThumb
          ) {
            const images = (primaryThumb as { image: unknown }).image;
            if (Array.isArray(images) && images.length > 0) {
              const firstImage = images[0];
              if (
                firstImage &&
                typeof firstImage === "object" &&
                firstImage !== null &&
                "url" in firstImage
              ) {
                return String((firstImage as { url: string }).url);
              }
            }
          }
        }

        const thumbs =
          itemData.content?.thumbnail?.thumbnails ||
          itemData.thumbnails ||
          itemData.thumbnail?.thumbnails;
        if (!Array.isArray(thumbs) || thumbs.length === 0) return null;

        const firstThumb = thumbs[0];
        if (
          firstThumb &&
          typeof firstThumb === "object" &&
          "url" in firstThumb
        ) {
          return String((firstThumb as { url: string }).url);
        }

        return null;
      })();

      // Extract channel name from LockupView metadata_parts
      const channelName = (() => {
        const metadataLine =
          itemData.metadata?.metadata_parts || itemData.metadata?.subtitle;
        if (metadataLine) {
          if (Array.isArray(metadataLine) && metadataLine.length > 0) {
            const first = metadataLine[0];
            if (first && typeof first === "object" && "text" in first) {
              return String((first as { text: string }).text);
            }
          }
          if (typeof metadataLine === "object" && "text" in metadataLine) {
            return String((metadataLine as { text: string }).text);
          }
        }

        const author =
          itemData.content?.author || itemData.author || itemData.channel;
        if (author && typeof author === "object" && "name" in author) {
          return String((author as { name: string }).name);
        }
        return "";
      })();

      // Extract channel ID
      const channelId = (() => {
        const author =
          itemData.content?.author || itemData.author || itemData.channel;
        if (author && typeof author === "object" && "id" in author) {
          return String((author as { id: string }).id);
        }
        return null;
      })();

      // Extract video count from LockupView metadata_parts
      const videoCount = (() => {
        const metadataLine =
          itemData.metadata?.metadata_parts || itemData.metadata?.subtitle;
        if (
          metadataLine &&
          Array.isArray(metadataLine) &&
          metadataLine.length > 1
        ) {
          const second = metadataLine[1];
          if (second && typeof second === "object" && "text" in second) {
            const text = String((second as { text: string }).text);
            // Parse "X videos" format
            const match = text.match(/(\d+)\s*videos?/i);
            if (match) {
              return Number.parseInt(match[1], 10);
            }
          }
        }

        const count =
          itemData.content?.video_count ||
          itemData.video_count ||
          itemData.videoCount;
        return count && typeof count === "number" ? count : null;
      })();

      playlists.push({
        playlistId,
        title,
        description,
        thumbnailUrl,
        channelName,
        channelId,
        videoCount,
        playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      });

      if (playlists.length >= maxResults) {
        break;
      }
    }

    console.log(`[YouTube Search] Found ${playlists.length} playlists`);

    return playlists;
  } catch (error) {
    console.error(`[YouTube Search] Failed to search playlists:`, error);
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
        const handle = pathParts[0].startsWith("@")
          ? pathParts[0]
          : `@${pathParts[0]}`;
        const channel = await youtube.getChannel(handle);
        // Type guard for channel_id
        const header = channel.header;
        if (header && typeof header === "object" && "channel_id" in header) {
          return String(header.channel_id) || null;
        }
        return null;
      } else if (pathParts[0] === "c" && pathParts[1]) {
        // Custom URL format
        const channel = await youtube.getChannel(pathParts[1]);
        // Type guard for channel_id
        const header = channel.header;
        if (header && typeof header === "object" && "channel_id" in header) {
          return String(header.channel_id) || null;
        }
        return null;
      }
    } else if (channelUrlOrHandle.startsWith("@")) {
      // Handle format
      const channel = await youtube.getChannel(channelUrlOrHandle);
      // Type guard for channel_id
      const header = channel.header;
      if (header && typeof header === "object" && "channel_id" in header) {
        return String(header.channel_id) || null;
      }
      return null;
    }

    return channelId;
  } catch (error) {
    console.error(`[YouTube] Failed to get channel ID:`, error);
    return null;
  }
}
