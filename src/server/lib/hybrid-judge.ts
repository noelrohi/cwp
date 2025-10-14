import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import type { JudgeResult } from "./hybrid-types";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const judgementSchema = z.object({
  frameworkClarity: z.number().min(0).max(100),
  insightNovelty: z.number().min(0).max(100),
  tacticalSpecificity: z.number().min(0).max(100),
  reasoningDepth: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

const HYBRID_PROMPT = `You are evaluating podcast transcript chunks for Usman, an investor/founder.

WHAT HE SAVES (with examples from his actual saves):
1. Named frameworks with specific labels
   - "We call this hyperfluency" - gives it a name he can reuse
   - "Idea maze" - specific conceptual framework
   - "Sea of sameness" - vivid, actionable concept

2. Counter-intuitive insights that flip conventional wisdom
   - "Ego makes entrepreneurs overcomplicate products" (not obvious)
   - "Philosophers are epiphenomenal - they capture vs cause culture" (flips causality)

3. Specific tactics with deep reasoning
   - "Walk the aisles, look for sea of sameness, spot culture shifts" (concrete + conceptual)
   - "Start with qualitative hypothesis, then confirm with quantitative" (specific process)

4. Assessment criteria for judgment
   - "Look for insatiable curiosity + drive + heart of gold" (specific character traits)
   - "Founders don't accommodate - they see problems and fix them" (behavioral pattern)

WHAT HE SKIPS (even if topically relevant):
1. Generic observations without specificity
   - "Incentives aren't always financial" (too obvious)
   - "People have different motivations" (surface-level)

2. Biographical details without lessons
   - Career trajectories and personal journeys
   - "You've had interesting experiences" type content
   - Unless it reveals a generalizable pattern

3. Academic density without practical frameworks
   - Dense philosophical references without actionable takeaways
   - Continental philosophy name-dropping without synthesis
   - Inscrutable jargon without clarity

4. Meta-defensive rambling
   - "You don't need to know this"
   - "I'm being reductionist but..."
   - Excessive caveats and disclaimers

5. Lists without synthesis
   - "Here are the problems: A, B, C..." without deeper pattern
   - Enumeration without insight

SCORING GUIDANCE (calibrated to Usman's actual behavior):
- Generic/obvious: 10-25 (everyone knows this)
- Topically relevant but shallow: 30-45 (interesting but not actionable)
- Good insight but incomplete: 50-60 (useful but not exceptional)
- SAVE-WORTHY THRESHOLD: 60-75 (must meet criteria below)
- Exceptional: 75-85 (multiple frameworks + deep reasoning)
- Groundbreaking: 85+ (rare - transforms thinking)

CRITICAL: Only score 60+ if content includes:
✓ Named framework with explanation ("we call this X"), OR
✓ Counter-intuitive insight with reasoning (flips conventional wisdom), OR
✓ Specific tactic with deep "why" (not just "what"), OR
✓ Clear assessment criteria (how to judge X)

Red flags that indicate LOW score (20-40):
✗ Biographical details without generalizable lessons
✗ "Incentives matter" type obvious observations
✗ Meta-commentary ("I'm simplifying but...")
✗ Lists without synthesis or deeper pattern
✗ Academic jargon without practical application

When in doubt: Default to 40. Usman's bar is HIGH.

Score each dimension 0-100, then provide overall score.`;

export async function judgeHybrid(content: string): Promise<JudgeResult> {
  try {
    const result = await generateObject({
      model: openrouter("moonshotai/kimi-k2-0905"),
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
      score: object.overallScore, // Use LLM's overall judgment
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
