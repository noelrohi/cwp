/**
 * Test Grok-4-fast scoring on all 30 Delta signals
 */

import "dotenv/config";
import { generateEmbedding } from "@/lib/embedding";
import { hybridScoreBatchWithNovelty } from "@/server/lib/hybrid-scoring";

const DELTA_SIGNALS = [
  {
    id: 1,
    oldScore: 40,
    content: `Schedule, utility was kind of a distant second. And third was loyalty, whatever that meant, but price was the dominant driver. I'm proud to say almost thirty years later, there's no question Delta, the number one driver of why people buy Delta is because it's Delta and people want service and the reliability, you know the service that our great people provide and they're willing to pay a premium. On average people pay a 20% premium to be on Delta versus the industry at large. Not every flight, not every day, that's an average by the way, every flight every day, but there's some differences in there based on who we're competing with and the priorities those customers have.`,
  },
  {
    id: 2,
    oldScore: 32,
    content: `own people or your customers or your government or the media, when you're always standing what you're for and then people can say okay well I understand why he said that or why he did that. I mean because it's what he has told us repeatedly. You sort of led into, you're now in your second hundred years or you're entering into the second hundred years. Describe a little bit about, as you think about the industry itself and where it is today and as it looks forward, what are some of the big forces you talked about international, you talked about geopolitics that you're having to navigate as you think about setting Delta up for the next hundred?`,
  },
  {
    id: 3,
    oldScore: 30,
    content: `They have questions, you have answers, and if you say I don't know that doesn't necessarily inspire confidence and help you in terms of the success. But it's important when you are honest though, and you have that willingness to be vulnerable, and you have a willingness not to say I don't know, but have confidence in saying but we're going to figure it out and I'm going to figure it out. And it's really hard. I think it's one of the hardest things as a new leader is to say I don't know. And whether it's with your board, because your board and there's very few people, I'm sure in their first few board meetings, they'll get questions and the sales, I don't know. They're going to come up with stuff. They'll talk around it and they'll try to hope somebody changes the topic or your own employees. Then that vulnerability builds trust. It builds, you know, courage because that's what people want to say and authenticity and humility. You know, no one wants to follow someone that has all the answers. They to follow someone that they feel they're going`,
  },
  {
    id: 4,
    oldScore: 30,
    content: `And it was a humbling moment, really humbling moment. And coming through that, again, so you think about where you are today for twenty years, a while. You know, the one thing that we did with our employees, our employees had to take, you know, we had large pay cuts and furloughs and just painful, painful stuff. You know, I promised them that when we get through this and we will get through it and we'll once again be profitable, they'll get 15% of the profits. And we just said we're going to do it and we've maintained that. And over the last decade we've paid our employees, and management doesn't get any part of this but all our frontline employees including our pilots, we've paid them I think 12, probably closer to $15,000,000,000 over the last decade of profit sharing.`,
  },
  {
    id: 5,
    oldScore: 30,
    content: `Well, one of the things that was clear and it wasn't solely me, took it and brought it to the next level, was that we knew in our industry we had to be able to distinguish our product and service. It's a really tough industry. And one of the reasons it's a tough industry is that it's been seen very much as a commodity, as people didn't have a real loyalty per se. I'm going back, I mean, we've changed it a few years ago and it's because the reliability wasn't there, the scale wasn't there, was very fragmented. And airlines were seen more as utility. And when I joined the industry almost thirty years ago, we look at the top reasons to purchase drivers and price was always number one.`,
  },
  {
    id: 16,
    oldScore: 20,
    content: `But that took years to develop to get to that point, and we had to go in and we had to rebuild the infrastructure and the reliability and the experience. I remember after buying Northwest fifteen years ago, our first year, and we had like 6,000 cancellations for maintenance alone. Purely avoidable stuff. And that was like three days of our entire year was cancelled because of maintenance. Putting all these things together we said the first thing we're going do is we have to cancel cancellations and we've effectively done You really have. You really have. Now it's such a small number, in fact in 2019, because the pandemic messed things up for a bit, 2019 last year, that six thousand number in 2019 was sixty. And so that's what we had to build into first and foremost. And by the way, it took a number of years and a lot of technology and predictive maintenance technologies and tools and engineering support. And then you have to get to a point where your people, your flight attendants, our pilots really believe that same level of reliability before the customers are going to believe it. And so, and then getting your employees on board. And that was a series of years. And then I took over at the start of 2016.`,
  },
];

async function main() {
  console.log("🧪 Testing Grok-4-fast on Delta Signals\n");
  console.log("Generating embeddings for all signals...");

  const TEST_USER_ID = "test_user_delta_demo";

  // Generate embeddings for all signals
  const items = await Promise.all(
    DELTA_SIGNALS.map(async (signal) => ({
      content: signal.content,
      embedding: await generateEmbedding(signal.content),
    })),
  );

  console.log("Scoring with Grok-4-fast + novelty detection...\n");

  const results = await hybridScoreBatchWithNovelty(items, TEST_USER_ID);

  console.log("=".repeat(100));
  console.log("RESULTS");
  console.log("=".repeat(100));
  console.log();

  for (let i = 0; i < DELTA_SIGNALS.length; i++) {
    const signal = DELTA_SIGNALS[i];
    const result = results[i];
    const diff = result.rawScore - signal.oldScore;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

    console.log(`Signal ${signal.id}:`);
    console.log(`  Old Score: ${signal.oldScore}%`);
    console.log(`  New Score: ${result.rawScore}% (${diffStr})`);
    console.log(`  Method: ${result.method}`);

    if (result.diagnostics.llm) {
      const buckets = result.diagnostics.llm.buckets;
      console.log(
        `  Buckets: F=${buckets.frameworkClarity} I=${buckets.insightNovelty} T=${buckets.tacticalSpecificity} R=${buckets.reasoningDepth}`,
      );
      console.log(
        `  Reasoning: ${result.diagnostics.llm.reasoning.substring(0, 200)}...`,
      );
    }

    if (result.diagnostics.novelty) {
      console.log(
        `  Novelty: adjustment=${result.diagnostics.novelty.adjustment}, clusterSize=${result.diagnostics.novelty.clusterSize}`,
      );
    }

    console.log();
  }

  // Summary stats
  console.log("=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));

  const oldScores = DELTA_SIGNALS.map((s) => s.oldScore);
  const newScores = results.map((r) => r.rawScore);

  const oldAvg = oldScores.reduce((a, b) => a + b, 0) / oldScores.length;
  const newAvg = newScores.reduce((a, b) => a + b, 0) / newScores.length;

  const oldMin = Math.min(...oldScores);
  const oldMax = Math.max(...oldScores);
  const newMin = Math.min(...newScores);
  const newMax = Math.max(...newScores);

  console.log(`\nOld System:`);
  console.log(`  Range: ${oldMin}% - ${oldMax}%`);
  console.log(`  Average: ${oldAvg.toFixed(1)}%`);
  console.log(`  Spread: ${oldMax - oldMin}%`);

  console.log(`\nNew System (Grok-4-fast):`);
  console.log(`  Range: ${newMin}% - ${newMax}%`);
  console.log(`  Average: ${newAvg.toFixed(1)}%`);
  console.log(`  Spread: ${newMax - newMin}%`);

  const improvements = results.filter(
    (r, i) => r.rawScore > DELTA_SIGNALS[i].oldScore,
  ).length;
  const declines = results.filter(
    (r, i) => r.rawScore < DELTA_SIGNALS[i].oldScore,
  ).length;
  const same = results.filter(
    (r, i) => r.rawScore === DELTA_SIGNALS[i].oldScore,
  ).length;

  console.log(`\nScore Changes:`);
  console.log(`  Improved: ${improvements}/${DELTA_SIGNALS.length}`);
  console.log(`  Declined: ${declines}/${DELTA_SIGNALS.length}`);
  console.log(`  Same: ${same}/${DELTA_SIGNALS.length}`);

  // Highlight signals that should be saves (>= 60%)
  console.log(`\nSignals >= 60% (Save Threshold):`);
  results.forEach((r, i) => {
    if (r.rawScore >= 60) {
      console.log(
        `  Signal ${DELTA_SIGNALS[i].id}: ${r.rawScore}% (was ${DELTA_SIGNALS[i].oldScore}%)`,
      );
    }
  });
}

main().catch(console.error);
