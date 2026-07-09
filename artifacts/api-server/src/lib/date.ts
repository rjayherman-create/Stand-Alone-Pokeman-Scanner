/**
 * Converts supported date-like values to ISO 8601 strings.
 * Returns null when input is missing or cannot be parsed into a valid date.
 */
export function toIsoDateTime(value: Date | string | number | null | undefined): string | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : value.toISOString();
  }

  if (typeof value === "string") {
    return parseDateLike(value);
  }

  if (typeof value === "number") {
    return parseDateLike(value);
  }

  return null;
}

function parseDateLike(value: string | number): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
