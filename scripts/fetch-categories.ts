#!/usr/bin/env tsx

import { db } from "@/db";
import { category } from "@/db/schema/podcast";

interface Category {
  category_id: string;
  category_name: string;
  category_display_name: string;
}

interface CategoriesResponse {
  categories: Category[];
}

async function fetchCategories(bearerToken: string): Promise<void> {
  try {
    console.log("Fetching categories from Podscan API...");

    const response = await fetch("https://podscan.fm/api/v1/categories", {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data: CategoriesResponse = await response.json();

    console.log(`Found ${data.categories.length} categories`);

    for (const cat of data.categories) {
      try {
        await db
          .insert(category)
          .values({
            id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            categoryId: cat.category_id,
            categoryName: cat.category_name,
            categoryDisplayName: cat.category_display_name,
          })
          .onConflictDoUpdate({
            target: category.categoryId,
            set: {
              categoryName: cat.category_name,
              categoryDisplayName: cat.category_display_name,
              updatedAt: new Date(),
            },
          });

        console.log(
          `✓ Inserted/Updated category: ${cat.category_display_name}`,
        );
      } catch (dbError) {
        console.error(`Failed to insert category ${cat.category_id}:`, dbError);
      }
    }

    console.log(
      `\nSuccessfully processed ${data.categories.length} categories`,
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error("Usage: tsx scripts/fetch-categories.ts <bearer_token>");
    console.error("Example: tsx scripts/fetch-categories.ts your_bearer_token");
    process.exit(1);
  }

  const [bearerToken] = args;

  await fetchCategories(bearerToken);
}

main().catch(console.error);
