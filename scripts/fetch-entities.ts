#!/usr/bin/env tsx

import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  book,
  company,
  episode,
  episodeBook,
  episodeCompany,
  episodePerson,
  episodeTopic,
  person,
  topic,
} from "@/db/schema/podcast";

interface EntityItem {
  id: string;
  name: string;
  type: string;
  metadata: string[];
}

interface EpisodeEntitiesResponse {
  episode_id: string;
  entities?: {
    hosts?: EntityItem[];
    guests?: EntityItem[];
    sponsors?: EntityItem[];
    producers?: EntityItem[];
    topics?: EntityItem[];
    companies?: EntityItem[];
    books?: EntityItem[];
    locations?: EntityItem[];
    products?: EntityItem[];
  };
}

async function fetchEntities(
  episodeId: string,
  bearerToken: string,
): Promise<void> {
  try {
    console.log(`Fetching entities for episode: ${episodeId}`);

    const response = await fetch(
      `https://podscan.fm/api/v1/episodes/${episodeId}/entities`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data: EpisodeEntitiesResponse = await response.json();

    // Log basic response info for debugging
    console.log(`  📊 Response structure:`, {
      episode_id: data.episode_id,
      has_entities: !!data.entities,
      entity_types: data.entities ? Object.keys(data.entities) : [],
    });

    // Check if entities object exists
    if (!data.entities) {
      console.log(`⚠️  No entities object in response for episode ${episodeId}`);
      return;
    }

    // Get the episode database ID
    const episodeRecord = await db
      .select({ id: episode.id })
      .from(episode)
      .where(eq(episode.episodeId, episodeId))
      .limit(1);

    if (episodeRecord.length === 0) {
      console.error(`Episode ${episodeId} not found in database`);
      return;
    }

    const episodeDbId = episodeRecord[0].id;

    // Safely count total entities with fallbacks
    const totalEntities =
      (data.entities.hosts?.length || 0) +
      (data.entities.guests?.length || 0) +
      (data.entities.sponsors?.length || 0) +
      (data.entities.producers?.length || 0) +
      (data.entities.topics?.length || 0) +
      (data.entities.companies?.length || 0) +
      (data.entities.books?.length || 0) +
      (data.entities.locations?.length || 0) +
      (data.entities.products?.length || 0);

    console.log(`Found ${totalEntities} entities for episode ${episodeId}`);

    // Process each entity type safely
    if (data.entities.hosts && data.entities.hosts.length > 0) {
      await processHosts(data.entities.hosts, episodeDbId);
    }
    if (data.entities.guests && data.entities.guests.length > 0) {
      await processGuests(data.entities.guests, episodeDbId);
    }
    if (data.entities.sponsors && data.entities.sponsors.length > 0) {
      await processSponsors(data.entities.sponsors, episodeDbId);
    }
    if (data.entities.producers && data.entities.producers.length > 0) {
      await processProducers(data.entities.producers, episodeDbId);
    }
    if (data.entities.topics && data.entities.topics.length > 0) {
      await processTopics(data.entities.topics, episodeDbId);
    }
    if (data.entities.companies && data.entities.companies.length > 0) {
      await processCompanies(data.entities.companies, episodeDbId);
    }
    if (data.entities.books && data.entities.books.length > 0) {
      await processBooks(data.entities.books, episodeDbId);
    }
    // Note: locations and products could be added to schema if needed

    console.log(
      `✅ Processed ${totalEntities} entities for episode ${episodeId}`,
    );
  } catch (error) {
    console.error("Error fetching entities:", error);
    throw error;
  }
}

async function processHosts(
  hosts: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const host of hosts) {
    await processPerson(host, episodeDbId, "host");
  }
}

async function processGuests(
  guests: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const guest of guests) {
    await processPerson(guest, episodeDbId, "guest");
  }
}

async function processSponsors(
  sponsors: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const sponsor of sponsors) {
    await processCompanyEntity(sponsor, episodeDbId, "sponsor");
  }
}

async function processProducers(
  producers: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const producer of producers) {
    await processPerson(producer, episodeDbId, "producer");
  }
}

async function processTopics(
  topics: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const topicEntity of topics) {
    await processTopicEntity(topicEntity, episodeDbId);
  }
}

async function processCompanies(
  companies: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const companyEntity of companies) {
    await processCompanyEntity(companyEntity, episodeDbId, "mentioned");
  }
}

async function processBooks(
  books: EntityItem[],
  episodeDbId: string,
): Promise<void> {
  for (const bookEntity of books) {
    await processBookEntity(bookEntity, episodeDbId);
  }
}

async function processPerson(
  entity: EntityItem,
  episodeDbId: string,
  role: string,
): Promise<void> {
  // Insert or get person
  const personId = `person_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await db
    .insert(person)
    .values({
      id: personId,
      name: entity.name,
      bio: entity.metadata.join(", ") || null,
    })
    .onConflictDoNothing();

  // Link person to episode
  await db
    .insert(episodePerson)
    .values({
      id: `ep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      episodeId: episodeDbId,
      personId: personId,
      role: role,
    })
    .onConflictDoNothing();

  console.log(`  ✓ Person: ${entity.name} (${role})`);
}

async function processCompanyEntity(
  entity: EntityItem,
  episodeDbId: string,
  mentionType: string,
): Promise<void> {
  // Insert or get company
  const companyId = `company_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await db
    .insert(company)
    .values({
      id: companyId,
      name: entity.name,
      description: entity.metadata.join(", ") || null,
    })
    .onConflictDoNothing();

  // Link company to episode
  await db
    .insert(episodeCompany)
    .values({
      id: `ec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      episodeId: episodeDbId,
      companyId: companyId,
      mentionType: mentionType,
    })
    .onConflictDoNothing();

  console.log(`  ✓ Company: ${entity.name} (${mentionType})`);
}

async function processTopicEntity(
  entity: EntityItem,
  episodeDbId: string,
): Promise<void> {
  // Insert or get topic
  const topicId = `topic_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await db
    .insert(topic)
    .values({
      id: topicId,
      name: entity.name,
      description: entity.metadata.join(", ") || null,
    })
    .onConflictDoNothing();

  // Link topic to episode
  await db
    .insert(episodeTopic)
    .values({
      id: `et_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      episodeId: episodeDbId,
      topicId: topicId,
      relevanceScore: null, // Not provided in this API format
    })
    .onConflictDoNothing();

  console.log(`  ✓ Topic: ${entity.name}`);
}

async function processBookEntity(
  entity: EntityItem,
  episodeDbId: string,
): Promise<void> {
  // Extract author from metadata if available
  const author = entity.metadata.length > 0 ? entity.metadata[0] : "Unknown";

  // Insert or get book
  const bookId = `book_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await db
    .insert(book)
    .values({
      id: bookId,
      title: entity.name,
      author: author,
      description: entity.metadata.join(", ") || null,
    })
    .onConflictDoNothing();

  // Link book to episode
  await db
    .insert(episodeBook)
    .values({
      id: `eb_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      episodeId: episodeDbId,
      bookId: bookId,
      mentionContext: entity.metadata.join(", ") || null,
    })
    .onConflictDoNothing();

  console.log(`  ✓ Book: ${entity.name} by ${author}`);
}

async function fetchAllEntities(bearerToken: string): Promise<void> {
  try {
    console.log("Fetching entities for all episodes...");

    // Get all episodes that have transcripts
    const episodes = await db
      .select({
        id: episode.id,
        episodeId: episode.episodeId,
        episodeTitle: episode.episodeTitle,
      })
      .from(episode)
      .where(isNull(episode.episodeTranscript)) // Only process episodes with transcripts
      .limit(20); // Process in batches

    console.log(`Found ${episodes.length} episodes to process`);

    for (const ep of episodes) {
      console.log(`\nProcessing: ${ep.episodeTitle}`);
      try {
        await fetchEntities(ep.episodeId, bearerToken);
      } catch (error) {
        console.error(`Failed to process episode ${ep.episodeId}:`, error);
      }

      // Add delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`\n✅ Completed processing ${episodes.length} episodes`);
  } catch (error) {
    console.error("Error fetching entities:", error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage:");
    console.error(
      "  Fetch single episode: tsx scripts/fetch-entities.ts <episode_id> <bearer_token>",
    );
    console.error(
      "  Fetch all episodes:   tsx scripts/fetch-entities.ts --all <bearer_token>",
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  tsx scripts/fetch-entities.ts ep_eb98jygz6d2njmga your_bearer_token",
    );
    console.error("  tsx scripts/fetch-entities.ts --all your_bearer_token");
    process.exit(1);
  }

  if (args[0] === "--all") {
    if (args.length !== 2) {
      console.error(
        "Usage: tsx scripts/fetch-entities.ts --all <bearer_token>",
      );
      process.exit(1);
    }
    await fetchAllEntities(args[1]);
  } else {
    if (args.length !== 2) {
      console.error(
        "Usage: tsx scripts/fetch-entities.ts <episode_id> <bearer_token>",
      );
      process.exit(1);
    }

    const [episodeId, bearerToken] = args;

    if (!episodeId.startsWith("ep_")) {
      console.error('Error: Episode ID should start with "ep_"');
      process.exit(1);
    }

    await fetchEntities(episodeId, bearerToken);
  }
}

main().catch(console.error);
