/**
 * Shared utilities for YouTube episode matching
 */

/**
 * Normalize title for better matching
 * - Remove common podcast prefixes/suffixes
 * - Lowercase
 * - Remove special characters
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(episode|ep\.?|#)\s*\d+\s*:?\s*/i, "") // Remove episode numbers
    .replace(/\s*\|\s*.*$/, "") // Remove pipe-separated suffixes
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}
