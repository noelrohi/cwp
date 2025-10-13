import { extractHeuristicBuckets } from "../src/server/lib/hybrid-heuristics";

// From Usman's actual skips (high score but skipped)
const highScoreSkip = `And the underlying incentives of customers are not always financial. Sometimes it's ego. Sometimes it's career growth. Right? If you're selling enterprise software to someone, there's an executive sponsor as an example. That person needs to trust that you're going to do a good job for them. How do you get them to jump with you on this like big project? Well that's part of the journey of like not just the product but what do they need to hear from us? What do we need to supply them? What do we need to do to actually unlock the opportunity to implement the product? So I think there's like an incentives alignment baseline. Like I'm a big believer that like, it's cliche but show me the incentive and I'll show you the outcome. I think that's absolutely true. And even when customers will tell you things like I'll give you an example.`;

// From Usman's actual saves (with flashcard)
const actualSave = `The only thing that comes from is just pure ego. I think a lot of entrepreneurs, like, their ego gets in the way, and so they want they almost intentionally overcomplicate it to show how special the product is, therefore how special they are. And the best entrepreneurs I've always met are the ones who take incredibly complex ideas and simplify it down, and then it's easy for consumers to get it, for their teams to execute. And I think that that that art form of simplification is the the biggest hack in entrepreneurship. And, yeah, the the number of pitches I sit through, and, like, I'm like, you're intentionally overcomplicating this to to justify evaluation or justify your specialness?`;

console.log("=== REAL WORLD COMPARISON ===\n");

console.log("HIGH-SCORE SKIP (Usman skipped at 68% score):");
const resultSkip = extractHeuristicBuckets(highScoreSkip);
console.log(`Score: ${Math.round(resultSkip.overallScore * 100)}`);
console.log(`Buckets: F:${resultSkip.frameworkScore.toFixed(2)} I:${resultSkip.insightScore.toFixed(2)} S:${resultSkip.specificityScore.toFixed(2)} Q:${resultSkip.qualityScore.toFixed(2)}`);
console.log(`Top reasons:`, resultSkip.reasons.slice(0, 3).join(" | "));

console.log("\n\nACTUAL SAVE (Usman saved with flashcard at 62%):");
const resultSave = extractHeuristicBuckets(actualSave);
console.log(`Score: ${Math.round(resultSave.overallScore * 100)}`);
console.log(`Buckets: F:${resultSave.frameworkScore.toFixed(2)} I:${resultSave.insightScore.toFixed(2)} S:${resultSave.specificityScore.toFixed(2)} Q:${resultSave.qualityScore.toFixed(2)}`);
console.log(`Top reasons:`, resultSave.reasons.slice(0, 3).join(" | "));

console.log("\n\n=== ANALYSIS ===");
console.log(`Skip should score LOWER than save. Current: Skip=${Math.round(resultSkip.overallScore * 100)} vs Save=${Math.round(resultSave.overallScore * 100)}`);
console.log(`Target: Skip ~40-50, Save ~60-70`);
