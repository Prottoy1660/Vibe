/**
 * Parse a human-readable duration string (e.g., "1 Month", "6 Months", "1 Year")
 * into the number of months it represents.
 *
 * Used by AdobeEmail, AdminDashboard, and any component that computes subscription expiry.
 */
export function parseDurationToMonths(duration: string): number {
  const lower = duration.toLowerCase();
  const numMatch = lower.match(/\d+/);
  const num = numMatch ? parseInt(numMatch[0], 10) : 1;

  if (lower.includes('year') || lower.includes('yr')) {
    return num * 12;
  }
  return num; // default: months
}

/**
 * Return the total number of days a duration string represents.
 * Useful for computing accurate progress-bar percentages.
 */
export function parseDurationToDays(duration: string): number {
  return parseDurationToMonths(duration) * 30; // Approximation (30 days/month)
}
