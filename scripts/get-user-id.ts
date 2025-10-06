/**
 * Quick script to get user IDs from the database
 * Run with: pnpm tsx scripts/get-user-id.ts
 */

import { desc, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user, userPreferences } from "@/server/db/schema";

async function main() {
  console.log("Fetching users with signal activity...\n");

  const users = await db
    .select({
      userId: userPreferences.userId,
      email: user.email,
      name: user.name,
      totalSaved: userPreferences.totalSaved,
      totalSkipped: userPreferences.totalSkipped,
      lastUpdated: userPreferences.lastUpdated,
    })
    .from(userPreferences)
    .innerJoin(user, sql`${userPreferences.userId} = ${user.id}`)
    .orderBy(desc(userPreferences.totalSaved));

  if (users.length === 0) {
    console.log("No users found with preferences");
    return;
  }

  console.log("Users with Signal Activity:");
  console.log("=".repeat(100));
  console.log(
    "Email".padEnd(40) +
      "| User ID".padEnd(30) +
      "| Saves | Skips | Last Updated",
  );
  console.log("-".repeat(100));

  for (const u of users) {
    const email = (u.email || u.name || "Unknown").substring(0, 38);
    const lastUpdate = u.lastUpdated
      ? new Date(u.lastUpdated).toLocaleDateString()
      : "N/A";

    console.log(
      email.padEnd(40) +
        "| " +
        u.userId.padEnd(28) +
        "| " +
        u.totalSaved.toString().padStart(5) +
        " | " +
        u.totalSkipped.toString().padStart(5) +
        " | " +
        lastUpdate,
    );
  }

  console.log("=".repeat(100));
  console.log(`\nTotal users: ${users.length}`);

  // Find the most active user
  const mostActive = users[0];
  if (mostActive) {
    console.log(`\nMost active user: ${mostActive.email || mostActive.name}`);
    console.log(`User ID: ${mostActive.userId}`);
    console.log(`\nRun validation with:`);
    console.log(
      `pnpm tsx scripts/validate-contrastive-learning.ts ${mostActive.userId}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
