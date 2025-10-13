# Hybrid Scoring Implementation

**Status:** Ready for implementation  
**Owner:** Intelligence Platform  
**Last updated:** 2025-10-10

---

## Executive Summary
- Three-stage scorer (length filter → heuristics → LLM) lifts eval accuracy to 81% (+31 pp vs embeddings). 
- Recall improves to 75% with 86% precision, matching what Usman saves in practice. 
- Heuristics resolve roughly 55% of chunks for free; GPT-4o-mini judges the 28-52 band only. 
- Marginal cost is ~$0.06 / 1K chunks (~$0.05 per user-month at current volumes).

---

## Current Pain
- Saved vs skipped embeddings are 97% similar; contrastive separation is 0.0465, effectively noise. 
- 55 chunks that scored >60% with embeddings were skipped manually; generic writing keeps slipping through. 
- Users perceive the scores as random because topical similarity ignores insight density and specificity. 
- Manual review volume keeps growing even as model confidence appears high.

---

## Solution Overview
- Stage 1: Fast word-count gate <80 words → auto skip. 
- Stage 2: Deterministic heuristic score (frameworks, insights, specificity, quality). 
- Stage 3: GPT-4o-mini judge for borderline heuristics (28 < score < 52). 
- All stages emit diagnostics so we can observe distribution and tune thresholds.

### Flow Diagram
```
Chunks → length check (<80 → skip)
        ↓
  Heuristic score (0-100)
    ├─ ≥52 → auto save (method=heuristics)
    ├─ ≤28 → auto skip  (method=heuristics)
    └─ else → GPT-4o-mini judge (method=llm)
                   ↓
          Save if overall ≥48
```

---

## Implementation Guide

### 1. Shared Types & Utilities
- Create `src/server/lib/hybrid-types.ts` with exported `HybridScoreResult`, `HybridDiagnostics`, and threshold constants. 
- Add a `ScoringMethod` union (`"length" | "heuristics" | "llm"`) so downstream logging stays type-safe. 
- Update `src/server/lib/index.ts` barrel if we expose the scorer elsewhere.

### 2. Heuristic Scoring Module
- File: `src/server/lib/hybrid-heuristics.ts`. Start by copying `extractImprovedFeatures` from `scripts/tune-hybrid-heuristics.ts`. 
- Keep feature buckets (framework, insight, specificity, quality) and the reason strings for transparency. 
- Export `scoreWithHeuristics(content: string): HeuristicResult` returning normalized scores on 0-100 with `method: "heuristics"`. 
- Guard expensive regex work with early return when `wordCount < 80` to keep perf in check.

```typescript
export function scoreWithHeuristics(content: string): HeuristicResult {
  const sample = extractImprovedFeatures(content);
  const scaled = clamp(sample.overallScore * 100, 0, 100);
  return {
    score: scaled,
    pass: scaled >= HEURISTIC_SAVE_THRESHOLD,
    fail: scaled <= HEURISTIC_SKIP_THRESHOLD,
    buckets: sample,
    method: "heuristics",
  };
}
```

### 3. LLM Judge Module
- File: `src/server/lib/hybrid-judge.ts`. Wrap GPT-4o-mini via `@ai-sdk/openai` (same deps as tuning script). 
- Use Zod schema from the script: the model returns four 0-100 subscores plus reasons. 
- Memoize system prompt in a constant; include user preference highlights (frameworks > insights > specificity). 
- Export `judgeHybrid(content: string): Promise<JudgeResult>` that resolves with `overall`, `reasons`, and token usage for telemetry.

```typescript
export async function judgeHybrid(content: string): Promise<JudgeResult> {
  const result = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: judgementSchema,
    prompt: buildPrompt(content),
  });
  return {
    score: result.object.overallScore,
    buckets: result.object.buckets,
    reasons: result.object.reasons,
    tokens: result.usage,
    method: "llm",
  };
}
```

### 4. Orchestrator Function
- File: `src/server/lib/hybrid-scoring.ts`. Export `hybridScore(content: string): Promise<HybridScoreResult>`. 
- Pipeline: length gate → heuristics → optional LLM; always return `{ score, pass, method, diagnostics }`. 
- Normalize scores to 0-1 for storage but keep 0-100 in diagnostics for readability. 
- Record `borderline: boolean` so we can see how many chunks fall into the 28-52 band.

```typescript
export async function hybridScore(content: string): Promise<HybridScoreResult> {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/).length;
  if (words < LENGTH_SKIP_THRESHOLD) {
    return buildResult(15, false, "length", { wordCount: words });
  }

  const heuristic = scoreWithHeuristics(trimmed);
  if (heuristic.pass || heuristic.fail) {
    return buildResult(heuristic.score, heuristic.pass, "heuristics", {
      wordCount: words,
      ...heuristic.buckets,
    });
  }

  const judged = await judgeHybrid(trimmed);
  const pass = judged.score >= LLM_SAVE_THRESHOLD;
  return buildResult(judged.score, pass, "llm", {
    wordCount: words,
    ...judged.buckets,
    reasons: judged.reasons,
    tokens: judged.tokens,
  });
}
```

### 5. Daily Intelligence Integration
- Update `src/inngest/functions/daily-intelligence-pipeline.ts` to call `hybridScore` when building `scoredChunks`. 
- Persist `diagnostics` JSON: method, score, word count, heuristic bucket scores, and LLM token usage. 
- Preserve existing contrastive score for A/B by storing it as `embeddingScore` during rollout.

### 6. Database & Types
- Add optional columns to `dailySignal`: `embeddingScore`, `hybridDiagnostics`, `scoringMethod`. 
- Extend `ScoredChunk` TypeScript type so downstream UI knows which method decided the score. 
- Run drizzle migration; keep null defaults for backward compatibility.

### 7. API & UI Surface Area
- Update TRPC payload that feeds the UI so saved signals display the new `method`. 
- Add tooltip in the reviewer UI highlighting why a chunk was saved (e.g., top heuristic reasons or LLM rationale). 
- Update analytics dashboards to plot `hybridScore` vs `embeddingScore` during the A/B window.

---

## Observability & QA
- Log method distribution (length / heuristics / llm) per batch; target 0-5% / 55% / 40-45%. 
- Alert if LLM share exceeds 50% or average score variance drops below 20 points. 
- Add smoke test script that replays last 200 labeled chunks and prints confusion matrix vs Usman labels. 
- `pnpm tsc scripts/tune-hybrid-heuristics.ts` before shipping to ensure no regression in the shared logic. 
- Manual QA: sample 20 auto-saves and 20 auto-skips, confirm reasons align with heuristics or LLM output.

---

## Rollout Plan
- Week 1: Ship scorer behind feature flag, log both embedding and hybrid scores, no user-facing change. 
- Week 2: Route Usman's account to hybrid scores for display while continuing to store baseline. 
- Week 3: Review metrics (precision ≥80%, recall ≥70%, cost <10¢ per user-month). 
- Week 4: Remove embedding scorer, keep script for future research.

### Rollback
- Flip feature flag to restore embedding scores instantly. 
- Retain `hybridDiagnostics` data for debugging even if we roll back. 
- Use `scripts/tune-hybrid-heuristics.ts` to iterate on thresholds before retrying.

---

## Cost & Performance
- GPT-4o-mini call: ~$0.000135 per chunk; heuristics run in <5 ms per chunk. 
- With ~900 chunks per user-month, cost lands at $0.05 with current 45% LLM usage. 
- Add simple cache to avoid double-charging when the same chunk is rescored within 10 minutes (e.g., retries).

---

## References
- `scripts/tune-hybrid-heuristics.ts` → source of heuristic and judge logic. 
- `docs/USMAN_PATTERN_ANALYSIS.md` → feature weights derived from saved vs skipped dataset. 
- `usman-analysis.json` → labeled corpus used for offline evaluation.

