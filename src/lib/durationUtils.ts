import { addDays, addMonths, addWeeks, addYears } from 'date-fns';

type DurationUnit = 'day' | 'week' | 'month' | 'year';

function parseDurationSpec(duration: string): { value: number; unit: DurationUnit } {
  const lower = String(duration || '').trim().toLowerCase();
  const numMatch = lower.match(/\d+/);
  const value = Math.max(1, numMatch ? parseInt(numMatch[0], 10) : 1);

  if (lower.includes('day')) return { value, unit: 'day' };
  if (lower.includes('week') || lower.includes('wk')) return { value, unit: 'week' };
  if (lower.includes('year') || lower.includes('yr')) return { value, unit: 'year' };
  return { value, unit: 'month' };
}

/**
 * Parse a human-readable duration into whole months.
 * Day/week durations round up to the nearest month for systems that only support month-based provisioning.
 */
export function parseDurationToMonths(duration: string): number {
  const spec = parseDurationSpec(duration);
  if (spec.unit === 'year') return spec.value * 12;
  if (spec.unit === 'month') return spec.value;
  const totalDays = spec.unit === 'week' ? spec.value * 7 : spec.value;
  return Math.max(1, Math.ceil(totalDays / 30));
}

/**
 * Return the total number of days a duration string represents.
 */
export function parseDurationToDays(duration: string): number {
  const spec = parseDurationSpec(duration);
  if (spec.unit === 'day') return spec.value;
  if (spec.unit === 'week') return spec.value * 7;
  if (spec.unit === 'year') return spec.value * 365;
  return spec.value * 30;
}

/**
 * Add a human-readable duration to a date using the matching calendar unit.
 */
export function addDurationToDate(date: Date, duration: string): Date {
  const spec = parseDurationSpec(duration);
  if (spec.unit === 'day') return addDays(date, spec.value);
  if (spec.unit === 'week') return addWeeks(date, spec.value);
  if (spec.unit === 'year') return addYears(date, spec.value);
  return addMonths(date, spec.value);
}
