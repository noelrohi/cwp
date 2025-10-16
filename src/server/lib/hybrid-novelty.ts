import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { dailySignal, transcriptChunk } from "../db/schema/podcast";

/**
 * Compute cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

export interface NoveltyResult {
  noveltyScore: number; // 0.0-1.0 (1.0 = highly novel, 0.0 = highly redundant)
  avgSimilarity: number; // Average similarity to top-k saves
  maxSimilarity: number; // Highest similarity found
  clusterSize: number; // How many saves were checked
  adjustment: number; // Score adjustment to apply (-20 to 0)
}

/**
 * Compute novelty score by checking semantic similarity to user's past saves
 *
 * Algorithm:
 * 1. Get user's recent saved signals (up to 100)
 * 2. Find top-k most similar signals
 * 3. Compute average similarity to those top-k
 * 4. High avg similarity = content clusters with existing saves = not novel
 * 5. Low avg similarity = content is in new territory = novel
 *
 * This detects:
 * - Personal redundancy (user has saved similar content before)
 * - Canonical advice (appears frequently in saved content across sources)
 */
export async function computeNoveltyScore(
  signalEmbedding: number[],
  userId: string,
  options: {
    topK?: number; // How many nearest neighbors to check (default: 10)
    lookbackLimit?: number; // How many recent saves to search (default: 100)
  } = {},
): Promise<NoveltyResult> {
  const topK = options.topK ?? 10;
  const lookbackLimit = options.lookbackLimit ?? 100;

  // Get user's past saved signals with embeddings
  const pastSaves = await db
    .select({
      chunkId: dailySignal.chunkId,
      embedding: transcriptChunk.embedding,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .where(eq(dailySignal.userId, userId))
    .orderBy(desc(dailySignal.createdAt))
    .limit(lookbackLimit);

  // Filter out signals without embeddings and parse vectors
  const embeddings: number[][] = [];
  for (const save of pastSaves) {
    if (save.embedding && Array.isArray(save.embedding)) {
      embeddings.push(save.embedding);
    }
  }

  // Cold start: not enough data to judge novelty
  if (embeddings.length < topK) {
    return {
      noveltyScore: 1.0, // Assume novel (benefit of the doubt)
      avgSimilarity: 0,
      maxSimilarity: 0,
      clusterSize: embeddings.length,
      adjustment: 0, // No penalty during cold start
    };
  }

  // Compute similarities to all past saves
  const similarities = embeddings.map((emb) =>
    cosineSimilarity(signalEmbedding, emb),
  );

  // Get top-k most similar
  const sortedSimilarities = [...similarities].sort((a, b) => b - a);
  const topKSimilarities = sortedSimilarities.slice(0, topK);

  const avgSimilarity =
    topKSimilarities.reduce((sum, sim) => sum + sim, 0) / topK;
  const maxSimilarity = topKSimilarities[0];

  // Novelty is inverse of clustering
  // High avg similarity = highly clustered = not novel
  const noveltyScore = 1.0 - avgSimilarity;

  // Compute score adjustment based on novelty
  let adjustment = 0;

  if (avgSimilarity > 0.75) {
    // Highly clustered (very similar to many past saves)
    // Strong penalty: entrepreneurship canon or personal redundancy
    adjustment = -20;
  } else if (avgSimilarity > 0.65) {
    // Moderately clustered
    adjustment = -15;
  } else if (avgSimilarity > 0.55) {
    // Somewhat clustered
    adjustment = -10;
  }
  // avgSimilarity <= 0.55: Novel territory, no penalty

  return {
    noveltyScore,
    avgSimilarity,
    maxSimilarity,
    clusterSize: embeddings.length,
    adjustment,
  };
}

/**
 * Check if signal is a duplicate of something user already saved
 */
export async function isDuplicate(
  signalEmbedding: number[],
  userId: string,
  threshold = 0.9,
): Promise<boolean> {
  const novelty = await computeNoveltyScore(signalEmbedding, userId, {
    topK: 5,
    lookbackLimit: 50,
  });

  return novelty.maxSimilarity >= threshold;
}
