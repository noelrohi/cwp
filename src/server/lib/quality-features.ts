/**
 * Extract quality features from a chunk that correlate with user saves
 * These are NOT topic-based, but style/quality-based
 */

export interface QualityFeatures {
  // Length signals
  wordCount: number;
  charCount: number;
  avgWordLength: number;

  // Style markers
  hasQuotes: boolean; // Contains " or '
  hasNumbers: boolean;
  hasEmphasis: boolean; // ALL CAPS words, italics markers

  // Structure
  sentenceCount: number;
  avgSentenceLength: number;

  // Linguistic patterns
  hasFirstPerson: boolean; // "I", "we", "my"
  hasSecondPerson: boolean; // "you", "your"
  hasImperative: boolean; // Starts with action verb

  // Quality proxies
  uniqueWordRatio: number; // unique words / total words
  punctuationDensity: number;

  // Insight markers (heuristic)
  hasPrinciple: boolean; // "always", "never", "must", "should"
  hasContrast: boolean; // "but", "however", "instead"
  hasMetaphor: boolean; // "like", "as if", "imagine"
}

export function extractQualityFeatures(text: string): QualityFeatures {
  const words = text.toLowerCase().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const uniqueWords = new Set(words);

  return {
    wordCount: words.length,
    charCount: text.length,
    avgWordLength: text.length / words.length,

    hasQuotes: /["']/.test(text),
    hasNumbers: /\d/.test(text),
    hasEmphasis: /[A-Z]{3,}/.test(text) || /\*\w+\*/.test(text),

    sentenceCount: sentences.length,
    avgSentenceLength: words.length / Math.max(sentences.length, 1),

    hasFirstPerson: /\b(i|we|my|our)\b/i.test(text),
    hasSecondPerson: /\b(you|your)\b/i.test(text),
    hasImperative: /^(don't|do|never|always|stop|start|be|get|make|find)/i.test(
      text.trim(),
    ),

    uniqueWordRatio: uniqueWords.size / words.length,
    punctuationDensity: (text.match(/[,;:.!?-]/g) || []).length / words.length,

    hasPrinciple: /\b(always|never|must|should|can't|don't|won't)\b/i.test(
      text,
    ),
    hasContrast: /\b(but|however|instead|rather|yet|although|though)\b/i.test(
      text,
    ),
    hasMetaphor: /\b(like|as if|imagine|think of|similar to)\b/i.test(text),
  };
}

/**
 * Learn which features correlate with user saves
 */
export function learnQualityPreferences(
  savedFeatures: QualityFeatures[],
  randomFeatures: QualityFeatures[],
): Record<keyof QualityFeatures, number> {
  const weights: Record<string, number> = {};

  // For each feature, compute how much more common it is in saved vs random
  const featureKeys = Object.keys(
    savedFeatures[0],
  ) as (keyof QualityFeatures)[];

  for (const key of featureKeys) {
    if (typeof savedFeatures[0][key] === "boolean") {
      // For boolean features, compute percentage difference
      const savedRate =
        savedFeatures.filter((f) => f[key]).length / savedFeatures.length;
      const randomRate =
        randomFeatures.filter((f) => f[key]).length / randomFeatures.length;
      weights[key] = savedRate - randomRate; // -1 to +1
    } else {
      // For numeric features, compute normalized difference
      const savedAvg =
        savedFeatures.reduce((sum, f) => sum + Number(f[key]), 0) /
        savedFeatures.length;
      const randomAvg =
        randomFeatures.reduce((sum, f) => sum + Number(f[key]), 0) /
        randomFeatures.length;
      const diff = savedAvg - randomAvg;
      weights[key] = diff / Math.max(savedAvg, randomAvg, 1); // normalized
    }
  }

  return weights as Record<keyof QualityFeatures, number>;
}

/**
 * Score a chunk based on learned quality preferences
 * Returns a score from 0 to 1
 */
export function scoreQuality(
  features: QualityFeatures,
  preferences: Record<keyof QualityFeatures, number>,
): number {
  let score = 0;
  let totalFeatures = 0;

  for (const [key, prefWeight] of Object.entries(preferences)) {
    const featureValue = features[key as keyof QualityFeatures];

    if (typeof featureValue === "boolean") {
      // Boolean features: add weight if present
      if (featureValue && prefWeight > 0) {
        score += prefWeight;
      } else if (!featureValue && prefWeight < 0) {
        // Absence of negatively-weighted feature is good
        score += Math.abs(prefWeight);
      }
      totalFeatures++;
    } else {
      // Numeric features: scale based on typical ranges
      let normalized = 0;
      if (key === "wordCount") {
        normalized = Math.min(1, Number(featureValue) / 300); // 300 words = max
      } else if (key === "charCount") {
        normalized = Math.min(1, Number(featureValue) / 2000); // 2000 chars = max
      } else if (key === "sentenceCount") {
        normalized = Math.min(1, Number(featureValue) / 15); // 15 sentences = max
      } else if (key === "avgWordLength" || key === "avgSentenceLength") {
        normalized = Math.min(1, Number(featureValue) / 20); // rough normalization
      } else {
        normalized = Math.min(1, Number(featureValue)); // already normalized
      }

      if (prefWeight > 0) {
        score += normalized * prefWeight;
      } else {
        // For negative preferences, invert the score
        score += (1 - normalized) * Math.abs(prefWeight);
      }
      totalFeatures++;
    }
  }

  // Average score across all features, then normalize to 0-1
  const avgScore = totalFeatures > 0 ? score / totalFeatures : 0.5;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, avgScore));
}
