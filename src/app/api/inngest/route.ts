import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  bulkRefreshFeeds,
  dailyIntelligenceGenerateSignals,
  dailyIntelligenceProcessEpisode,
  dailyIntelligenceProcessUser,
  dailyIntelligenceReprocessEpisode,
  episodeStatusMonitor,
  feedHealthChecker,
  generateArticleSummaryFunction,
  generateEpisodeSummaryFunction,
  handleBulkSkip,
  monthlyCleanup,
  processArticle,
  refreshPodcastFeed,
  regenerateArticleSignals,
  reprocessArticle,
  updateUserPreferences,
  userEngagementAnalyzer,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Article processing
    processArticle,
    reprocessArticle,
    regenerateArticleSignals,
    // Podcast/Episode processing
    refreshPodcastFeed,
    bulkRefreshFeeds,
    dailyIntelligenceProcessUser,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceReprocessEpisode,
    dailyIntelligenceGenerateSignals,
    // Summary generation
    generateArticleSummaryFunction,
    generateEpisodeSummaryFunction,
    // User preferences & cleanup
    updateUserPreferences,
    monthlyCleanup,
    handleBulkSkip,
    // Monitoring
    episodeStatusMonitor,
    userEngagementAnalyzer,
    feedHealthChecker,
  ],
});
