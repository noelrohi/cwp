import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { cosineDistance, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  episode as episodeSchema,
  savedChunk,
  transcriptChunk,
  userCentroid,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

interface ChunkWithScore {
  id: string;
  content: string;
  speaker: string | null;
  similarity: number;
  embedding: number[];
  finalScore?: number;
  centroidSimilarity?: number;
}

// Helper function to update user centroid
async function updateUserCentroid(
  db: typeof import("@/server/db").db,
  userId: string,
  chunkEmbedding: number[],
  action: "save" | "skip",
) {
  // Get current user centroid
  const currentCentroid = await db
    .select()
    .from(userCentroid)
    .where(eq(userCentroid.userId, userId))
    .limit(1);

  if (currentCentroid.length === 0) {
    // Create new centroid for first-time user
    await db.insert(userCentroid).values({
      id: `centroid_${userId}`,
      userId,
      centroidEmbedding: chunkEmbedding,
      savedCount: action === "save" ? 1 : 0,
      skippedCount: action === "skip" ? 1 : 0,
    });
  } else {
    // Update existing centroid using running average
    const centroid = currentCentroid[0];
    const currentEmbedding = centroid.centroidEmbedding as number[];
    const currentSavedCount = centroid.savedCount;
    const currentSkippedCount = centroid.skippedCount;

    let newEmbedding: number[];
    let newSavedCount = currentSavedCount;
    let newSkippedCount = currentSkippedCount;

    if (action === "save") {
      newSavedCount = currentSavedCount + 1;
      // Update centroid to include saved chunk (positive signal)
      const alpha = 1 / newSavedCount; // Learning rate
      newEmbedding = currentEmbedding.map(
        (val, i) => val * (1 - alpha) + chunkEmbedding[i] * alpha,
      );
    } else {
      newSkippedCount = currentSkippedCount + 1;
      // Move centroid away from skipped chunk (negative signal)
      const alpha = 0.1; // Smaller learning rate for negative signals
      newEmbedding = currentEmbedding.map(
        (val, i) => val * (1 - alpha) - chunkEmbedding[i] * alpha,
      );
    }

    await db
      .update(userCentroid)
      .set({
        centroidEmbedding: newEmbedding,
        savedCount: newSavedCount,
        skippedCount: newSkippedCount,
      })
      .where(eq(userCentroid.userId, userId));
  }
}

export const playgroundRouter = createTRPCRouter({
  chunkTranscript: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
        minTokens: z.number().min(1),
        maxTokens: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get episode with transcript
      const episodeData = await ctx.db.query.episode.findFirst({
        where: eq(episodeSchema.id, input.episodeId),
      });

      if (!episodeData?.transcriptUrl) {
        throw new Error("Episode or transcript not found");
      }

      // Fetch transcript data
      const transcriptResponse = await fetch(episodeData.transcriptUrl);
      if (!transcriptResponse.ok) {
        throw new Error("Failed to fetch transcript");
      }

      const transcriptData = await transcriptResponse.json();

      // Delete existing chunks for this episode
      await ctx.db
        .delete(transcriptChunk)
        .where(eq(transcriptChunk.episodeId, input.episodeId));

      // Chunk the transcript
      const chunks = [];
      let currentChunk = {
        content: "",
        speaker: null as string | null,
        startSec: 0,
        endSec: 0,
      };

      for (const utterance of transcriptData) {
        const text = utterance.transcript || utterance.text || "";
        const words = text.split(/\s+/);

        for (const word of words) {
          if (currentChunk.content.split(/\s+/).length >= input.maxTokens) {
            // Save current chunk if it meets minimum token requirement
            if (currentChunk.content.split(/\s+/).length >= input.minTokens) {
              chunks.push({ ...currentChunk });
            }
            // Start new chunk
            currentChunk = {
              content: word,
              speaker: utterance.speaker?.toString() || null,
              startSec: utterance.start || utterance.startSecond || 0,
              endSec: utterance.end || utterance.endSecond || 0,
            };
          } else {
            // Add to current chunk
            currentChunk.content += (currentChunk.content ? " " : "") + word;
            currentChunk.speaker = utterance.speaker?.toString() || null;
            currentChunk.endSec = utterance.end || utterance.endSecond || 0;
          }
        }
      }

      // Save the last chunk if it meets minimum token requirement
      if (currentChunk.content.split(/\s+/).length >= input.minTokens) {
        chunks.push(currentChunk);
      }

      // Generate embeddings and save chunks
      for (const chunk of chunks) {
        const { embedding } = await embed({
          model: openai.textEmbeddingModel("text-embedding-3-small"),
          value: chunk.content,
        });

        await ctx.db.insert(transcriptChunk).values({
          id: `chunk_${input.episodeId}_${chunks.indexOf(chunk)}`,
          episodeId: input.episodeId,
          speaker: chunk.speaker,
          content: chunk.content,
          embedding: embedding,
        });
      }

      return { success: true, chunkCount: chunks.length };
    }),

  findSimilarChunks: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log(
        "Finding similar chunks for episode:",
        input.episodeId,
        "query:",
        input.query,
      );

      // First check if there are any chunks for this episode
      const existingChunks = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(transcriptChunk)
        .where(eq(transcriptChunk.episodeId, input.episodeId));

      console.log("Existing chunks count:", existingChunks[0]?.count || 0);

      // Generate embedding for the clean query (no contamination)
      const { embedding: queryEmbedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: input.query,
      });

      console.log("Generated query embedding");

      // Calculate cosine similarity and find similar chunks (first-stage retrieval)
      const similarity = sql<number>`1 - (${cosineDistance(
        transcriptChunk.embedding,
        queryEmbedding,
      )})`;

      // Get top chunks with their similarity scores
      const allChunksWithSimilarity = await ctx.db
        .select({
          id: transcriptChunk.id,
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          similarity,
          embedding: transcriptChunk.embedding,
        })
        .from(transcriptChunk)
        .where(eq(transcriptChunk.episodeId, input.episodeId))
        .orderBy((t) => desc(t.similarity))
        .limit(20); // Get more candidates for re-ranking

      console.log(
        "First-stage retrieval results:",
        allChunksWithSimilarity.length,
      );

      // Personalized re-ranking using user centroid
      let rerankedChunks = allChunksWithSimilarity;

      if (ctx.user?.id) {
        // Get user centroid
        const userCentroidData = await ctx.db
          .select()
          .from(userCentroid)
          .where(eq(userCentroid.userId, ctx.user.id))
          .limit(1);

        if (
          userCentroidData.length > 0 &&
          userCentroidData[0].centroidEmbedding
        ) {
          const centroidEmbedding = userCentroidData[0]
            .centroidEmbedding as number[];

          // Re-rank chunks based on similarity to user centroid
          rerankedChunks = allChunksWithSimilarity
            .map((chunk) => {
              const chunkEmbedding = chunk.embedding as number[];

              // Calculate cosine similarity to user centroid
              const dotProduct = chunkEmbedding.reduce(
                (sum, val, i) => sum + val * centroidEmbedding[i],
                0,
              );
              const chunkMagnitude = Math.sqrt(
                chunkEmbedding.reduce((sum, val) => sum + val * val, 0),
              );
              const centroidMagnitude = Math.sqrt(
                centroidEmbedding.reduce((sum, val) => sum + val * val, 0),
              );
              const centroidSimilarity =
                dotProduct / (chunkMagnitude * centroidMagnitude);

              // Combine query similarity and centroid similarity (weighted)
              const finalScore =
                chunk.similarity * 0.7 + centroidSimilarity * 0.3;

              return {
                ...chunk,
                finalScore,
                centroidSimilarity,
              };
            })
            .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

          console.log("Applied personalized re-ranking with user centroid");
        }
      }

      // Apply threshold and limit results
      const similarChunks = rerankedChunks
        .filter((chunk) => {
          const finalScore = (chunk as ChunkWithScore).finalScore;
          return finalScore !== undefined
            ? finalScore > 0.1
            : chunk.similarity > 0.1;
        })
        .slice(0, 5)
        .map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          speaker: chunk.speaker,
          similarity: (chunk as ChunkWithScore).finalScore || chunk.similarity,
        }));

      console.log("Final re-ranked chunks:", similarChunks.length);

      return similarChunks;
    }),

  saveChunk: protectedProcedure
    .input(
      z.object({
        chunkId: z.string(),
        query: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      // Check if chunk is already saved
      const existingSavedChunk = await ctx.db
        .select()
        .from(savedChunk)
        .where(
          sql`${savedChunk.chunkId} = ${input.chunkId} AND ${savedChunk.userId} = ${ctx.user.id}`,
        );

      if (existingSavedChunk.length > 0) {
        throw new Error("Chunk already saved");
      }

      // Get the chunk embedding to update centroid
      const chunkData = await ctx.db
        .select({ embedding: transcriptChunk.embedding })
        .from(transcriptChunk)
        .where(eq(transcriptChunk.id, input.chunkId))
        .limit(1);

      if (chunkData.length === 0) {
        throw new Error("Chunk not found");
      }

      const chunkEmbedding = chunkData[0].embedding as number[];

      // Save the chunk
      await ctx.db.insert(savedChunk).values({
        id: `saved_${ctx.user.id}_${input.chunkId}`,
        chunkId: input.chunkId,
        userId: ctx.user.id,
        query: input.query,
      });

      // Update user centroid
      await updateUserCentroid(ctx.db, ctx.user.id, chunkEmbedding, "save");

      return { success: true };
    }),

  removeSavedChunk: protectedProcedure
    .input(
      z.object({
        chunkId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      // Get the chunk embedding before removing it
      const chunkData = await ctx.db
        .select({ embedding: transcriptChunk.embedding })
        .from(transcriptChunk)
        .innerJoin(savedChunk, eq(savedChunk.chunkId, transcriptChunk.id))
        .where(
          sql`${savedChunk.chunkId} = ${input.chunkId} AND ${savedChunk.userId} = ${ctx.user.id}`,
        )
        .limit(1);

      await ctx.db
        .delete(savedChunk)
        .where(
          sql`${savedChunk.chunkId} = ${input.chunkId} AND ${savedChunk.userId} = ${ctx.user.id}`,
        );

      // Update user centroid (treat removal as skip signal)
      if (chunkData.length > 0) {
        const chunkEmbedding = chunkData[0].embedding as number[];
        await updateUserCentroid(ctx.db, ctx.user.id, chunkEmbedding, "skip");
      }

      return { success: true };
    }),

  skipChunk: protectedProcedure
    .input(
      z.object({
        chunkId: z.string(),
        query: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      // Get the chunk embedding to update centroid
      const chunkData = await ctx.db
        .select({ embedding: transcriptChunk.embedding })
        .from(transcriptChunk)
        .where(eq(transcriptChunk.id, input.chunkId))
        .limit(1);

      if (chunkData.length === 0) {
        throw new Error("Chunk not found");
      }

      const chunkEmbedding = chunkData[0].embedding as number[];

      // Update user centroid with skip signal
      await updateUserCentroid(ctx.db, ctx.user.id, chunkEmbedding, "skip");

      return { success: true };
    }),

  getSavedChunks: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) {
      return [];
    }

    const savedChunks = await ctx.db
      .select({
        id: savedChunk.id,
        chunkId: savedChunk.chunkId,
        query: savedChunk.query,
        content: transcriptChunk.content,
        speaker: transcriptChunk.speaker,
        createdAt: savedChunk.createdAt,
      })
      .from(savedChunk)
      .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
      .where(eq(savedChunk.userId, ctx.user.id))
      .orderBy(desc(savedChunk.createdAt));

    return savedChunks;
  }),
});
