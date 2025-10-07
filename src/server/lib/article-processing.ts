import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embedding";
import type { db as dbInstance } from "@/server/db";
import {
  article as articleSchema,
  dailySignal,
  savedChunk,
  transcriptChunk,
  userPreferences,
} from "@/server/db/schema";

export type DatabaseClient = typeof dbInstance;

export interface ArticleExtractionResult {
  title: string;
  content: string;
  author?: string;
  publishedAt?: Date;
  siteName?: string;
  excerpt?: string;
}

export interface ArticleProcessingResult {
  articleId: string;
  chunkCount: number;
  signalCount: number;
}

/**
 * Extract article content using Jina AI Reader
 * Returns markdown with metadata headers
 */
export async function extractArticleContent(
  url: string,
): Promise<ArticleExtractionResult> {
  const jinaUrl = `https://r.jina.ai/${url}`;

  // Request markdown format - simpler and more reliable
  // No special headers needed - Jina's public endpoint is free
  const response = await fetch(jinaUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to extract article content: ${response.statusText}`,
    );
  }

  const text = await response.text();

  // Jina returns text with metadata headers:
  // Title: ...
  // URL Source: ...
  // Published Time: ...
  // Markdown Content:
  // [actual content]

  // Parse metadata from headers
  const lines = text.split("\n");
  let title = "Untitled Article";
  let publishedAt: Date | undefined;
  let contentStartIndex = 0;

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];

    if (line.startsWith("Title: ")) {
      title = line.substring(7).trim();
    } else if (line.startsWith("Published Time: ")) {
      const timeStr = line.substring(16).trim();
      const parsed = new Date(timeStr);
      publishedAt = Number.isNaN(parsed.getTime()) ? undefined : parsed;
    } else if (line.startsWith("Markdown Content:")) {
      contentStartIndex = i + 1;
      break;
    }
  }

  // Extract content (everything after "Markdown Content:")
  const content = lines.slice(contentStartIndex).join("\n").trim();

  if (!content || content.length < 100) {
    throw new Error("Article content too short or empty");
  }

  return {
    title,
    content,
    author: undefined, // Not in markdown headers
    publishedAt,
    siteName: undefined, // Not in markdown headers
    excerpt: content.slice(0, 200), // First 200 chars as excerpt
  };
}

interface ChunkArticleParams {
  db: DatabaseClient;
  articleId: string;
  content: string;
  minTokens?: number;
  maxTokens?: number;
}

/**
 * Chunk article content into smaller pieces for embedding
 * Simpler than podcast chunking - no speakers, no timestamps
 */
export async function chunkArticleContent({
  db,
  articleId,
  content,
  minTokens = 150,
  maxTokens = 400,
}: ChunkArticleParams): Promise<{ chunkCount: number }> {
  // Simple paragraph-based chunking for articles
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());

  if (paragraphs.length === 0) {
    return { chunkCount: 0 };
  }

  const chunks: { content: string; wordCount: number }[] = [];
  let currentChunk = "";
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);
    const wordCount = words.length;

    // If adding this paragraph would exceed maxTokens, save current chunk
    if (
      currentWordCount > 0 &&
      currentWordCount + wordCount > maxTokens * 1.1
    ) {
      if (currentWordCount >= minTokens) {
        chunks.push({
          content: currentChunk.trim(),
          wordCount: currentWordCount,
        });
      }
      currentChunk = "";
      currentWordCount = 0;
    }

    currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    currentWordCount += wordCount;

    // If we've reached a good size and paragraph is a natural break
    if (currentWordCount >= minTokens) {
      chunks.push({
        content: currentChunk.trim(),
        wordCount: currentWordCount,
      });
      currentChunk = "";
      currentWordCount = 0;
    }
  }

  // Don't forget the last chunk
  if (currentWordCount >= minTokens || chunks.length === 0) {
    chunks.push({
      content: currentChunk.trim(),
      wordCount: currentWordCount,
    });
  }

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // Generate embeddings in batches
  console.log(`Generating embeddings for ${chunks.length} article chunks`);
  const BATCH_SIZE = 10;
  const embeddings: (number[] | null)[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await Promise.all(
      batch.map((chunk) =>
        generateEmbedding(chunk.content).catch((error) => {
          console.error("Failed to generate embedding:", error);
          return null;
        }),
      ),
    );
    embeddings.push(...batchEmbeddings);

    // Rate limiting
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Insert chunks into database
  const chunksToInsert = chunks.map((chunk, index) => ({
    id: `chunk_article_${articleId}_${index}`,
    articleId,
    episodeId: null,
    speaker: null,
    content: chunk.content,
    startTimeSec: null,
    endTimeSec: null,
    wordCount: chunk.wordCount,
    embedding: embeddings[index],
  }));

  await db.insert(transcriptChunk).values(chunksToInsert);

  console.log(
    `Created ${chunks.length} chunks for article ${articleId}, avg words: ${Math.round(chunks.reduce((sum, c) => sum + c.wordCount, 0) / chunks.length)}`,
  );

  return { chunkCount: chunks.length };
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate centroid of multiple embeddings
 */
function calculateCentroid(embeddings: number[][]): number[] {
  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  // Average
  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * Generate signals for article chunks using same logic as podcasts
 */
async function generateArticleSignals({
  db,
  articleId,
  userId,
  maxSignals = 30,
}: {
  db: DatabaseClient;
  articleId: string;
  userId: string;
  maxSignals?: number;
}): Promise<{ signalCount: number }> {
  // Get user preferences
  let preferences = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  // Create preferences if doesn't exist
  if (!preferences) {
    const prefId = randomUUID();
    await db.insert(userPreferences).values({
      id: prefId,
      userId,
    });
    preferences = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    });
  }

  if (!preferences) {
    throw new Error("Failed to create user preferences");
  }

  // Get article chunks with embeddings
  const chunks = await db.query.transcriptChunk.findMany({
    where: and(
      eq(transcriptChunk.articleId, articleId),
      sql`${transcriptChunk.embedding} IS NOT NULL`,
    ),
  });

  if (chunks.length === 0) {
    return { signalCount: 0 };
  }

  // Score chunks based on user preferences
  const scoredChunks = await scoreChunksForArticle(
    db,
    chunks,
    preferences,
    userId,
  );

  // Stratified sampling - take top chunks across score distribution
  const signalsToCreate = Math.min(maxSignals, chunks.length);
  const selectedChunks = stratifiedSample(scoredChunks, signalsToCreate);

  // Create signals
  const signalRecords = selectedChunks.map((chunk) => ({
    id: randomUUID(),
    chunkId: chunk.id,
    userId,
    signalDate: new Date(),
    relevanceScore: chunk.relevanceScore,
    title: null,
    summary: null,
    excerpt: null,
    speakerName: null,
    userAction: null,
    presentedAt: null,
    actionedAt: null,
  }));

  if (signalRecords.length > 0) {
    await db.insert(dailySignal).values(signalRecords);
  }

  console.log(
    `Created ${signalRecords.length} signals for article ${articleId}`,
  );

  return { signalCount: signalRecords.length };
}

/**
 * Score article chunks - simplified version of podcast scoring
 */
async function scoreChunksForArticle(
  db: DatabaseClient,
  chunks: Array<{ id: string; embedding: number[] | null }>,
  preferences: { totalSaved: number; userId: string },
  userId: string,
): Promise<Array<{ id: string; relevanceScore: number }>> {
  // PHASE 1: Random scoring until we have 10 saves
  if (preferences.totalSaved < 10) {
    return chunks.map((chunk) => ({
      id: chunk.id,
      relevanceScore: Math.random(),
    }));
  }

  // PHASE 2: Embedding-based similarity
  const savedChunks = await db
    .select({
      embedding: transcriptChunk.embedding,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .where(
      and(
        eq(savedChunk.userId, userId),
        sql`${transcriptChunk.embedding} IS NOT NULL`,
      ),
    );

  if (savedChunks.length === 0) {
    return chunks.map((chunk) => ({
      id: chunk.id,
      relevanceScore: Math.random(),
    }));
  }

  // Calculate saved centroid
  const savedCentroid = calculateCentroid(
    savedChunks.map((c) => c.embedding as number[]),
  );

  // Score each chunk by similarity to saved centroid
  return chunks.map((chunk) => {
    if (!chunk.embedding) {
      return { id: chunk.id, relevanceScore: 0.3 };
    }

    const similarity = cosineSimilarity(chunk.embedding, savedCentroid);
    const relevanceScore = Math.max(0, Math.min(1, similarity));

    return {
      id: chunk.id,
      relevanceScore,
    };
  });
}

/**
 * Stratified sampling - take top chunks across score distribution
 */
function stratifiedSample<T extends { relevanceScore: number }>(
  chunks: T[],
  count: number,
): T[] {
  // Sort by score descending
  const sorted = [...chunks].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  // Take top N
  return sorted.slice(0, count);
}

interface ProcessArticleParams {
  db: DatabaseClient;
  userId: string;
  url: string;
}

/**
 * Complete article processing pipeline:
 * 1. Extract content via Jina AI
 * 2. Create article record
 * 3. Chunk content
 * 4. Generate embeddings
 */
export async function processArticle({
  db,
  userId,
  url,
}: ProcessArticleParams): Promise<ArticleProcessingResult> {
  // Check if article already exists for this user
  const existing = await db.query.article.findFirst({
    where: (article, { and, eq }) =>
      and(eq(article.userId, userId), eq(article.url, url)),
  });

  if (existing) {
    throw new Error("Article already processed");
  }

  // Extract content
  const extracted = await extractArticleContent(url);

  if (!extracted.content || extracted.content.trim().length < 100) {
    throw new Error("Article content too short or empty");
  }

  // Create article record
  const articleId = randomUUID();
  await db.insert(articleSchema).values({
    id: articleId,
    userId,
    url,
    title: extracted.title,
    author: extracted.author,
    publishedAt: extracted.publishedAt,
    siteName: extracted.siteName,
    excerpt: extracted.excerpt,
    status: "processing",
  });

  try {
    // Chunk and embed
    const { chunkCount } = await chunkArticleContent({
      db,
      articleId,
      content: extracted.content,
    });

    // Generate signals
    const { signalCount } = await generateArticleSignals({
      db,
      articleId,
      userId,
    });

    // Mark as processed
    await db
      .update(articleSchema)
      .set({ status: "processed" })
      .where(eq(articleSchema.id, articleId));

    return { articleId, chunkCount, signalCount };
  } catch (error) {
    // Mark as failed
    await db
      .update(articleSchema)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(articleSchema.id, articleId));

    throw error;
  }
}
