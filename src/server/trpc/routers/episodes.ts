import { createClient } from "@deepgram/sdk";
import { put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { episode } from "@/server/db/schema";
import { createTRPCRouter, publicProcedure } from "../init";

export const episodesRouter = createTRPCRouter({
  get: publicProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const episodeData = await ctx.db.query.episode.findFirst({
        where: eq(episode.id, input.episodeId),
        with: {
          podcast: true,
        },
      });

      if (!episodeData) {
        throw new Error("Episode not found");
      }

      return episodeData;
    }),

  getUnprocessed: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          status: z.enum(["pending", "processing", "failed"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const status = input?.status ?? "pending";

      const rows = await ctx.db.query.episode.findMany({
        where: (episodes, { eq }) => eq(episodes.status, status),
        limit,
        orderBy: [desc(episode.publishedAt)],
        with: {
          podcast: true,
        },
      });

      return rows;
    }),

  generateTranscript: publicProcedure
    .input(
      z.object({
        episodeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const episodeData = await ctx.db.query.episode.findFirst({
        where: eq(episode.id, input.episodeId),
      });

      if (!episodeData) {
        throw new Error("Episode not found");
      }

      if (!episodeData.audioUrl) {
        throw new Error("Episode has no audio URL");
      }

      if (episodeData.transcriptUrl) {
        throw new Error("Episode already has a transcript");
      }

      try {
        // Update status to processing
        await ctx.db
          .update(episode)
          .set({ status: "processing" })
          .where(eq(episode.id, input.episodeId));

        // Transcribe with Deepgram
        console.log(`Transcribing audio for episode ${input.episodeId}...`);

        // Transcribe using Deepgram SDK directly
        const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
        if (!deepgramApiKey) {
          throw new Error("DEEPGRAM_API_KEY environment variable is not set");
        }
        const deepgram = createClient(deepgramApiKey);
        const { result, error } =
          await deepgram.listen.prerecorded.transcribeUrl(
            { url: episodeData.audioUrl },
            {
              model: "nova-3",
              language: "en",
              smart_format: true,
              punctuate: true,
              paragraphs: true,
              diarize: true,
              utterances: true,
            },
          );

        if (error) {
          throw new Error(`Deepgram transcription failed: ${error.message}`);
        }

        const jsonContent = JSON.stringify(result.results.utterances);

        console.log(jsonContent);

        // Upload transcript as JSON to preserve all metadata
        console.log(`Uploading transcript for episode ${input.episodeId}...`);
        const blob = await put(
          `transcripts/${input.episodeId}-${Date.now().toString()}.json`,
          jsonContent,
          {
            access: "public",
            contentType: "application/json",
          },
        );

        // Update episode with transcript URL and mark as processed
        await ctx.db
          .update(episode)
          .set({
            transcriptUrl: blob.url,
            status: "processed",
          })
          .where(eq(episode.id, input.episodeId));

        return {
          success: true,
          transcriptUrl: blob.url,
          duration: result.metadata.duration,
        };
      } catch (error) {
        console.error(
          `Failed to generate transcript for episode ${input.episodeId}:`,
          error,
        );

        // Mark episode as failed
        await ctx.db
          .update(episode)
          .set({ status: "failed" })
          .where(eq(episode.id, input.episodeId));

        throw error;
      }
    }),
});
