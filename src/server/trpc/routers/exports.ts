import { and, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { db as dbInstance } from "@/server/db";
import {
  article,
  dailySignal,
  episode,
  podcast,
  savedChunk,
  transcriptChunk,
  userExportSettings,
} from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

const exportModeSchema = z.enum(["full", "incremental", "exocortex"]);

export type ExportDocument = {
  id: string;
  type: "signal";
  source: {
    type: "episode" | "article";
    id: string;
    title: string | null;
    podcast?: string | null;
    author?: string | null;
    published_at: string | null;
    url: string | null;
  };
  content: {
    title: string | null;
    summary: string | null;
    excerpt: string | null;
    speaker: string | null;
    transcript_context: string | null;
    timestamp_start: number | null;
    timestamp_end: number | null;
  };
  metadata: {
    relevance_score: number;
    saved_at: string | null;
    tags: string[] | null;
    notes: string | null;
  };
  embedding?: number[] | null;
};

export type ExportData = {
  version: "1.0";
  exported_at: string;
  export_mode: "full" | "incremental" | "exocortex";
  user_id: string;
  document_count: number;
  documents: ExportDocument[];
};

async function buildExportData(
  db: typeof dbInstance,
  userId: string,
  mode: "full" | "incremental" | "exocortex",
  sinceDate?: Date,
): Promise<ExportData> {
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

  return {
    version: "1.0",
    exported_at: new Date().toISOString(),
    export_mode: mode,
    user_id: userId,
    document_count: documents.length,
    documents,
  };
}

export const exportsRouter = createTRPCRouter({
  // Get export settings (last sync date)
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(userExportSettings)
      .where(eq(userExportSettings.userId, ctx.user.id))
      .limit(1);

    return settings ?? null;
  }),

  // Main export procedure (protected - for UI)
  export: protectedProcedure
    .input(
      z.object({
        mode: exportModeSchema,
        since: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Determine the since date based on mode
      let sinceDate: Date | undefined;

      if (input.mode === "incremental") {
        if (input.since) {
          sinceDate = new Date(input.since);
        } else {
          // Get last export date from settings
          const [settings] = await ctx.db
            .select()
            .from(userExportSettings)
            .where(eq(userExportSettings.userId, ctx.user.id))
            .limit(1);

          if (settings?.lastExportedAt) {
            sinceDate = settings.lastExportedAt;
          }
        }
      }

      const exportData = await buildExportData(
        ctx.db,
        ctx.user.id,
        input.mode,
        sinceDate,
      );

      // Update last exported timestamp
      const existingSettings = await ctx.db
        .select()
        .from(userExportSettings)
        .where(eq(userExportSettings.userId, ctx.user.id))
        .limit(1);

      if (existingSettings.length > 0) {
        await ctx.db
          .update(userExportSettings)
          .set({ lastExportedAt: new Date() })
          .where(eq(userExportSettings.userId, ctx.user.id));
      } else {
        await ctx.db.insert(userExportSettings).values({
          id: nanoid(),
          userId: ctx.user.id,
          lastExportedAt: new Date(),
        });
      }

      return exportData;
    }),

  // Public export procedure (for API access)
  publicExport: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        mode: exportModeSchema.default("full"),
        since: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sinceDate = input.since ? new Date(input.since) : undefined;

      return buildExportData(ctx.db, input.userId, input.mode, sinceDate);
    }),

  // Update last exported timestamp manually
  updateLastExportedAt: protectedProcedure.mutation(async ({ ctx }) => {
    const existingSettings = await ctx.db
      .select()
      .from(userExportSettings)
      .where(eq(userExportSettings.userId, ctx.user.id))
      .limit(1);

    if (existingSettings.length > 0) {
      await ctx.db
        .update(userExportSettings)
        .set({ lastExportedAt: new Date() })
        .where(eq(userExportSettings.userId, ctx.user.id));
    } else {
      await ctx.db.insert(userExportSettings).values({
        id: nanoid(),
        userId: ctx.user.id,
        lastExportedAt: new Date(),
      });
    }

    return { success: true };
  }),
});
