import { generateText } from "ai";
import { and, desc, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { openrouter } from "@/ai/models";
import { inngest } from "@/inngest/client";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  metaSignal,
  metaSignalQuote,
  transcriptChunk,
} from "@/server/db/schema";

const MIN_CONFIDENCE_THRESHOLD = 0.7;
const MIN_QUOTES_REQUIRED = 2;
const MAX_QUOTES_TO_CONSIDER = 10;

export const generateMetaSignalForEpisode = inngest.createFunction(
  {
    id: "generate-meta-signal-episode",
    name: "Generate Meta Signal for Episode",
    retries: 2,
  },
  { event: "meta-signal/generate.episode" },
  async ({ event, step }) => {
    const { episodeId, userId } = event.data;

    // Step 1: Get episode context
    const episodeData = await step.run("fetch-episode-context", async () => {
      const result = await db
        .select({
          id: episode.id,
          title: episode.title,
          creator: episode.creator,
          description: episode.description,
        })
        .from(episode)
        .where(eq(episode.id, episodeId))
        .limit(1);

      if (result.length === 0) {
        throw new Error(`Episode ${episodeId} not found`);
      }

      return result[0];
    });

    // Step 2: Get high-confidence signals
    const highConfidenceSignals = await step.run(
      "fetch-high-confidence-signals",
      async () => {
        const signals = await db
          .select({
            id: dailySignal.id,
            relevanceScore: dailySignal.relevanceScore,
            excerpt: dailySignal.excerpt,
            speakerName: dailySignal.speakerName,
            chunkId: dailySignal.chunkId,
            chunkContent: transcriptChunk.content,
            chunkSpeaker: transcriptChunk.speaker,
            chunkStartTimeSec: transcriptChunk.startTimeSec,
          })
          .from(dailySignal)
          .innerJoin(
            transcriptChunk,
            eq(dailySignal.chunkId, transcriptChunk.id),
          )
          .where(
            and(
              eq(transcriptChunk.episodeId, episodeId),
              eq(dailySignal.userId, userId),
              gte(dailySignal.relevanceScore, MIN_CONFIDENCE_THRESHOLD),
            ),
          )
          .orderBy(desc(dailySignal.relevanceScore))
          .limit(MAX_QUOTES_TO_CONSIDER);

        return signals;
      },
    );

    if (highConfidenceSignals.length < MIN_QUOTES_REQUIRED) {
      throw new Error(
        `Not enough high-confidence signals. Found ${highConfidenceSignals.length}, need at least ${MIN_QUOTES_REQUIRED}`,
      );
    }

    // Step 3: Use LLM to select and synthesize the best quotes
    const synthesis = await step.run("llm-synthesis", async () => {
      const quotesText = highConfidenceSignals
        .map(
          (s, i) =>
            `${i + 1}. [${(s.relevanceScore * 100).toFixed(0)}%] [${s.speakerName || s.chunkSpeaker || "Unknown"}]:
"${s.chunkContent.trim()}"`,
        )
        .join("\n\n");

      const prompt = `You are curating insight cards for senior executives in consulting and professional services - styled like Frame Break newsletter posts. Your goal is to create punchy, scannable, shareable content.

Episode: "${episodeData.title}"
${episodeData.creator ? `Guest: ${episodeData.creator}` : ""}
${episodeData.description ? `Context: ${episodeData.description.substring(0, 300)}` : ""}

High-Confidence Quotes (${highConfidenceSignals.length} available):
${quotesText}

Your task:
1. SELECT 2-4 quotes that together tell a coherent story
2. EXTRACT the best 1-2 sentence quote from each selected chunk (20-40 words) - find the most punchy, memorable part
3. SYNTHESIZE them into a Frame Break-style meta signal card

Output format (follow this EXACTLY):

SELECTED_QUOTES: [1,3,5]

EXTRACTED_QUOTES:
1. "The actual extracted quote here - punchy and concise"
2. "Another extracted quote - the best part of the chunk"
3. "Final extracted quote - memorable and specific"

**[Headline]**

[2-3 sentence synthesis in Frame Break style - narrative, concrete, with numbers/examples. Explain WHY this matters, not WHAT was said. Make it tweet-worthy.]

Guidelines:
- Headlines: 10 words max, punchy, insight-focused (not topic-focused)
- Extracted quotes: Find the BEST 1-2 sentences from each chunk - the money quote
- Synthesis: Write like Usman's Frame Break posts - concrete, specific, no buzzwords
- Use numbers and examples to make it immediately useful
- Avoid: "leverage", "synergy", "paradigm shift", generic business speak
- Think: What would make an executive forward this to their team?

Generate the meta signal card:`;

      const response = await generateText({
        model: openrouter("x-ai/grok-4-fast"),
        prompt,
        temperature: 0.7,
      });

      const text = response.text.trim();

      // Parse selected quotes
      const selectedMatch = text.match(/SELECTED_QUOTES:\s*\[([^\]]+)\]/);
      const selectedIndices = selectedMatch
        ? selectedMatch[1].split(",").map((n) => Number.parseInt(n.trim()) - 1)
        : [0, 1, 2]; // Default to first 3 if parsing fails

      // Parse extracted quotes section (using multiline matching)
      const extractedQuotesMatch = text.match(
        /EXTRACTED_QUOTES:([\s\S]*?)(?=\*\*|$)/,
      );
      const extractedQuotesText = extractedQuotesMatch
        ? extractedQuotesMatch[1].trim()
        : "";

      // Parse headline
      const headlineMatch = text.match(/\*\*(.+?)\*\*/);
      const headline = headlineMatch
        ? headlineMatch[1].trim()
        : "Untitled Meta Signal";

      // Parse summary (everything after headline, using multiline)
      const summaryMatch = text.match(/\*\*.+?\*\*\s*\n\n([\s\S]+)/);
      const summary = summaryMatch
        ? summaryMatch[1].trim()
        : "Unable to parse summary from LLM response";

      return {
        selectedQuoteIds: selectedIndices
          .filter((i) => i >= 0 && i < highConfidenceSignals.length)
          .map((i) => highConfidenceSignals[i].id),
        headline,
        summary,
        extractedQuotes: extractedQuotesText,
        rawOutput: text,
      };
    });

    // Step 4: Create or update meta signal
    const metaSignalRecord = await step.run("save-meta-signal", async () => {
      // Check if meta signal already exists
      const existing = await db
        .select()
        .from(metaSignal)
        .where(
          and(
            eq(metaSignal.episodeId, episodeId),
            eq(metaSignal.userId, userId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        const updated = await db
          .update(metaSignal)
          .set({
            title: synthesis.headline,
            summary: synthesis.summary,
            llmModel: "x-ai/grok-4-fast",
            llmPromptVersion: "v2-auto-select",
            updatedAt: new Date(),
          })
          .where(eq(metaSignal.id, existing[0].id))
          .returning();

        // Delete old quote associations
        await db
          .delete(metaSignalQuote)
          .where(eq(metaSignalQuote.metaSignalId, existing[0].id));

        return updated[0];
      }

      // Create new
      const id = nanoid();
      const created = await db
        .insert(metaSignal)
        .values({
          id,
          userId,
          episodeId,
          title: synthesis.headline,
          summary: synthesis.summary,
          status: "draft",
          llmModel: "x-ai/grok-4-fast",
          llmPromptVersion: "v2-auto-select",
        })
        .returning();

      return created[0];
    });

    // Step 5: Associate selected quotes with extracted text
    await step.run("save-quote-associations", async () => {
      // Parse extracted quotes from LLM output
      const extractedQuotesLines = synthesis.extractedQuotes
        .split("\n")
        .filter((line) => line.trim().match(/^\d+\.\s*"/));

      const extractedQuotesMap = new Map<number, string>();
      for (const line of extractedQuotesLines) {
        const match = line.match(/^(\d+)\.\s*"(.+)"$/);
        if (match) {
          const idx = Number.parseInt(match[1]) - 1;
          extractedQuotesMap.set(idx, match[2]);
        }
      }

      const quoteAssociations = synthesis.selectedQuoteIds.map(
        (quoteId, idx) => {
          // Get the original index from highConfidenceSignals
          const originalIdx = highConfidenceSignals.findIndex(
            (s) => s.id === quoteId,
          );
          const extractedQuote = extractedQuotesMap.get(originalIdx) || null;

          return {
            id: nanoid(),
            metaSignalId: metaSignalRecord.id,
            dailySignalId: quoteId,
            extractedQuote,
            sortOrder: idx,
          };
        },
      );

      if (quoteAssociations.length > 0) {
        await db.insert(metaSignalQuote).values(quoteAssociations);
      }
    });

    return {
      metaSignalId: metaSignalRecord.id,
      title: synthesis.headline,
      summary: synthesis.summary,
      quotesSelected: synthesis.selectedQuoteIds.length,
      totalQuotesConsidered: highConfidenceSignals.length,
    };
  },
);
