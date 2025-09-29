import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  dailyIntelligenceGenerateSignals,
  dailyIntelligencePipeline,
  dailyIntelligenceProcessEpisode,
  dailyIntelligenceProcessUser,
  feedParserPipeline,
  helloWorld,
  monthlyCleanup,
  updateUserPreferences,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    feedParserPipeline,
    dailyIntelligencePipeline,
    dailyIntelligenceProcessUser,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceGenerateSignals,
    updateUserPreferences,
    monthlyCleanup,
  ],
});
