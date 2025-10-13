/**
 * Analyze Usman's save/skip patterns to understand what he values
 *
 * This will help us understand:
 * 1. Are his saves consistent? Do they share patterns?
 * 2. Why does he skip high-scoring chunks?
 * 3. What differentiates saves from skips?
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailySignal,
  episode,
  flashcard,
  podcast,
  savedChunk,
  transcriptChunk,
} from "@/server/db/schema";

const USMAN_USER_ID = "50MVpUIZfdsAAA9Qpl6Z42NuGYbyma2G";

interface AnalysisChunk {
  id: string;
  content: string;
  action: "saved" | "skipped";
  relevanceScore: number | null;
  episodeTitle: string | null;
  podcastTitle: string | null;
  hasFlashcard: boolean;
  savedAt?: Date;
  skippedAt?: Date;
}

async function main() {
  console.log("=".repeat(80));
  console.log("ANALYZING USMAN'S SAVE/SKIP PATTERNS");
  console.log("=".repeat(80));
  console.log();

  // Get all saved chunks with their details
  const saves = await db
    .select({
      chunkId: savedChunk.chunkId,
      content: transcriptChunk.content,
      relevanceScore: dailySignal.relevanceScore,
      episodeTitle: episode.title,
      podcastTitle: podcast.title,
      savedAt: savedChunk.savedAt,
      signalId: dailySignal.id,
    })
    .from(savedChunk)
    .innerJoin(transcriptChunk, eq(savedChunk.chunkId, transcriptChunk.id))
    .leftJoin(
      dailySignal,
      and(
        eq(dailySignal.chunkId, savedChunk.chunkId),
        eq(dailySignal.userId, USMAN_USER_ID),
      ),
    )
    .leftJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .leftJoin(podcast, eq(episode.podcastId, podcast.id))
    .where(eq(savedChunk.userId, USMAN_USER_ID))
    .orderBy(desc(savedChunk.savedAt))
    .limit(150);

  // Check which saves have flashcards (highest quality signal)
  const saveSignalIds = saves.filter((s) => s.signalId).map((s) => s.signalId!);

  const flashcards = await db
    .select({ signalId: flashcard.signalId })
    .from(flashcard)
    .where(
      and(
        eq(flashcard.userId, USMAN_USER_ID),
        inArray(flashcard.signalId, saveSignalIds),
      ),
    );

  const flashcardSignalIds = new Set(flashcards.map((f) => f.signalId));

  // Get skipped signals
  const skips = await db
    .select({
      chunkId: dailySignal.chunkId,
      content: transcriptChunk.content,
      relevanceScore: dailySignal.relevanceScore,
      episodeTitle: episode.title,
      podcastTitle: podcast.title,
      actionedAt: dailySignal.actionedAt,
    })
    .from(dailySignal)
    .innerJoin(transcriptChunk, eq(dailySignal.chunkId, transcriptChunk.id))
    .leftJoin(episode, eq(transcriptChunk.episodeId, episode.id))
    .leftJoin(podcast, eq(episode.podcastId, podcast.id))
    .where(
      and(
        eq(dailySignal.userId, USMAN_USER_ID),
        eq(dailySignal.userAction, "skipped"),
      ),
    )
    .orderBy(desc(dailySignal.actionedAt))
    .limit(150);

  console.log(`📊 DATA SUMMARY`);
  console.log(`   Saves: ${saves.length}`);
  console.log(`   Skips: ${skips.length}`);
  console.log(`   Saves with flashcards: ${flashcards.length}`);
  console.log();

  // Prepare data for analysis
  const savedChunks: AnalysisChunk[] = saves.map((s) => ({
    id: s.chunkId,
    content: s.content || "",
    action: "saved" as const,
    relevanceScore: s.relevanceScore,
    episodeTitle: s.episodeTitle,
    podcastTitle: s.podcastTitle,
    hasFlashcard: flashcardSignalIds.has(s.signalId || ""),
    savedAt: s.savedAt,
  }));

  const skippedChunks: AnalysisChunk[] = skips.map((s) => ({
    id: s.chunkId,
    content: s.content || "",
    action: "skipped" as const,
    relevanceScore: s.relevanceScore,
    episodeTitle: s.episodeTitle,
    podcastTitle: s.podcastTitle,
    hasFlashcard: false,
    skippedAt: s.actionedAt || undefined,
  }));

  // ANALYSIS 1: Score distribution
  console.log("=".repeat(80));
  console.log("📈 SCORE DISTRIBUTION ANALYSIS");
  console.log("=".repeat(80));
  console.log();

  const savedScores = savedChunks
    .filter((c) => c.relevanceScore !== null)
    .map((c) => c.relevanceScore!);

  const skippedScores = skippedChunks
    .filter((c) => c.relevanceScore !== null)
    .map((c) => c.relevanceScore!);

  if (savedScores.length > 0) {
    const avgSaved =
      savedScores.reduce((a, b) => a + b, 0) / savedScores.length;
    const minSaved = Math.min(...savedScores);
    const maxSaved = Math.max(...savedScores);

    console.log(`SAVED chunks (n=${savedScores.length}):`);
    console.log(`   Average score: ${(avgSaved * 100).toFixed(1)}%`);
    console.log(
      `   Range: ${(minSaved * 100).toFixed(1)}% - ${(maxSaved * 100).toFixed(1)}%`,
    );
    console.log();
  }

  if (skippedScores.length > 0) {
    const avgSkipped =
      skippedScores.reduce((a, b) => a + b, 0) / skippedScores.length;
    const minSkipped = Math.min(...skippedScores);
    const maxSkipped = Math.max(...skippedScores);

    console.log(`SKIPPED chunks (n=${skippedScores.length}):`);
    console.log(`   Average score: ${(avgSkipped * 100).toFixed(1)}%`);
    console.log(
      `   Range: ${(minSkipped * 100).toFixed(1)}% - ${(maxSkipped * 100).toFixed(1)}%`,
    );
    console.log();
  }

  // Check for high-scoring skips and low-scoring saves
  const highScoreSkips = skippedChunks.filter(
    (c) => c.relevanceScore !== null && c.relevanceScore > 0.6,
  );

  const lowScoreSaves = savedChunks.filter(
    (c) => c.relevanceScore !== null && c.relevanceScore < 0.4,
  );

  console.log(`⚠️  HIGH-SCORING SKIPS (score > 60%): ${highScoreSkips.length}`);
  console.log(`⚠️  LOW-SCORING SAVES (score < 40%): ${lowScoreSaves.length}`);
  console.log();

  // ANALYSIS 2: Content length patterns
  console.log("=".repeat(80));
  console.log("📏 CONTENT LENGTH ANALYSIS");
  console.log("=".repeat(80));
  console.log();

  const savedLengths = savedChunks.map((c) => c.content.split(/\s+/).length);
  const skippedLengths = skippedChunks.map(
    (c) => c.content.split(/\s+/).length,
  );

  const avgSavedLength =
    savedLengths.reduce((a, b) => a + b, 0) / savedLengths.length;
  const avgSkippedLength =
    skippedLengths.reduce((a, b) => a + b, 0) / skippedLengths.length;

  console.log(`SAVED: Average ${avgSavedLength.toFixed(0)} words`);
  console.log(`SKIPPED: Average ${avgSkippedLength.toFixed(0)} words`);
  console.log();

  // ANALYSIS 3: Show examples
  console.log("=".repeat(80));
  console.log("🎯 EXAMPLE ANALYSIS: TOP SAVES");
  console.log("=".repeat(80));
  console.log();

  // Show top flashcard saves (highest quality)
  const flashcardSaves = savedChunks.filter((c) => c.hasFlashcard).slice(0, 5);

  console.log(`📌 TOP 5 SAVES WITH FLASHCARDS (Usman memorized these):`);
  console.log();

  for (const [idx, chunk] of flashcardSaves.entries()) {
    console.log(
      `${idx + 1}. Score: ${chunk.relevanceScore ? `${(chunk.relevanceScore * 100).toFixed(1)}%` : "N/A"}`,
    );
    console.log(
      `   Source: ${chunk.podcastTitle || "Unknown"} - ${chunk.episodeTitle || "Unknown"}`,
    );
    console.log(`   Content: ${truncate(chunk.content, 200)}`);
    console.log();
  }

  // Show recent saves
  console.log(`📌 RECENT 5 SAVES:`);
  console.log();

  for (const [idx, chunk] of savedChunks.slice(0, 5).entries()) {
    console.log(
      `${idx + 1}. Score: ${chunk.relevanceScore ? `${(chunk.relevanceScore * 100).toFixed(1)}%` : "N/A"} ${chunk.hasFlashcard ? "⭐ FLASHCARD" : ""}`,
    );
    console.log(
      `   Source: ${chunk.podcastTitle || "Unknown"} - ${chunk.episodeTitle || "Unknown"}`,
    );
    console.log(`   Content: ${truncate(chunk.content, 200)}`);
    console.log();
  }

  // ANALYSIS 4: Show problematic examples
  console.log("=".repeat(80));
  console.log("⚠️  PROBLEMATIC PREDICTIONS");
  console.log("=".repeat(80));
  console.log();

  if (highScoreSkips.length > 0) {
    console.log(`❌ HIGH-SCORING CHUNKS THAT USMAN SKIPPED:`);
    console.log(`   (System thought these were good, but Usman disagreed)`);
    console.log();

    for (const [idx, chunk] of highScoreSkips.slice(0, 5).entries()) {
      console.log(
        `${idx + 1}. Score: ${(chunk.relevanceScore! * 100).toFixed(1)}% (skipped)`,
      );
      console.log(
        `   Source: ${chunk.podcastTitle || "Unknown"} - ${chunk.episodeTitle || "Unknown"}`,
      );
      console.log(`   Content: ${truncate(chunk.content, 200)}`);
      console.log();
    }
  }

  if (lowScoreSaves.length > 0) {
    console.log(`✅ LOW-SCORING CHUNKS THAT USMAN SAVED:`);
    console.log(`   (System thought these were bad, but Usman saved them)`);
    console.log();

    for (const [idx, chunk] of lowScoreSaves.slice(0, 5).entries()) {
      console.log(
        `${idx + 1}. Score: ${(chunk.relevanceScore! * 100).toFixed(1)}% (saved) ${chunk.hasFlashcard ? "⭐ FLASHCARD" : ""}`,
      );
      console.log(
        `   Source: ${chunk.podcastTitle || "Unknown"} - ${chunk.episodeTitle || "Unknown"}`,
      );
      console.log(`   Content: ${truncate(chunk.content, 200)}`);
      console.log();
    }
  }

  // ANALYSIS 5: Source analysis
  console.log("=".repeat(80));
  console.log("📚 SOURCE ANALYSIS");
  console.log("=".repeat(80));
  console.log();

  const savedPodcasts = new Map<string, number>();
  const skippedPodcasts = new Map<string, number>();

  for (const chunk of savedChunks) {
    const podcast = chunk.podcastTitle || "Unknown";
    savedPodcasts.set(podcast, (savedPodcasts.get(podcast) || 0) + 1);
  }

  for (const chunk of skippedChunks) {
    const podcast = chunk.podcastTitle || "Unknown";
    skippedPodcasts.set(podcast, (skippedPodcasts.get(podcast) || 0) + 1);
  }

  const topSavedPodcasts = Array.from(savedPodcasts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`TOP PODCASTS BY SAVES:`);
  for (const [podcast, count] of topSavedPodcasts) {
    const skipCount = skippedPodcasts.get(podcast) || 0;
    const saveRate = ((count / (count + skipCount)) * 100).toFixed(1);
    console.log(`   ${podcast}: ${count} saves (${saveRate}% save rate)`);
  }
  console.log();

  // ANALYSIS 6: Statistical patterns
  console.log("=".repeat(80));
  console.log("📊 PATTERN DETECTION");
  console.log("=".repeat(80));
  console.log();

  // Look for question marks (questions/curiosity)
  const savedWithQuestions = savedChunks.filter((c) =>
    c.content.includes("?"),
  ).length;
  const skippedWithQuestions = skippedChunks.filter((c) =>
    c.content.includes("?"),
  ).length;

  console.log(`Contains questions:`);
  console.log(
    `   Saved: ${((savedWithQuestions / savedChunks.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `   Skipped: ${((skippedWithQuestions / skippedChunks.length) * 100).toFixed(1)}%`,
  );
  console.log();

  // Look for numbers/data (evidence-based)
  const hasNumbers = (text: string) => /\d+/.test(text);
  const savedWithNumbers = savedChunks.filter((c) =>
    hasNumbers(c.content),
  ).length;
  const skippedWithNumbers = skippedChunks.filter((c) =>
    hasNumbers(c.content),
  ).length;

  console.log(`Contains numbers/data:`);
  console.log(
    `   Saved: ${((savedWithNumbers / savedChunks.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `   Skipped: ${((skippedWithNumbers / skippedChunks.length) * 100).toFixed(1)}%`,
  );
  console.log();

  // Look for contrarian signals
  const contrarianWords = [
    "but",
    "however",
    "actually",
    "really",
    "wrong",
    "myth",
    "misunderstand",
  ];
  const hasContrarian = (text: string) =>
    contrarianWords.some((word) => text.toLowerCase().includes(word));

  const savedContrarian = savedChunks.filter((c) =>
    hasContrarian(c.content),
  ).length;
  const skippedContrarian = skippedChunks.filter((c) =>
    hasContrarian(c.content),
  ).length;

  console.log(`Contrarian language (but, however, actually, wrong):`);
  console.log(
    `   Saved: ${((savedContrarian / savedChunks.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `   Skipped: ${((skippedContrarian / skippedChunks.length) * 100).toFixed(1)}%`,
  );
  console.log();

  // Export to JSON for deeper analysis
  const analysisData = {
    summary: {
      totalSaves: saves.length,
      totalSkips: skips.length,
      flashcardCount: flashcards.length,
      highScoreSkips: highScoreSkips.length,
      lowScoreSaves: lowScoreSaves.length,
    },
    saves: savedChunks.slice(0, 30),
    skips: skippedChunks.slice(0, 30),
    highScoreSkips: highScoreSkips.slice(0, 10),
    lowScoreSaves: lowScoreSaves.slice(0, 10),
    flashcardSaves: flashcardSaves,
  };

  // Write to file for manual review
  const fs = await import("node:fs");
  const path = await import("node:path");
  const outputPath = path.join(process.cwd(), "usman-analysis.json");
  fs.writeFileSync(outputPath, JSON.stringify(analysisData, null, 2));

  console.log("=".repeat(80));
  console.log(`✅ Full analysis exported to: ${outputPath}`);
  console.log("=".repeat(80));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

main()
  .then(() => {
    console.log("\n✅ Analysis complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
