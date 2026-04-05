import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/** Calendar-day math for “3 days / 1 day left” uses this zone (not the server’s local TZ). */
export const SUBSCRIPTION_REMINDER_TZ = 'Asia/Dhaka';

/**
 * Full calendar days from “today” (start of day in SUBSCRIPTION_REMINDER_TZ) until expiry day
 * in the same zone.
 */
export function calendarDaysUntilSubscriptionEndInZone(expiresAt: Date, now: Date = new Date()): number {
  const expiresLocal = startOfDay(toZonedTime(expiresAt, SUBSCRIPTION_REMINDER_TZ));
  const nowLocal = startOfDay(toZonedTime(now, SUBSCRIPTION_REMINDER_TZ));
  return differenceInCalendarDays(expiresLocal, nowLocal);
}
