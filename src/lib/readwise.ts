import TurndownService from "turndown";

const READWISE_API_BASE_V2 = "https://readwise.io/api/v2";
const READWISE_API_BASE_V3 = "https://readwise.io/api/v3";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export type ReadwiseDocument = {
  id: string;
  url: string;
  source_url: string | null;
  title: string;
  author: string | null;
  source: string;
  category: string;
  location: "new" | "later" | "archive" | "feed";
  tags: Record<string, unknown>;
  site_name: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
  published_date: string | null;
  summary: string;
  image_url: string | null;
  notes: string;
  reading_progress: number;
  saved_at: string;
  last_moved_at: string;
  html_content?: string;
};

export type ReadwiseDocumentsResponse = {
  count: number;
  nextPageCursor: string | null;
  results: ReadwiseDocument[];
};

export type ReadwiseHighlight = {
  id: number;
  text: string;
  note: string | null;
  location: number;
  location_type: string;
  highlighted_at: string | null;
  url: string | null;
  color: string;
  updated: string;
  book_id: number;
  tags: Array<{ id: number; name: string }>;
};

export type ReadwiseBook = {
  id: number;
  title: string;
  author: string | null;
  category: string;
  source: string;
  num_highlights: number;
  last_highlight_at: string | null;
  updated: string;
  cover_image_url: string | null;
  highlights_url: string;
  source_url: string | null;
  asin: string | null;
  tags: Array<{ id: number; name: string }>;
};

export type ReadwiseHighlightsResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ReadwiseHighlight[];
};

export type ReadwiseBooksResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ReadwiseBook[];
};

export type ReadwiseTag = {
  key: string;
  name: string;
};

export type ReadwiseTagsResponse = {
  count: number;
  nextPageCursor: string | null;
  results: ReadwiseTag[];
};

export async function verifyReadwiseToken(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${READWISE_API_BASE_V2}/auth/`, {
      headers: {
        Authorization: `Token ${token}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    return {
      valid: false,
      error: response.status === 401 ? "Invalid token" : "API error",
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function fetchReadwiseDocuments(
  token: string,
  options?: {
    updatedAfter?: Date;
    location?: "new" | "later" | "archive" | "feed";
    category?:
      | "article"
      | "email"
      | "rss"
      | "highlight"
      | "note"
      | "pdf"
      | "epub"
      | "tweet"
      | "video";
    tags?: string[];
    limit?: number;
  },
): Promise<ReadwiseDocument[]> {
  const allDocuments: ReadwiseDocument[] = [];
  let nextPageCursor: string | null = null;
  const limit = options?.limit || 100;

  while (true) {
    const queryParams = new URLSearchParams();

    if (nextPageCursor) {
      queryParams.append("pageCursor", nextPageCursor);
    }

    if (options?.updatedAfter) {
      queryParams.append("updatedAfter", options.updatedAfter.toISOString());
    }

    if (options?.location) {
      queryParams.append("location", options.location);
    }

    if (options?.category) {
      queryParams.append("category", options.category);
    }

    if (options?.tags && options.tags.length > 0) {
      for (const tag of options.tags.slice(0, 5)) {
        queryParams.append("tag", tag);
      }
    }

    queryParams.append("withHtmlContent", "true");

    console.log(
      `Fetching Readwise documents: ${READWISE_API_BASE_V3}/list/?${queryParams.toString()}`,
    );

    const response = await fetch(
      `${READWISE_API_BASE_V3}/list/?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Readwise API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: ReadwiseDocumentsResponse = await response.json();
    console.log(`Received ${data.results.length} documents from page`);

    allDocuments.push(...data.results);

    nextPageCursor = data.nextPageCursor;

    if (!nextPageCursor || allDocuments.length >= limit) {
      break;
    }
  }

  console.log(`Total documents fetched: ${allDocuments.length}`);
  return allDocuments.slice(0, limit);
}

export async function fetchReadwiseHighlights(
  token: string,
  options?: {
    updatedAfter?: Date;
    pageSize?: number;
  },
): Promise<ReadwiseHighlight[]> {
  const pageSize = options?.pageSize || 100;
  let url = `${READWISE_API_BASE_V2}/highlights/?page_size=${pageSize}`;

  if (options?.updatedAfter) {
    const isoDate = options.updatedAfter.toISOString();
    url += `&updated__gt=${isoDate}`;
  }

  console.log("Fetching Readwise highlights:", { url });

  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Readwise API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: ReadwiseHighlightsResponse = await response.json();
  console.log("Readwise API response:", {
    count: data.count,
    resultsLength: data.results.length,
    hasNext: !!data.next,
  });
  return data.results;
}

export async function fetchReadwiseBook(
  token: string,
  bookId: number,
): Promise<ReadwiseBook> {
  const response = await fetch(`${READWISE_API_BASE_V2}/books/${bookId}/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Readwise API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export function groupHighlightsByBook(
  highlights: ReadwiseHighlight[],
): Map<number, ReadwiseHighlight[]> {
  const grouped = new Map<number, ReadwiseHighlight[]>();

  for (const highlight of highlights) {
    const bookHighlights = grouped.get(highlight.book_id) || [];
    bookHighlights.push(highlight);
    grouped.set(highlight.book_id, bookHighlights);
  }

  return grouped;
}

export function highlightsToMarkdown(highlights: ReadwiseHighlight[]): string {
  return highlights
    .map((h) => {
      let md = `> ${h.text}`;
      if (h.note) {
        md += `\n\n**Note:** ${h.note}`;
      }
      return md;
    })
    .join("\n\n---\n\n");
}

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

export async function fetchReadwiseTags(token: string): Promise<ReadwiseTag[]> {
  const allTags: ReadwiseTag[] = [];
  let nextPageCursor: string | null = null;

  while (true) {
    const queryParams = new URLSearchParams();

    if (nextPageCursor) {
      queryParams.append("pageCursor", nextPageCursor);
    }

    const url = `${READWISE_API_BASE_V3}/tags/${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Readwise API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: ReadwiseTagsResponse = await response.json();
    allTags.push(...data.results);

    nextPageCursor = data.nextPageCursor;

    if (!nextPageCursor) {
      break;
    }
  }

  return allTags;
}
