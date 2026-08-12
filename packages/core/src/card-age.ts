// The human-attention threshold for a filed profile's age. Distinct from the cache TTLs in
// packages/db (those decide regeneration; this decides visual weight). Tunable constant.
export const AGED_PROFILE_THRESHOLD_DAYS = 14;

export function isAgedProfile(generatedAt: string, now: Date = new Date()): boolean {
  const filed = new Date(generatedAt);
  if (Number.isNaN(filed.getTime())) {
    return false;
  }
  return now.getTime() - filed.getTime() > AGED_PROFILE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}
