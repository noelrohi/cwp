import { judgeHybridBatch } from "@/server/lib/hybrid-judge";
import usmanData from "../usman-analysis.json";

interface Signal {
  id: string;
  content: string;
  action: string;
  relevanceScore: number;
  episodeTitle: string | null;
  podcastTitle: string | null;
  hasFlashcard?: boolean;
}

async function main() {
  // Get flashcard saves (S-tier) and low-score skips (clear negatives)
  const flashcardSaves = usmanData.saves.filter(
    (s) => s.hasFlashcard,
  ) as Signal[];
  const lowScoreSkips = usmanData.skips.filter(
    (s) => s.relevanceScore < 0.5,
  ) as Signal[];
  const highScoreSkips = usmanData.skips.filter(
    (s) => s.relevanceScore >= 0.6,
  ) as Signal[];

  console.log(`\n📊 DATA BREAKDOWN:`);
  console.log(`Flashcard saves (S-tier): ${flashcardSaves.length}`);
  console.log(`Low-score skips (<0.5): ${lowScoreSkips.length}`);
  console.log(
    `High-score skips (>=0.6): ${highScoreSkips.length} ← Label noise\n`,
  );

  // Test on original 30 signals: 15 saves + 15 skips
  const saves = usmanData.saves.slice(0, 15) as Signal[];
  const skips = usmanData.skips.slice(0, 15) as Signal[];

  console.log("\n" + "=".repeat(80));
  console.log("Testing 30 signals: 15 saves + 15 skips (threshold: 60)");
  console.log("=".repeat(80));

  // Batch process all signals
  const allSignals = [...saves, ...skips];
  const contents = allSignals.map((s) => s.content);

  console.log(`\nProcessing ${allSignals.length} signals...`);
  const startTime = Date.now();
  const results = await judgeHybridBatch(contents);
  const duration = Date.now() - startTime;

  console.log(`\nCompleted in ${(duration / 1000).toFixed(2)}s\n`);
  console.log("=".repeat(80));

  // Analyze results
  let saveCorrect = 0;
  let skipCorrect = 0;
  const threshold = 60; // Production threshold

  console.log("\n📊 SAVES (should score >= 60):");
  console.log("=".repeat(80));
  saves.forEach((signal, i) => {
    const result = results[i];
    const correct = result.score >= threshold;
    if (correct) saveCorrect++;

    console.log(`\n${i + 1}. ${signal.episodeTitle?.substring(0, 60)}...`);
    console.log(`   Score: ${result.score} ${correct ? "✅" : "❌"}`);
    console.log(
      `   Buckets: F:${result.buckets.frameworkClarity} N:${result.buckets.insightNovelty} T:${result.buckets.tacticalSpecificity} D:${result.buckets.reasoningDepth}`,
    );
    console.log(`   Content: ${signal.content.substring(0, 100)}...`);
  });

  console.log("\n\n📊 SKIPS (should score < 60):");
  console.log("=".repeat(80));
  skips.forEach((signal, i) => {
    const result = results[15 + i];
    const correct = result.score < threshold;
    if (correct) skipCorrect++;

    console.log(`\n${i + 1}. ${signal.episodeTitle?.substring(0, 60)}...`);
    console.log(`   Score: ${result.score} ${correct ? "✅" : "❌"}`);
    console.log(
      `   Buckets: F:${result.buckets.frameworkClarity} N:${result.buckets.insightNovelty} T:${result.buckets.tacticalSpecificity} D:${result.buckets.reasoningDepth}`,
    );
    console.log(`   Content: ${signal.content.substring(0, 100)}...`);
  });

  // Summary
  console.log("\n\n" + "=".repeat(80));
  console.log("📈 RESULTS SUMMARY");
  console.log("=".repeat(80));
  console.log(
    `\nSaves correct: ${saveCorrect}/15 (${((saveCorrect / 15) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Skips correct: ${skipCorrect}/15 (${((skipCorrect / 15) * 100).toFixed(1)}%)`,
  );
  console.log(
    `\nTotal accuracy: ${saveCorrect + skipCorrect}/30 (${(((saveCorrect + skipCorrect) / 30) * 100).toFixed(1)}%)`,
  );

  // Score distribution
  const saveScores = results.slice(0, 15).map((r) => r.score);
  const skipScores = results.slice(15).map((r) => r.score);

  console.log("\n📊 SCORE DISTRIBUTION");
  console.log("=".repeat(80));
  console.log(
    `Saves: median ${median(saveScores)}, range ${Math.min(...saveScores)}-${Math.max(...saveScores)}`,
  );
  console.log(
    `Skips: median ${median(skipScores)}, range ${Math.min(...skipScores)}-${Math.max(...skipScores)}`,
  );

  // False positives/negatives
  const falsePositives = skipScores.filter((s) => s >= threshold).length;
  const falseNegatives = saveScores.filter((s) => s < threshold).length;

  console.log("\n🎯 ERROR ANALYSIS");
  console.log("=".repeat(80));
  console.log(
    `False positives (skips scored >= ${threshold}): ${falsePositives}/15`,
  );
  console.log(
    `False negatives (saves scored < ${threshold}): ${falseNegatives}/15`,
  );
  console.log(`Precision: ${(((15 - falsePositives) / 15) * 100).toFixed(1)}%`);
  console.log(`Recall: ${(((15 - falseNegatives) / 15) * 100).toFixed(1)}%`);
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

main().catch(console.error);
