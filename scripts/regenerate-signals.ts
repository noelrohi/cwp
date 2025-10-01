import { inngest } from "../src/inngest/client";

const userId = process.argv[2];

if (!userId) {
  console.error("Usage: pnpm tsx scripts/regenerate-signals.ts <userId>");
  process.exit(1);
}

async function main() {
  await inngest.send({
    name: "app/daily-intelligence.user.generate-signals",
    data: {
      pipelineRunId: `manual-test-${Date.now()}`,
      userId,
      lookbackStart: new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
  });

  console.log(`✅ Triggered signal generation for user ${userId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
