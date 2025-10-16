import { fetchReadwiseDocuments } from "@/lib/readwise";

const token = process.argv[2];

if (!token) {
  console.error("Usage: pnpm tsx scripts/test-readwise-api.ts <access-token>");
  process.exit(1);
}

async function main() {
  console.log("Testing Readwise API v3...\n");

  console.log("1. Fetching ALL documents (no date filter):");
  console.log("=".repeat(80));

  const allDocuments = await fetchReadwiseDocuments(token, {
    limit: 100,
  });

  console.log(`\nTotal documents returned: ${allDocuments.length}\n`);

  if (allDocuments.length > 0) {
    console.log("Sample documents:");
    for (const doc of allDocuments.slice(0, 3)) {
      console.log("\n" + "-".repeat(80));
      console.log(`ID: ${doc.id}`);
      console.log(`Title: ${doc.title}`);
      console.log(`Author: ${doc.author || "N/A"}`);
      console.log(`Source: ${doc.source}`);
      console.log(`Category: ${doc.category}`);
      console.log(`Location: ${doc.location}`);
      console.log(`Updated: ${doc.updated_at}`);
      console.log(`Saved: ${doc.saved_at}`);
      console.log(`Summary: ${doc.summary.slice(0, 100)}...`);
      console.log(`URL: ${doc.source_url || "N/A"}`);
      console.log(`Notes: ${doc.notes || "N/A"}`);
      console.log(
        `HTML Content: ${doc.html_content ? `${doc.html_content.slice(0, 200)}...` : "N/A"}`,
      );
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("2. Testing with date filter (updated after 2025-10-16):");
  console.log("=".repeat(80));

  const filteredDocuments = await fetchReadwiseDocuments(token, {
    limit: 100,
    updatedAfter: new Date("2025-10-16T04:30:32.620Z"),
  });

  console.log(`\nDocuments with filter: ${filteredDocuments.length}`);

  console.log("\n" + "=".repeat(80));
  console.log("Summary:");
  console.log("=".repeat(80));
  console.log(`All documents: ${allDocuments.length}`);
  console.log(
    `Filtered documents (after 2025-10-16): ${filteredDocuments.length}`,
  );
  console.log(
    "\nThis shows why your sync returned 0 results - the date filter is excluding everything!",
  );
}

main().catch(console.error);
