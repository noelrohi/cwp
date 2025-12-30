import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  bulkRefreshArticleFeeds,
  bulkRefreshFeeds,
  dailyIntelligenceProcessEpisode,
  dailyIntelligenceReprocessEpisode,
  fetchEpisodeTranscript,
  generateArticleSummaryFunction,
  generateEpisodeSummaryFunction,
  healthCheck,
  processArticle,
  refreshArticleFeed,
  refreshPodcastFeed,
  reprocessArticle,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Article processing
    processArticle,
    reprocessArticle,
    // Podcast/Episode processing
    refreshPodcastFeed,
    refreshArticleFeed,
    bulkRefreshFeeds,
    bulkRefreshArticleFeeds,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceReprocessEpisode,
    fetchEpisodeTranscript,
    // Summary generation
    generateArticleSummaryFunction,
    generateEpisodeSummaryFunction,
    // Monitoring & Health
    healthCheck,
  ],
});
