import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  dailyIntelligenceGenerateSignals,
  dailyIntelligencePipeline,
  dailyIntelligenceProcessEpisode,
  dailyIntelligenceProcessUser,
  dailyIntelligenceReprocessEpisode,
  feedParserPipeline,
  handleBulkSkip,
  monthlyCleanup,
  processArticle,
  regenerateArticleSignals,
  reprocessArticle,
  updateUserPreferences,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Article processing
    processArticle,
    reprocessArticle,
    regenerateArticleSignals,
    // Podcast/Episode processing
    feedParserPipeline,
    dailyIntelligencePipeline,
    dailyIntelligenceProcessUser,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceReprocessEpisode,
    dailyIntelligenceGenerateSignals,
    // User preferences & cleanup
    updateUserPreferences,
    monthlyCleanup,
    handleBulkSkip,
  ],
});
