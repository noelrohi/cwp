import { hybridScore } from "../src/server/lib/hybrid-scoring";

const signal3 = `love about this, and this is why it's so important because and I mentioned this on the episode. I made it on you. But there's this this engineer turned founder, Sidney Harman. You know the company Harman Kardon? Yeah, sure. Yeah. So he has a great line. He said that the founder is the guardian of the company's soul, that it's impossible to separate, you know, the creation from the creator. And I think over time, like the I resemble that. Goddamn right you do. This is also, again, how abnormal we are. Used I to say it's like you need to build a business that's authentic to you. And then in this book, Lee was, you know, talking about he was only able to last four years, think.`;

async function main() {
  const result = await hybridScore(signal3);
  console.log("\n📊 Signal 3: Guardian of company's soul");
  console.log("Score:", result.rawScore);
  console.log("Pass:", result.pass ? "SAVE" : "SKIP");
  console.log("\n🧠 Full LLM Reasoning:");
  console.log(result.diagnostics.llm?.reasoning);

  console.log("\n📊 Buckets:");
  console.log(JSON.stringify(result.diagnostics.llm?.buckets, null, 2));
}

main();
