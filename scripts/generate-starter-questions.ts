#!/usr/bin/env tsx
import "dotenv/config";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { starterQuestion } from "@/db/schema/podcast";

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY in environment.");
    process.exit(1);
  }

  const openrouter = createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer": "https://chatwithpodcast.com",
      "X-Title": "Chat with Podcasts",
    },
  });

  // Fetch episodes
  const episodes = await db.query.episode.findMany({
    orderBy: (e, { desc }) => [desc(e.createdAt)],
  });

  console.log(`Found ${episodes.length} episodes.`);

  for (const ep of episodes) {
    const existing = await db
      .select({ id: starterQuestion.id })
      .from(starterQuestion)
      .where(eq(starterQuestion.episodeId, ep.id));

    const existingCount = existing.length;
    if (existingCount >= 5) {
      console.log(
        `Skipping ${ep.title} — already has ${existingCount} questions.`,
      );
      continue;
    }

    const episodeTitle = ep.title ?? "this episode";
    const guest = ep.guest ? `Guest: ${ep.guest}.` : "";
    const series = ep.series ? `Series: ${ep.series}.` : "";

    const prompt = [
      `Generate 5 concise, clickable starter questions a user might ask after listening to a podcast episode.`,
      `Keep each question under 10 words, ending with a question mark.`,
      `Avoid duplicates, be specific to the episode context.`,
      `Episode title: ${episodeTitle}. ${guest} ${series}`,
    ].join("\n");

    try {
      const { object: questions } = await generateObject({
        // Use a solid OpenRouter model for JSON/object generation
        model: openrouter.chat("openai/gpt-4.1-mini"),
        output: "array",
        schema: z.string().min(5).max(120),
        prompt,
        maxRetries: 2,
        temperature: 0.2,
      });

      const list = (questions as string[]).slice(0, 5);

      if (!list.length) {
        console.warn(`No questions returned for ${episodeTitle}.`);
        continue;
      }

      const rows = list.map((q, i) => ({
        id: crypto.randomUUID(),
        episodeId: ep.id,
        question: q.trim(),
        rank: i + 1,
      }));

      await db.insert(starterQuestion).values(rows);
      console.log(
        `Inserted ${rows.length} starter questions for: ${episodeTitle}`,
      );
    } catch (err) {
      console.error(`Failed generating for ${episodeTitle}:`, err);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
