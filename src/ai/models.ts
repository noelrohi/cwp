import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const baseten = createOpenAICompatible({
  name: "baseten",
  apiKey: process.env.BASETEN_API_KEY,
  baseURL: "https://inference.baseten.co/v1",
  includeUsage: true, // Include usage information in streaming responses
});
