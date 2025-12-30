import { randomUUID } from "node:crypto";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { openrouter } from "@/ai/models";
import type { db as dbInstance } from "@/server/db";
import { article as articleSchema, transcriptChunk } from "@/server/db/schema";

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
}

/**
 * Extract article content using Jina AI Reader
 * Uses markdown format for cleaner content extraction
 */
export async function extractArticleContent(
  url: string,
): Promise<ArticleExtractionResult> {
  const jinaUrl = `https://r.jina.ai/${url}`;

  const response = await fetch(jinaUrl, {
    headers: {
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
      "X-Return-Format": "markdown",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to extract article content: ${response.statusText}`,
    );
  }

  const rawMarkdown = await response.text();

  const lines = rawMarkdown.split("\n");
  let title = "Untitled Article";
  let author: string | undefined;
  let publishedAt: Date | undefined;
  let siteName: string | undefined;
  let excerpt: string | undefined;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();

    if (line.startsWith("# ") && title === "Untitled Article") {
      title = line.substring(2).trim();
    }

    if (line.match(/^By\s+(.+)$/i)) {
      author = line.replace(/^By\s+/i, "").trim();
    }

    const dateMatch = line.match(/\b([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\b/);
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1]);
      if (!Number.isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate;
      }
    }
  }

  const cleanedMarkdown = await cleanMarkdownWithAI(rawMarkdown);
  const content = cleanMarkdownContent(cleanedMarkdown);

  if (!content || content.length < 100) {
    throw new Error("Article content too short or empty");
  }

  if (!excerpt) {
    const firstParagraph = content.split("\n\n")[0];
    excerpt = firstParagraph?.slice(0, 200) || content.slice(0, 200);
  }

  return {
    title,
    content,
    rawContent: cleanedMarkdown,
    author,
    publishedAt,
    siteName,
    excerpt,
  };
}

/**
 * Clean markdown content using Grok-4 AI model
 */
export async function cleanMarkdownWithAI(markdown: string): Promise<string> {
  try {
    const response = await generateText({
      model: openrouter("x-ai/grok-4-fast"),
      messages: [
        {
          role: "system",
          content: `You are a markdown content cleaner. Your job is to extract ONLY the main article content from a webpage's markdown, removing all navigation, headers, footers, sidebars, and UI elements.

Rules:
- Keep the article title if it's an H1 at the start
- Keep the author name and publish date if present
- Keep ALL main article body content and paragraphs
- Remove navigation menus, search boxes, subscribe forms, social media buttons
- Remove site headers/footers like "Published Time:", "Search", "Subscribe", "Share This", etc.
- Remove image artifacts like "Image 1:", "Image 2:", etc.
- Remove horizontal rules and dividers
- Return ONLY the clean markdown, no explanations or commentary
- Preserve the original markdown formatting (headings, lists, quotes, etc.)`,
        },
        {
          role: "user",
          content: `Clean this markdown content:\n\n${markdown}`,
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 4000,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Failed to clean markdown with AI:", error);
    return cleanMarkdownContent(markdown);
  }
}

/**
 * Extract article body from Jina response
 */
export function extractArticleBody(jinaContent: string): string {
  let content = jinaContent;

  if (content.includes("Markdown Content:")) {
    const lines = content.split("\n");
    let contentStartIndex = 0;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (line.startsWith("Markdown Content:")) {
        contentStartIndex = i + 1;
        break;
      }
    }

    content = lines.slice(contentStartIndex).join("\n");
  }

  content = content.replace(/!\[Image \d+:.*?\]\([^)]*\)/gi, "");
  content = content.replace(/\[Image \d+:.*?\]/gi, "");
  content = content.replace(/Image \d+:.*$/gim, "");
  content = content.replace(/\[\]\([^)]+\)/g, "");
  content = content.replace(/Privacy & Cookies:.*?(?=\n\n|$)/gi, "");
  content = content.replace(/back\s+random\s+next/gi, "");
  content = content.replace(/^[=-]{3,}$/gm, "");
  content = content.replace(/\n{3,}/g, "\n\n");
  content = content.replace(/[ \t]+/g, " ");
  content = content.replace(/^\s+|\s+$/gm, "");

  return content.trim();
}

/**
 * Clean markdown content to improve chunk quality
 */
export function cleanMarkdownContent(content: string): string {
  let cleaned = content;

  cleaned = cleaned.replace(/^.*?Published Time:.*?$/gm, "");
  cleaned = cleaned.replace(/^You have unread updates\d*$/gm, "");
  cleaned = cleaned.replace(/^Search\s*[-=]*$/gm, "");
  cleaned = cleaned.replace(/^Search for:.*$/gm, "");
  cleaned = cleaned.replace(/^Or try my new.*?search bot.*$/gm, "");
  cleaned = cleaned.replace(/^Subscribe\s*[-=]*$/gm, "");
  cleaned = cleaned.replace(/^Email.*?Terms.*?Privacy.*$/gm, "");
  cleaned = cleaned.replace(/^Get the weekly digest.*$/gm, "");
  cleaned = cleaned.replace(/^Type your email.*$/gm, "");
  cleaned = cleaned.replace(/^\*\*Subscribe\*\*$/gm, "");
  cleaned = cleaned.replace(/^Learn\s*[-=]*$/gm, "");
  cleaned = cleaned.replace(/^Which workshop\?.*$/gm, "");
  cleaned = cleaned.replace(/^The LinkedIn.*$/gm, "");
  cleaned = cleaned.replace(/^Share This.*$/gm, "");
  cleaned = cleaned.replace(/^Share on Mastodon.*$/gm, "");
  cleaned = cleaned.replace(/^back\s+random\s+next$/gim, "");
  cleaned = cleaned.replace(/^.+\s+\|\s+Seth's Blog\s*$/gm, "");
  cleaned = cleaned.replace(/^[\s]*[-=]{3,}[\s]*$/gm, "");
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
  cleaned = cleaned.replace(/\[Image[^\]]*\]\([^)]+\)/gi, "");
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  cleaned = cleaned.replace(/^https?:\/\/[^\s]+$/gm, "");
  cleaned = cleaned.replace(/^>\s*/gm, "");
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1");
  cleaned = cleaned.replace(/```[\w]*\n/g, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.replace(/^\*\s+\[.*?\]\s*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/^\s+$/gm, "");

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
 * Chunk article content into smaller pieces (without embeddings)
 */
export async function chunkArticleContent({
  db,
  articleId,
  content,
  minTokens = 150,
  maxTokens = 400,
}: ChunkArticleParams): Promise<{ chunkCount: number }> {
  const paragraphs = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => {
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

    if (wordCount > maxTokens) {
      if (currentWordCount >= minTokens) {
        chunks.push({
          content: currentChunk.trim(),
          wordCount: currentWordCount,
        });
        currentChunk = "";
        currentWordCount = 0;
      }

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

    if (currentWordCount > 0 && currentWordCount + wordCount > maxTokens) {
      if (currentWordCount >= minTokens) {
        chunks.push({
          content: currentChunk.trim(),
          wordCount: currentWordCount,
        });
        currentChunk = "";
        currentWordCount = 0;
      }
    }

    currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    currentWordCount += wordCount;

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

  if (currentWordCount >= minTokens || chunks.length === 0) {
    chunks.push({
      content: currentChunk.trim(),
      wordCount: currentWordCount,
    });
  }

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // Insert chunks into database (without embeddings)
  const chunksToInsert = chunks.map((chunk, index) => ({
    id: `chunk_article_${articleId}_${index}`,
    articleId,
    episodeId: null,
    speaker: null,
    content: chunk.content,
    startTimeSec: null,
    endTimeSec: null,
    wordCount: chunk.wordCount,
    embedding: null,
  }));

  await db.insert(transcriptChunk).values(chunksToInsert).onConflictDoNothing();

  console.log(
    `Created ${chunks.length} chunks for article ${articleId}, avg words: ${Math.round(chunks.reduce((sum, c) => sum + c.wordCount, 0) / chunks.length)}`,
  );

  return { chunkCount: chunks.length };
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
 */
export async function processArticle({
  db,
  userId,
  url,
  articleId: existingArticleId,
}: ProcessArticleParams): Promise<ArticleProcessingResult> {
  let articleId: string;

  const existing = await db.query.article.findFirst({
    where: (article, { and, eq }) =>
      and(eq(article.userId, userId), eq(article.url, url)),
  });

  if (existing && !existingArticleId) {
    throw new Error("Article already processed");
  }

  const extracted = await extractArticleContent(url);

  if (!extracted.content || extracted.content.trim().length < 100) {
    throw new Error("Article content too short or empty");
  }

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
    const { chunkCount } = await chunkArticleContent({
      db,
      articleId,
      content: extracted.content,
    });

    await db
      .update(articleSchema)
      .set({ status: "processed" })
      .where(eq(articleSchema.id, articleId));

    return { articleId, chunkCount };
  } catch (error) {
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
