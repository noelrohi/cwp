import { recomputeUserCentroid } from "@/inngest/functions/continuous-learning";
import { db } from "@/server/db";
import { userPreferences } from "@/server/db/schema";

async function main(): Promise<void> {
  const users = await db
    .select({ userId: userPreferences.userId })
    .from(userPreferences);

  if (users.length === 0) {
    console.log("No user preferences found to backfill.");
    return;
  }

  let processed = 0;

  for (const user of users) {
    await recomputeUserCentroid(user.userId);
    processed++;
  }

  console.log(`Backfilled centroids for ${processed} users.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to backfill user preferences", error);
    process.exit(1);
  });
