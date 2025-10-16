import { randomUUID } from "node:crypto";
import { cosineSimilarity } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { generateEmbeddingBatch } from "@/lib/embedding";
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
  rawContent: string;
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
  const response = await fetch(jinaUrl, {
    headers: {
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to extract article content: ${response.statusText}`,
    );
  }

  const text = await response.text();

  // Parse metadata from headers
  const lines = text.split("\n");
  let title = "Untitled Article";
  let publishedAt: Date | undefined;

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];

    if (line.startsWith("Title: ")) {
      title = line.substring(7).trim();
    } else if (line.startsWith("Published Time: ")) {
      const timeStr = line.substring(16).trim();
      const parsed = new Date(timeStr);
      publishedAt = Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
  }

  const rawBodyContent = extractArticleBody(text);

  const content = cleanMarkdownContent(rawBodyContent);

  if (!content || content.length < 100) {
    throw new Error("Article content too short or empty");
  }

  return {
    title,
    content,
    rawContent: rawBodyContent,
    author: undefined,
    publishedAt,
    siteName: undefined,
    excerpt: content.slice(0, 200),
  };
}

/**
 * Extract article body from Jina markdown response
 * Removes Jina metadata headers, navigation, footers, and extracts main content
 */
export function extractArticleBody(jinaMarkdown: string): string {
  const lines = jinaMarkdown.split("\n");
  let contentStartIndex = 0;

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    if (line.startsWith("Markdown Content:")) {
      contentStartIndex = i + 1;
      break;
    }
  }

  let content = lines.slice(contentStartIndex).join("\n");

  const commonFooterPatterns = [
    /Privacy & Cookies:.*/g,
    /Share This\s+Facebook.*/g,
    /Share on Mastodon.*/g,
    /Enter your.*instance URL.*/g,
    /Subscribe.*Email Terms.*Privacy.*/g,
    /back\s+random\s+next/gi,
    /Search\s+Search for:.*/g,
    /Get the weekly digest.*/g,
    /Type your email…\s+Subscribe/g,
    /Learn\s+Which workshop\?.*/g,
    /Connect\s+News and updates.*/g,
    /More Seth\s+Books.*/g,
    /Welcome back\. Have you thought about subscribing\?.*/g,
  ];

  for (const pattern of commonFooterPatterns) {
    content = content.replace(pattern, "");
  }

  content = content
    .replace(/Image \d+:.*/gim, "")
    .replace(/\[Image \d+:.*?\]/gi, "")
    .replace(/You have unread updates\d+/gi, "")
    .replace(/Or try my new AI-powered search bot/gi, "")
    .replace(/Find all the books at [\w.]+/gi, "");

  content = content.replace(/\n{3,}/g, "\n\n").trim();

  return content;
}

/**
 * Clean markdown content to improve chunk quality
 * Removes formatting noise while preserving semantic meaning
 */
export function cleanMarkdownContent(content: string): string {
  let cleaned = content;

  // Remove horizontal rules (---, ===, etc.)
  cleaned = cleaned.replace(/^[\s]*[-=]{3,}[\s]*$/gm, "");

  // Remove image references with embedded URLs - they pollute embeddings
  // Captures: ![alt text](url) or [Image: description](url)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
  cleaned = cleaned.replace(/\[Image[^\]]*\]\([^)]+\)/gi, "");

  // Clean inline links but preserve the text
  // [link text](url) -> link text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove standalone URLs on their own lines
  cleaned = cleaned.replace(/^https?:\/\/[^\s]+$/gm, "");

  // Normalize blockquote markers (> ) to preserve quoted text
  cleaned = cleaned.replace(/^>\s*/gm, "");

  // Remove excessive emphasis markers but preserve the text
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1"); // bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1"); // italic
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1"); // italic underscore

  // Remove code block markers but preserve code content
  cleaned = cleaned.replace(/```[\w]*\n/g, "");
  cleaned = cleaned.replace(/```/g, "");

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // max 2 newlines
  cleaned = cleaned.replace(/[ \t]+/g, " "); // normalize spaces

  return cleaned.trim();
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
 * Uses semantic boundaries and proper size constraints
 */
export async function chunkArticleContent({
  db,
  articleId,
  content,
  minTokens = 150,
  maxTokens = 400,
}: ChunkArticleParams): Promise<{ chunkCount: number }> {
  // Split into paragraphs and filter out noise
  const paragraphs = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => {
      // Filter out very short paragraphs that are likely artifacts
      const wordCount = p.split(/\s+/).length;
      return wordCount >= 10 && p.length > 50;
    });

  if (paragraphs.length === 0) {
    return { chunkCount: 0 };
  }

  const chunks: { content: string; wordCount: number }[] = [];
  let currentChunk = "";
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    const wordCount = words.length;

    // Check if this paragraph is too large on its own
    if (wordCount > maxTokens) {
      // Save current chunk if exists
      if (currentWordCount >= minTokens) {
        chunks.push({
          content: currentChunk.trim(),
          wordCount: currentWordCount,
        });
        currentChunk = "";
        currentWordCount = 0;
      }

      // Split large paragraph by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      let sentenceChunk = "";
      let sentenceWordCount = 0;

      for (const sentence of sentences) {
        const sentenceWords = sentence.trim().split(/\s+/).length;

        if (
          sentenceWordCount > 0 &&
          sentenceWordCount + sentenceWords > maxTokens
        ) {
          if (sentenceWordCount >= minTokens) {
            chunks.push({
              content: sentenceChunk.trim(),
              wordCount: sentenceWordCount,
            });
          }
          sentenceChunk = sentence;
          sentenceWordCount = sentenceWords;
        } else {
          sentenceChunk += (sentenceChunk ? " " : "") + sentence;
          sentenceWordCount += sentenceWords;

          if (sentenceWordCount >= minTokens) {
            chunks.push({
              content: sentenceChunk.trim(),
              wordCount: sentenceWordCount,
            });
            sentenceChunk = "";
            sentenceWordCount = 0;
          }
        }
      }

      if (sentenceWordCount > 0) {
        currentChunk = sentenceChunk;
        currentWordCount = sentenceWordCount;
      }
      continue;
    }

    // Would adding this paragraph exceed our target?
    if (currentWordCount > 0 && currentWordCount + wordCount > maxTokens) {
      // Save current chunk if it meets minimum
      if (currentWordCount >= minTokens) {
        chunks.push({
          content: currentChunk.trim(),
          wordCount: currentWordCount,
        });
        currentChunk = "";
        currentWordCount = 0;
      }
    }

    // Add paragraph to current chunk
    currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    currentWordCount += wordCount;

    // If we're in the sweet spot (between min and preferred), save it
    const preferredSize = (minTokens + maxTokens) / 2;
    if (currentWordCount >= preferredSize && currentWordCount <= maxTokens) {
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
  const BATCH_SIZE = 100;
  const embeddings: (number[] | null)[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    try {
      const batchEmbeddings = await generateEmbeddingBatch(
        batch.map((chunk) => chunk.content),
      );
      embeddings.push(...batchEmbeddings);
    } catch (error) {
      console.error(
        `Failed to generate embeddings for batch starting at ${i}:`,
        error,
      );
      embeddings.push(...new Array(batch.length).fill(null));
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

  await db.insert(transcriptChunk).values(chunksToInsert).onConflictDoNothing();

  console.log(
    `Created ${chunks.length} chunks for article ${articleId}, avg words: ${Math.round(chunks.reduce((sum, c) => sum + c.wordCount, 0) / chunks.length)}`,
  );

  return { chunkCount: chunks.length };
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
export async function generateArticleSignals({
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
  articleId?: string;
}

/**
 * Complete article processing pipeline:
 * 1. Extract content via Jina AI
 * 2. Create article record (or use existing)
 * 3. Chunk content
 * 4. Generate embeddings
 */
export async function processArticle({
  db,
  userId,
  url,
  articleId: existingArticleId,
}: ProcessArticleParams): Promise<ArticleProcessingResult> {
  let articleId: string;

  // Check if article already exists for this user
  const existing = await db.query.article.findFirst({
    where: (article, { and, eq }) =>
      and(eq(article.userId, userId), eq(article.url, url)),
  });

  if (existing && !existingArticleId) {
    throw new Error("Article already processed");
  }

  // Extract content
  const extracted = await extractArticleContent(url);

  if (!extracted.content || extracted.content.trim().length < 100) {
    throw new Error("Article content too short or empty");
  }

  // Create or update article record
  if (existingArticleId || existing) {
    articleId = existingArticleId || existing!.id;
    await db
      .update(articleSchema)
      .set({
        status: "processing",
        title: extracted.title,
        author: extracted.author,
        publishedAt: extracted.publishedAt,
        siteName: extracted.siteName,
        excerpt: extracted.excerpt,
        rawContent: extracted.rawContent,
      })
      .where(eq(articleSchema.id, articleId));
  } else {
    articleId = randomUUID();
    await db.insert(articleSchema).values({
      id: articleId,
      userId,
      url,
      title: extracted.title,
      author: extracted.author,
      publishedAt: extracted.publishedAt,
      siteName: extracted.siteName,
      excerpt: extracted.excerpt,
      rawContent: extracted.rawContent,
      status: "processing",
    });
  }

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
