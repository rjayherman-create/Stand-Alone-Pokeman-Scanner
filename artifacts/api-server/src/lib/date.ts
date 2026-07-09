const EPOCH_ISO = new Date(0).toISOString();

export function toIsoDateTime(value: unknown): string {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? EPOCH_ISO : value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? EPOCH_ISO : parsed.toISOString();
  }

  return EPOCH_ISO;
}
