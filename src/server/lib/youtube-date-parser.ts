/**
 * Parse relative YouTube date strings like "7 months ago", "1 year ago", "3 weeks ago"
 * into approximate Date objects
 */
export function parseRelativeDate(relativeText: string): Date | null {
  if (!relativeText) return null;

  const now = new Date();
  const lowerText = relativeText.toLowerCase().trim();

  // Match patterns like "7 months ago", "1 year ago", etc.
  const match = lowerText.match(
    /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/,
  );

  if (!match) {
    // Check for "today" or "yesterday"
    if (lowerText.includes("today") || lowerText.includes("just now")) {
      return now;
    }
    if (lowerText.includes("yesterday")) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }
    return null;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];

  const result = new Date(now);

  switch (unit) {
    case "second":
      result.setSeconds(result.getSeconds() - amount);
      break;
    case "minute":
      result.setMinutes(result.getMinutes() - amount);
      break;
    case "hour":
      result.setHours(result.getHours() - amount);
      break;
    case "day":
      result.setDate(result.getDate() - amount);
      break;
    case "week":
      result.setDate(result.getDate() - amount * 7);
      break;
    case "month":
      result.setMonth(result.getMonth() - amount);
      break;
    case "year":
      result.setFullYear(result.getFullYear() - amount);
      break;
    default:
      return null;
  }

  return result;
}
