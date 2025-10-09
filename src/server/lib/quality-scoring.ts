/**
 * Quality-based scoring using snips (flashcards) as the gold standard
 *
 * Key insight: Users create flashcards from content they find SO valuable
 * they want to memorize it. This is the ultimate quality signal.
 *
 * Quality learning:
 * - HIGH QUALITY = snips (flashcards) - what users found memorable
 * - LOW QUALITY = random chunks - baseline
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  flashcard,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import {
  extractQualityFeatures,
  learnQualityPreferences,
  type QualityFeatures,
  scoreQuality,
} from "./quality-features";

export type QualityProfile = {
  preferences: Record<keyof QualityFeatures, number>;
  snipCount: number;
  savedCount: number;
};

/**
 * Learn what quality of content a user prefers by analyzing their snips (flashcards)
 * vs random baseline, with weighted ensemble from saves
 *
 * Learning strategy:
 * - Snips (weight 1.0): "This is SO good I'm memorizing it" - GOLD STANDARD
 * - Saves (weight 0.4): "This is above average" - SECONDARY SIGNAL
 * - This prevents overfitting to small snip samples while prioritizing them
 */
export async function learnUserQualityProfile(
  userId: string,
): Promise<QualityProfile | null> {
  // Get snips (flashcards) - the GOLD STANDARD of quality
  const snips = await db
    .select({
      content: transcriptChunk.content,
    })
    .from(flashcard)
    .innerJoin(dailySignal, eq(flashcard.signalId, dailySignal.id))
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(flashcard.userId, userId),
        sql`${transcriptChunk.content} IS NOT NULL`,
      ),
    )
    .orderBy(desc(flashcard.createdAt))
    .limit(100);

  // Get saved chunks - secondary signal
  const saved = await db
    .select({
      content: transcriptChunk.content,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.content} IS NOT NULL`,
      ),
    )
    .limit(100);

  // COLD START: Need at least some positive examples
  if (snips.length === 0 && saved.length < 10) {
    return null; // Not enough data to learn quality patterns
  }

  // FALLBACK: If no snips, use saves only (weaker signal)
  if (snips.length === 0) {
    const savedFeatures = saved
      .filter((s) => s.content)
      .map((s) => extractQualityFeatures(s.content!));

    const randomChunks = await db
      .select({
        content: transcriptChunk.content,
      })
      .from(transcriptChunk)
      .where(sql`${transcriptChunk.content} IS NOT NULL`)
      .orderBy(sql`RANDOM()`)
      .limit(100);

    const randomFeatures = randomChunks
      .filter((r) => r.content)
      .map((r) => extractQualityFeatures(r.content!));

    const preferences = learnQualityPreferences(savedFeatures, randomFeatures);

    return {
      preferences,
      snipCount: 0,
      savedCount: saved.length,
    };
  }

  // WEIGHTED ENSEMBLE: Combine snips (primary) + saves (secondary)
  // This prevents overfitting when snip count is low (< 10)
  const snipFeatures = snips
    .filter((s) => s.content)
    .map((s) => extractQualityFeatures(s.content!));

  const savedFeatures = saved
    .filter((s) => s.content)
    .map((s) => extractQualityFeatures(s.content!));

  // Get random baseline
  const randomChunks = await db
    .select({
      content: transcriptChunk.content,
    })
    .from(transcriptChunk)
    .where(sql`${transcriptChunk.content} IS NOT NULL`)
    .orderBy(sql`RANDOM()`)
    .limit(100);

  const randomFeatures = randomChunks
    .filter((r) => r.content)
    .map((r) => extractQualityFeatures(r.content!));

  // Learn preferences from each source
  const snipPreferences = learnQualityPreferences(snipFeatures, randomFeatures);

  // Determine weighting based on snip count
  // Few snips (1-5): Blend heavily with saves to prevent overfitting
  // Many snips (10+): Trust snips more, use saves as minor augmentation
  const snipWeight = 1.0;
  let saveWeight = 0.0;

  if (snips.length < 10 && saved.length > 0) {
    // Not enough snips to learn robust patterns - blend with saves
    // Snip count 1-5: saveWeight 0.4-0.2 (decreasing as snips increase)
    // Snip count 6-9: saveWeight 0.2-0.1
    // Snip count 10+: saveWeight 0.1 (minor augmentation)
    if (snips.length <= 5) {
      saveWeight = 0.5 - snips.length * 0.06; // 0.44 → 0.2
    } else {
      saveWeight = 0.2 - (snips.length - 5) * 0.02; // 0.2 → 0.1
    }
  } else if (snips.length >= 10 && saved.length > 0) {
    // Enough snips, but use saves as minor augmentation
    saveWeight = 0.1;
  }

  // Blend preferences if using saves
  let finalPreferences = snipPreferences;

  if (saveWeight > 0 && saved.length > 0) {
    const savePreferences = learnQualityPreferences(
      savedFeatures,
      randomFeatures,
    );

    // Weighted average of preferences
    finalPreferences = {} as Record<keyof QualityFeatures, number>;
    for (const key of Object.keys(snipPreferences) as Array<
      keyof QualityFeatures
    >) {
      finalPreferences[key] =
        snipPreferences[key] * snipWeight + savePreferences[key] * saveWeight;
    }

    console.log(
      `Quality learning: Blending ${snips.length} snips (weight ${snipWeight.toFixed(2)}) + ${saved.length} saves (weight ${saveWeight.toFixed(2)})`,
    );
  }

  return {
    preferences: finalPreferences,
    snipCount: snips.length,
    savedCount: saved.length,
  };
}

/**
 * Score a chunk's quality based on learned user preferences
 */
export function scoreChunkQuality(
  content: string,
  profile: QualityProfile | null,
): number {
  if (!profile) {
    return 0.5; // No preferences learned, neutral score
  }

  const features = extractQualityFeatures(content);
  return scoreQuality(features, profile.preferences);
}

/**
 * Apply multiplicative quality boost to semantic score
 *
 * This creates better differentiation:
 * - High semantic + High quality = 90-100% (exceptional!)
 * - High semantic + Low quality = 20-40% (crushed)
 * - Medium semantic + Medium quality = 50-70% (average)
 *
 * @param semanticScore - Base cosine similarity score (0-1)
 * @param qualityScore - Quality score from user preferences (0-1)
 * @returns Final boosted score (0-1)
 */
export function applyQualityBoost(
  semanticScore: number,
  qualityScore: number | null,
): number {
  if (qualityScore === null) {
    return semanticScore; // No quality data, use semantic only
  }

  // Convert quality to boost multiplier with more aggressive scaling
  // Quality 0.0 → boost = 0.2 (heavily penalize)
  // Quality 0.3 → boost = 1.0 (neutral, typical for saved content)
  // Quality 0.5 → boost = 1.5 (good boost)
  // Quality 1.0 → boost = 3.0 (triple the score!)

  // Linear mapping: 0.0-0.3 → 0.2-1.0, 0.3-1.0 → 1.0-3.0
  let qualityBoost: number;
  if (qualityScore < 0.3) {
    // Below average quality: penalize
    qualityBoost = 0.2 + (qualityScore / 0.3) * 0.8; // Maps 0-0.3 to 0.2-1.0
  } else {
    // Above average quality: boost!
    qualityBoost = 1.0 + ((qualityScore - 0.3) / 0.7) * 2.0; // Maps 0.3-1.0 to 1.0-3.0
  }

  // Apply multiplicative boost
  const boostedScore = semanticScore * qualityBoost;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, boostedScore));
}

/**
 * Hybrid scoring: semantic similarity + quality boost
 *
 * @param semanticScore - Cosine similarity to user's centroids (0-1)
 * @param content - The chunk content to score for quality
 * @param profile - User's learned quality profile
 * @returns Final hybrid score (0-1)
 */
export function computeHybridScore(
  semanticScore: number,
  content: string,
  profile: QualityProfile | null,
): number {
  if (!profile) {
    return semanticScore; // No quality data, semantic only
  }

  const qualityScore = scoreChunkQuality(content, profile);
  return applyQualityBoost(semanticScore, qualityScore);
}
