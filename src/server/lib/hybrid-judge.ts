import { generateObject } from "ai";
import { z } from "zod";
import { openrouter } from "@/ai/models";
import type { JudgeResult } from "./hybrid-types";

const judgementSchema = z.object({
  frameworkClarity: z.number().min(0).max(100),
  insightNovelty: z.number().min(0).max(100),
  tacticalSpecificity: z.number().min(0).max(100),
  reasoningDepth: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

// Grok-4-fast: Better consistency (±5% variance) vs Kimi-k2 (±30% variance)
// Scores quantified insights correctly (60-70% vs Kimi's 0-85% random range)
const model = openrouter("x-ai/grok-4-fast");

const HYBRID_PROMPT = `You are evaluating podcast transcript chunks for Usman, who has read 400+ entrepreneur biographies.

WHAT HE SAVES (with examples from his actual saves):
1. Named frameworks with specific labels
   - "We call this hyperfluency" - gives it a name he can reuse
   - "Idea maze" - specific conceptual framework
   - "Sea of sameness" - vivid, actionable concept

2. Counter-intuitive insights that flip conventional wisdom (NOT startup canon)
   - "Ego makes entrepreneurs overcomplicate products" (not obvious)
   - "Simplification is the biggest hack in entrepreneurship" (flips common belief)
   - Must be genuinely surprising, not "experts bad, iteration good" type clichés

3. **Quantified business insights with outcomes** (specific numbers/results)
   - "People pay 20% premium for Delta brand vs industry" (concrete outcome, not platitude)
   - "Reduced cancellations from 6,000 to 60 over 10 years" (specific transformation)
   - NOT generic "we improved quality" - must have NUMBERS and TIMEFRAME

4. Specific tactics with deep reasoning
   - "Walk the aisles, look for sea of sameness, spot culture shifts" (concrete + conceptual)
   - "Start with qualitative hypothesis, then confirm with quantitative" (specific process)

5. Assessment criteria for judgment
   - "Look for insatiable curiosity + drive + heart of gold" (specific character traits)
   - "Founders don't accommodate - they see problems and fix them" (behavioral pattern)

6. **Memorable articulations that crystallize fuzzy concepts**
   - "Founder is guardian of company's soul" (makes abstract concrete)
   - "Can't get to the end of their curiosity - infinite cup" (vivid metaphor)
   - Language that turns intuition into explicit knowledge

WHAT HE SKIPS (even if topically relevant):
1. **Entrepreneurship canon** - generic advice EVERYONE knows (NOT specific outcomes):
   - Henry Ford quotes: "experts vs iteration" (advice, not outcome)
   - Carnegie steel stories (historical anecdote without novel pattern)
   - Generic platitudes: "iterate quickly", "focus on customers", "hire great people"
   - Startup tropes: "fail fast", "product-market fit", "10x thinking"
   - ⚠️ DON'T conflate with SPECIFIC QUANTIFIED OUTCOMES (e.g., "achieved 20% premium" ≠ canon)

2. Generic observations without specificity
   - "Incentives aren't always financial" (too obvious)
   - "People have different motivations" (surface-level)
   - "Relationships matter" (everyone knows this)
   - "Brand loyalty matters" (platitude without HOW or specifics)

3. Biographical details without lessons
   - Career trajectories and personal journeys
   - "You've had interesting experiences" type content
   - Unless it reveals a generalizable pattern

4. Academic density without practical frameworks
   - Dense philosophical references without actionable takeaways
   - Continental philosophy name-dropping without synthesis

5. Meta-defensive rambling
   - "You don't need to know this"
   - "I'm being reductionist but..."
   - Excessive caveats and disclaimers

6. Lists without synthesis
   - "Here are the problems: A, B, C..." without deeper pattern
   - Enumeration without insight

SCORING GUIDANCE:
- Entrepreneurship canon / generic platitudes: 20-40
- Generic observations (obvious, no specifics): 30-45
- Topically relevant but shallow (no framework/data): 45-55
- Useful pattern or quantified insight: 55-70 (SAVE THRESHOLD: 60)
- Multiple frameworks + deep reasoning: 70-85
- Groundbreaking: 85+

CRITICAL: Score 60+ if content includes:
✓ Named framework with explanation ("we call this X"), OR
✓ Counter-intuitive insight NOT in startup canon (genuinely surprising), OR
✓ **Quantified business outcome with numbers** ("20% premium", "6000→60 cancellations"), OR
✓ Specific tactic with deep "why" (not just "what"), OR
✓ Clear assessment criteria (how to judge X), OR
✓ Memorable articulation that crystallizes fuzzy concept (powerful metaphor)

Red flags for LOW score (20-45):
✗ Well-known entrepreneur quotes (Ford, Carnegie, Bezos, etc.)
✗ "Invest in technology" / "iterate quickly" / "experts bad" tropes
✗ Biographical details without generalizable lessons
✗ "Incentives matter" / "relationships matter" obvious observations
✗ Meta-commentary ("I'm simplifying but...")
✗ Lists without synthesis or deeper pattern

ASK YOURSELF:
- "Would Paul Graham roll his eyes at this, or find it interesting?"
- "Is this in every Y Combinator essay / startup book?"
- "Does this articulate something hard to put into words?"
- "Is this genuinely novel, or have I heard it 50 times?"
- **"Does this have SPECIFIC NUMBERS or OUTCOMES, not just generic advice?"**

When in doubt: Default to 40-45. Bar is HIGH for well-read founders.

IMPORTANT DISTINCTION:
- "Build a strong brand" = CANON (generic advice) → 20-40
- "Achieved 20% price premium through brand over 30 years" = QUANTIFIED INSIGHT → 60-70

Score each dimension 0-100, then provide overall score.`;

export async function judgeHybrid(content: string): Promise<JudgeResult> {
  try {
    const result = await generateObject({
      model,
      schema: judgementSchema,
      prompt: `${HYBRID_PROMPT}\nCHUNK:\n${content}`,
      temperature: 0, // Deterministic scoring - reduce variance
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
