import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  dailyIntelligencePipeline,
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
    updateUserPreferences,
    weeklyPreferencesOptimization,
    monthlyCleanup,
  ],
});
