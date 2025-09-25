import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { dailyInsightsPipeline, helloWorld } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, dailyInsightsPipeline],
});
