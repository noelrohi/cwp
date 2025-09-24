import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { cosineDistance, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  episode as episodeSchema,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema";
import { createTRPCRouter, publicProcedure } from "../init";

export const playgroundRouter = createTRPCRouter({
  chunkTranscript: publicProcedure
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

  findSimilarChunks: publicProcedure
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

      // Get saved chunks content for context from database
      let enhancedQuery = input.query;
      if (ctx.user?.id) {
        const savedChunksData = await ctx.db
          .select({
            content: transcriptChunk.content,
          })
          .from(savedChunk)
          .innerJoin(
            transcriptChunk,
            eq(savedChunk.chunkId, transcriptChunk.id),
          )
          .where(eq(savedChunk.userId, ctx.user.id));

        if (savedChunksData.length > 0) {
          const contextContent = savedChunksData
            .map((chunk) => chunk.content)
            .join(" ");
          enhancedQuery = `Context: ${contextContent}\n\nQuery: ${input.query}`;
          console.log("Enhanced query with saved chunks context");
        }
      }

      // Generate embedding for the enhanced query
      const { embedding: queryEmbedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: enhancedQuery,
      });

      console.log("Generated query embedding");

      // Calculate cosine similarity and find similar chunks
      const similarity = sql<number>`1 - (${cosineDistance(
        transcriptChunk.embedding,
        queryEmbedding,
      )})`;

      // First get all chunks with their similarity scores (no threshold)
      const allChunksWithSimilarity = await ctx.db
        .select({
          id: transcriptChunk.id,
          content: transcriptChunk.content,
          speaker: transcriptChunk.speaker,
          similarity,
        })
        .from(transcriptChunk)
        .where(eq(transcriptChunk.episodeId, input.episodeId))
        .orderBy((t) => desc(t.similarity));

      console.log("All chunks with similarity scores:");
      allChunksWithSimilarity.forEach((chunk, index) => {
        console.log(
          `${index + 1}. ID: ${chunk.id}, Similarity: ${chunk.similarity}, Content: ${chunk.content.substring(0, 100)}...`,
        );
      });

      // Now apply threshold filter
      const similarChunks = allChunksWithSimilarity
        .filter((chunk) => chunk.similarity > 0.1)
        .slice(0, 5);

      console.log(
        "Found similar chunks above 0.1 threshold:",
        similarChunks.length,
      );
      console.log("Similar chunks data:", similarChunks);

      return similarChunks;
    }),

  saveChunk: publicProcedure
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

      // Save the chunk
      await ctx.db.insert(savedChunk).values({
        id: `saved_${ctx.user.id}_${input.chunkId}`,
        chunkId: input.chunkId,
        userId: ctx.user.id,
        query: input.query,
      });

      return { success: true };
    }),

  removeSavedChunk: publicProcedure
    .input(
      z.object({
        chunkId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      await ctx.db
        .delete(savedChunk)
        .where(
          sql`${savedChunk.chunkId} = ${input.chunkId} AND ${savedChunk.userId} = ${ctx.user.id}`,
        );

      return { success: true };
    }),

  getSavedChunks: publicProcedure.query(async ({ ctx }) => {
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
