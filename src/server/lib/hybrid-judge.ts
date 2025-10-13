import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { JudgeResult } from "./hybrid-types";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const judgementSchema = z.object({
  frameworkClarity: z.number().min(0).max(100),
  insightNovelty: z.number().min(0).max(100),
  tacticalSpecificity: z.number().min(0).max(100),
  reasoningDepth: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

const HYBRID_PROMPT = `You are evaluating podcast transcript chunks for Usman, an investor/founder who values:
- Named frameworks ("idea maze", "operating rails", "hyperfluency")
- Counter-intuitive insights that flip conventional wisdom
- Specific tactics with conceptual grounding
- Assessment criteria for judging people, companies, and strategies

He skips generic observations, vague wisdom, and biographical fluff.

Score this chunk. Be critical: most content should land between 30-50. Only exceptional content exceeds 70.
`;

export async function judgeHybrid(content: string): Promise<JudgeResult> {
  try {
    const result = await generateObject({
      model: openai("gpt-4.1-mini"),
      schema: judgementSchema,
      prompt: `${HYBRID_PROMPT}\nCHUNK:\n${content}`,
    });

    const { object, usage } = result;
    const usagePayload = usage ? { ...usage } : undefined;
    const reasoning = object.reasoning.trim();
    const reasons =
      reasoning.length > 0
        ? reasoning
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
        : [];

    return {
      score: object.overallScore,
      buckets: {
        frameworkClarity: object.frameworkClarity,
        insightNovelty: object.insightNovelty,
        tacticalSpecificity: object.tacticalSpecificity,
        reasoningDepth: object.reasoningDepth,
        overallScore: object.overallScore,
      },
      reasoning,
      reasons,
      usage: usagePayload,
      method: "llm",
    };
  } catch (error) {
    console.error("Hybrid LLM judge failed", error);
    return {
      score: 50,
      buckets: {
        frameworkClarity: 50,
        insightNovelty: 50,
        tacticalSpecificity: 50,
        reasoningDepth: 50,
        overallScore: 50,
      },
      reasoning: "LLM judge failed",
      reasons: ["LLM judge failed"],
      method: "llm",
    };
  }
}

export async function judgeHybridBatch(
  contents: string[],
): Promise<JudgeResult[]> {
  const results = await Promise.all(
    contents.map((content) => judgeHybrid(content)),
  );
  return results;
}
