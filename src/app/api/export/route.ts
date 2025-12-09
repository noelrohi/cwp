import { and, eq, gte } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  article,
  dailySignal,
  episode,
  podcast,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema/podcast";
import { db } from "@/server/db";
import type { ExportData, ExportDocument } from "@/server/trpc/routers/exports";

/**
 * Public Export API
 *
 * GET /api/export?userId=xxx&since=2024-12-01&mode=exocortex
 *
 * Query Parameters:
 * - userId (required): The user ID to export data for
 * - mode (optional): "full" | "incremental" | "exocortex" (default: "full")
 * - since (optional): ISO date string to filter data since that date
 *
 * Returns: JSON with flat document structure optimized for LLM/RAG ingestion
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const userId = searchParams.get("userId");
  const mode = (searchParams.get("mode") ?? "full") as
    | "full"
    | "incremental"
    | "exocortex";
  const since = searchParams.get("since");

  if (!userId) {
    return NextResponse.json(
      { error: "userId parameter is required" },
      { status: 400 },
    );
  }

  if (!["full", "incremental", "exocortex"].includes(mode)) {
    return NextResponse.json(
      { error: "mode must be one of: full, incremental, exocortex" },
      { status: 400 },
    );
  }

  const sinceDate = since ? new Date(since) : undefined;

  if (since && sinceDate && Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid since date format. Use ISO 8601 format." },
      { status: 400 },
    );
  }

  try {
    // Get saved signals with all related data joined
    const savedSignals = await db
      .select({
        signal: dailySignal,
        chunk: transcriptChunk,
        episode: episode,
        podcast: podcast,
        article: article,
      })
      .from(dailySignal)
      .leftJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
      .leftJoin(episode, eq(transcriptChunk.episodeId, episode.id))
      .leftJoin(podcast, eq(episode.podcastId, podcast.id))
      .leftJoin(article, eq(transcriptChunk.articleId, article.id))
      .where(
        and(
          eq(dailySignal.userId, userId),
          eq(dailySignal.userAction, "saved"),
          sinceDate ? gte(dailySignal.actionedAt, sinceDate) : undefined,
        ),
      );

    // Get saved chunks with notes/tags
    const savedChunks = await db
      .select()
      .from(savedChunk)
      .where(eq(savedChunk.userId, userId));

    const savedChunkMap = new Map(savedChunks.map((sc) => [sc.chunkId, sc]));

    // Transform to flat document structure
    const documents: ExportDocument[] = savedSignals.map((row) => {
      const saved = savedChunkMap.get(row.signal.chunkId);
      const tags = saved?.tags ? JSON.parse(saved.tags) : null;

      return {
        id: row.signal.id,
        type: "signal" as const,
        source: row.episode
          ? {
              type: "episode" as const,
              id: row.episode.id,
              title: row.episode.title,
              podcast: row.podcast?.title ?? null,
              published_at: row.episode.publishedAt?.toISOString() ?? null,
              url: row.episode.audioUrl ?? row.episode.youtubeVideoUrl ?? null,
            }
          : {
              type: "article" as const,
              id: row.article?.id ?? "",
              title: row.article?.title ?? null,
              author: row.article?.author ?? null,
              published_at: row.article?.publishedAt?.toISOString() ?? null,
              url: row.article?.url ?? null,
            },
        content: {
          title: row.signal.title,
          summary: row.signal.summary,
          excerpt: row.signal.excerpt,
          speaker: row.chunk?.speaker ?? row.signal.speakerName ?? null,
          transcript_context: row.chunk?.content ?? null,
          timestamp_start: row.chunk?.startTimeSec ?? null,
          timestamp_end: row.chunk?.endTimeSec ?? null,
        },
        metadata: {
          relevance_score: row.signal.relevanceScore,
          saved_at: row.signal.actionedAt?.toISOString() ?? null,
          tags,
          notes: saved?.notes ?? null,
        },
        embedding:
          mode === "exocortex" && row.chunk?.embedding
            ? (row.chunk.embedding as number[])
            : undefined,
      };
    });

    const exportData: ExportData = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      export_mode: mode,
      user_id: userId,
      document_count: documents.length,
      documents,
    };

    return NextResponse.json(exportData);
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }
}
