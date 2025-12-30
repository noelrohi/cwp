import { Innertube, YTNodes } from "youtubei.js";
import { parseRelativeDate } from "./youtube-date-parser";

/**
 * Extract channel ID from various YouTube channel URL formats
 * Handles formats like:
 * - UCxxxxxx (channel ID)
 * - https://youtube.com/channel/UCxxxxxx
 * - https://youtube.com/@username
 * - @username
 * - https://youtube.com/c/channelname
 */
export async function extractChannelId(input: string): Promise<string | null> {
  const trimmed = input.trim();

  // If it's already a clean channel ID (starts with UC), return as-is
  if (
    trimmed.startsWith("UC") &&
    !trimmed.includes("/") &&
    !trimmed.includes("?")
  ) {
    return trimmed;
  }

  try {
    const youtube = await Innertube.create();

    // Try to parse as URL
    if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split("/").filter(Boolean);

      // Format: /channel/UCxxxxxx
      if (pathParts[0] === "channel" && pathParts[1]) {
        return pathParts[1];
      }

      // Format: /@username
      if (pathParts[0]?.startsWith("@")) {
        const handle = pathParts[0];
        const channel = await youtube.getChannel(handle);
        const header = channel.header;
        if (header && typeof header === "object" && "channel_id" in header) {
          return String(header.channel_id) || null;
        }
        return null;
      }

      // Format: /c/customname
      if (pathParts[0] === "c" && pathParts[1]) {
        const channel = await youtube.getChannel(pathParts[1]);
        const header = channel.header;
        if (header && typeof header === "object" && "channel_id" in header) {
          return String(header.channel_id) || null;
        }
        return null;
      }

      // Format: /username (legacy)
      if (pathParts[0] && pathParts[0] !== "watch") {
        const channel = await youtube.getChannel(pathParts[0]);
        const header = channel.header;
        if (header && typeof header === "object" && "channel_id" in header) {
          return String(header.channel_id) || null;
        }
        return null;
      }
    }

    // Handle @username format without URL
    if (trimmed.startsWith("@")) {
      const channel = await youtube.getChannel(trimmed);
      const header = channel.header;
      if (header && typeof header === "object" && "channel_id" in header) {
        return String(header.channel_id) || null;
      }
      return null;
    }

    // Try to resolve as username/handle
    const channel = await youtube.getChannel(trimmed);
    const header = channel.header;
    if (header && typeof header === "object" && "channel_id" in header) {
      return String(header.channel_id) || null;
    }

    return null;
  } catch (error) {
    console.error(
      `[YouTube] Failed to extract channel ID from "${input}":`,
      error,
    );
    return null;
  }
}

export type YouTubeChannelVideo = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  durationSec: number;
  thumbnailUrl: string | null;
  channelName: string;
  videoUrl: string;
};

export type YouTubeChannelInfo = {
  channelId: string;
  channelName: string;
  description: string;
  thumbnailUrl: string | null;
  videos: YouTubeChannelVideo[];
};

/**
 * Fetch videos from a YouTube channel (limited to 100 most recent videos)
 */
export async function fetchChannelVideos(
  channelIdOrUrl: string,
): Promise<YouTubeChannelInfo | null> {
  try {
    // Extract clean channel ID
    const channelId = await extractChannelId(channelIdOrUrl);
    console.log(
      `[YouTube] Fetching channel: ${channelId} (original: ${channelIdOrUrl})`,
    );

    if (!channelId) {
      console.error(`[YouTube] Invalid channel ID or URL: ${channelIdOrUrl}`);
      return null;
    }

    const youtube = await Innertube.create();
    const channel = await youtube.getChannel(channelId);

    if (!channel) {
      console.error(`[YouTube] Channel not found: ${channelId}`);
      return null;
    }

    // Get channel metadata
    const channelName =
      channel.metadata?.title ||
      (channel.header &&
      typeof channel.header === "object" &&
      "title" in channel.header &&
      channel.header.title &&
      typeof channel.header.title === "object" &&
      "text" in channel.header.title
        ? String(channel.header.title.text)
        : "");

    const description = channel.metadata?.description || "";

    const thumbnailUrl = (() => {
      const avatar = channel.metadata?.avatar;
      if (!avatar || !Array.isArray(avatar) || avatar.length === 0) return null;
      const firstThumb = avatar[0];
      if (firstThumb && typeof firstThumb === "object" && "url" in firstThumb) {
        return String(firstThumb.url);
      }
      return null;
    })();

    console.log(`[YouTube] Channel found: ${channelName}`);

    // Get videos from the channel's videos tab
    const videosTab = await channel.getVideos();
    const videos: YouTubeChannelVideo[] = [];

    let itemCount = 0;
    const maxVideos = 100;

    // Process initial batch of videos
    for (const item of videosTab.videos) {
      if (itemCount >= maxVideos) break;

      // Type guard: only process Video items
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

      const duration =
        item.duration &&
        typeof item.duration === "object" &&
        "seconds" in item.duration
          ? Number(item.duration.seconds)
          : 0;

      // Get thumbnail from thumbnails array
      const videoThumbnailUrl = (() => {
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

      // Parse relative date from published text
      const publishedText =
        item.published &&
        typeof item.published === "object" &&
        "text" in item.published
          ? String(item.published.text)
          : "";

      const publishedDate = parseRelativeDate(publishedText) || new Date();

      videos.push({
        videoId,
        title,
        description,
        publishedAt: publishedDate,
        durationSec: duration,
        thumbnailUrl: videoThumbnailUrl,
        channelName,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });

      itemCount++;
    }

    // Try to load more videos if we have less than 100
    if (itemCount < maxVideos && videosTab.has_continuation) {
      try {
        const continuation = await videosTab.getContinuation();

        for (const item of continuation.videos) {
          if (itemCount >= maxVideos) break;

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

          const duration =
            item.duration &&
            typeof item.duration === "object" &&
            "seconds" in item.duration
              ? Number(item.duration.seconds)
              : 0;

          const videoThumbnailUrl = (() => {
            if (!item.thumbnails || !Array.isArray(item.thumbnails))
              return null;
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

          const publishedText =
            item.published &&
            typeof item.published === "object" &&
            "text" in item.published
              ? String(item.published.text)
              : "";

          const publishedDate = parseRelativeDate(publishedText) || new Date();

          videos.push({
            videoId,
            title,
            description,
            publishedAt: publishedDate,
            durationSec: duration,
            thumbnailUrl: videoThumbnailUrl,
            channelName,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          });

          itemCount++;
        }
      } catch (error) {
        console.warn(`[YouTube] Failed to load continuation:`, error);
        // Continue with what we have
      }
    }

    // Deduplicate videos by videoId
    const uniqueVideosMap = new Map<string, YouTubeChannelVideo>();
    for (const video of videos) {
      if (!uniqueVideosMap.has(video.videoId)) {
        uniqueVideosMap.set(video.videoId, video);
      }
    }
    const uniqueVideos = Array.from(uniqueVideosMap.values());

    console.log(
      `[YouTube] Successfully fetched ${videos.length} videos (${uniqueVideos.length} unique) from channel`,
    );

    return {
      channelId,
      channelName,
      description,
      thumbnailUrl,
      videos: uniqueVideos,
    };
  } catch (error) {
    console.error(
      `[YouTube] Failed to fetch channel ${channelIdOrUrl}:`,
      error,
    );
    if (error instanceof Error) {
      console.error(`[YouTube] Error message: ${error.message}`);
      console.error(`[YouTube] Error stack: ${error.stack}`);
    }
    return null;
  }
}
