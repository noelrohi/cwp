import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  bulkRefreshArticleFeeds,
  bulkRefreshFeeds,
  dailyIntelligenceGenerateSignals,
  dailyIntelligenceProcessEpisode,
  dailyIntelligenceProcessEpisodeWithSignals,
  dailyIntelligenceProcessUser,
  dailyIntelligenceReprocessEpisode,
  generateArticleSignalsFunction,
  generateArticleSummaryFunction,
  generateEpisodeSummaryFunction,
  handleBulkSkip,
  processArticle,
  processArticleWithSignals,
  refreshArticleFeed,
  refreshPodcastFeed,
  regenerateArticleSignals,
  reprocessArticle,
  updateUserPreferences,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Article processing
    processArticle,
    processArticleWithSignals,
    reprocessArticle,
    generateArticleSignalsFunction,
    regenerateArticleSignals,
    // Podcast/Episode processing
    refreshPodcastFeed,
    refreshArticleFeed,
    bulkRefreshFeeds,
    bulkRefreshArticleFeeds,
    dailyIntelligenceProcessUser,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceProcessEpisodeWithSignals,
    dailyIntelligenceReprocessEpisode,
    dailyIntelligenceGenerateSignals,
    // Summary generation
    generateArticleSummaryFunction,
    generateEpisodeSummaryFunction,
    // User preferences & cleanup
    updateUserPreferences,
    // monthlyCleanup,
    handleBulkSkip,
    // // Monitoring & Health
    // episodeStatusMonitor,
    // userEngagementAnalyzer,
    // feedHealthChecker,
    // healthCheck,
    // helloWorld,
  ],
});
