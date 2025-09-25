import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  dailyIntelligenceGenerateSignals,
  dailyIntelligencePipeline,
  dailyIntelligenceProcessEpisode,
  dailyIntelligenceProcessUser,
  helloWorld,
  monthlyCleanup,
  updateUserPreferences,
  weeklyPreferencesOptimization,
} from "@/inngest/functions/index";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    dailyIntelligencePipeline,
    dailyIntelligenceProcessUser,
    dailyIntelligenceProcessEpisode,
    dailyIntelligenceGenerateSignals,
    updateUserPreferences,
    weeklyPreferencesOptimization,
    monthlyCleanup,
  ],
});
