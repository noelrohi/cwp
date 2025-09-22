/**
 * Podscan API client and type definitions
 */

const PODSCAN_BASE_URL = "https://podscan.fm/api/v1";

// Type definitions
export type Word = {
  start: number;
  end: number;
  word: string;
};

export type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: Word[];
};

export type WordLevelTimestamps =
  | {
      segments?: Segment[];
    }
  | false;

export type PodcastInfo = {
  podcast_name?: string;
};

export type Episode = {
  episode_id?: string;
  episode_title?: string;
  episode_audio_url?: string;
  episode_transcript_word_level_timestamps?: WordLevelTimestamps;
  podcast?: PodcastInfo;
};

export type EpisodeResponse = {
  episode?: Episode;
};

export type PodcastEpisodesResponse = {
  episodes: Episode[];
  total_pages?: number;
  current_page?: number;
};

// API Client
export class PodscanClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl = PODSCAN_BASE_URL) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  private async makeRequest<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Podscan API request failed: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Get a single episode with optional word-level timestamps
   */
  async getEpisode(
    episodeId: string,
    options: {
      showFullPodcast?: boolean;
      wordLevelTimestamps?: boolean;
    } = {},
  ): Promise<EpisodeResponse> {
    const url = new URL(`${this.baseUrl}/episodes/${episodeId}`);

    if (options.showFullPodcast) {
      url.searchParams.set("show_full_podcast", "true");
    }
    if (options.wordLevelTimestamps) {
      url.searchParams.set("word_level_timestamps", "true");
    }

    return this.makeRequest<EpisodeResponse>(url.toString());
  }

  /**
   * Get episodes for a podcast with pagination
   */
  async getPodcastEpisodes(
    podcastId: string,
    options: {
      page?: number;
      showFullPodcast?: boolean;
      wordLevelTimestamps?: boolean;
    } = {},
  ): Promise<PodcastEpisodesResponse> {
    const url = new URL(`${this.baseUrl}/podcasts/${podcastId}/episodes`);

    if (options.page && options.page > 1) {
      url.searchParams.set("page", options.page.toString());
    }
    if (options.showFullPodcast) {
      url.searchParams.set("show_full_podcast", "true");
    }
    if (options.wordLevelTimestamps) {
      url.searchParams.set("word_level_timestamps", "true");
    }

    return this.makeRequest<PodcastEpisodesResponse>(url.toString());
  }
}

// Convenience function for creating a client
export function createPodscanClient(token: string): PodscanClient {
  return new PodscanClient(token);
}

// Legacy API helpers for backward compatibility
export function buildEpisodeUrl(
  episodeId: string,
  options: {
    showFullPodcast?: boolean;
    wordLevelTimestamps?: boolean;
  } = {},
): string {
  const url = new URL(`${PODSCAN_BASE_URL}/episodes/${episodeId}`);

  if (options.showFullPodcast) {
    url.searchParams.set("show_full_podcast", "true");
  }
  if (options.wordLevelTimestamps) {
    url.searchParams.set("word_level_timestamps", "true");
  }

  return url.toString();
}

export function buildPodcastEpisodesUrl(
  podcastId: string,
  options: {
    page?: number;
    showFullPodcast?: boolean;
    wordLevelTimestamps?: boolean;
  } = {},
): string {
  const url = new URL(`${PODSCAN_BASE_URL}/podcasts/${podcastId}/episodes`);

  if (options.page && options.page > 1) {
    url.searchParams.set("page", options.page.toString());
  }
  if (options.showFullPodcast) {
    url.searchParams.set("show_full_podcast", "true");
  }
  if (options.wordLevelTimestamps) {
    url.searchParams.set("word_level_timestamps", "true");
  }

  return url.toString();
}
