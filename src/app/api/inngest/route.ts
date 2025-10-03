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
  updateUserPreferences,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    feedParserPipeline,
    dailyIntelligencePipeline,
    dailyIntelligenceProcessUser,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceReprocessEpisode,
    dailyIntelligenceGenerateSignals,
    updateUserPreferences,
    monthlyCleanup,
    handleBulkSkip,
  ],
});
