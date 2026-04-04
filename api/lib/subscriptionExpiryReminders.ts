import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { parseDurationToMonths } from '../../src/lib/durationUtils.js';

export function subscriptionExpiresAt(createdAtIso: string, productDuration: string | null | undefined): Date {
  const months = parseDurationToMonths(String(productDuration || '1 month'));
  return addMonths(parseISO(createdAtIso), months);
}

/** Full calendar days from today until expiry calendar day (start of day in server TZ). */
export function calendarDaysUntilSubscriptionEnd(expiresAt: Date, now: Date = new Date()): number {
  return differenceInCalendarDays(startOfDay(expiresAt), startOfDay(now));
}

const TITLES: Record<'d3' | 'd1', string> = {
  d3: 'সাবস্ক্রিপশন ৩ দিনে শেষ হচ্ছে',
  d1: 'সাবস্ক্রিপশন আগামীকাল শেষ হচ্ছে',
};

function buildBody(args: {
  key: 'd3' | 'd1';
  productTitle: string;
  expiresAt: Date;
  orderId: string;
}): string {
  const dateStr = args.expiresAt.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines =
    args.key === 'd3'
      ? [
          `আপনার "${args.productTitle}" প্ল্যানের মেয়াদ ${dateStr} তারিখে শেষ হবে।`,
          '',
          'বিঘ্ন ছাড়া সেবা চালিয়ে যেতে দ্রুত রিনিউ করুন — স্টোর থেকে প্ল্যান কিনুন বা ওয়ালেট রিচার্জ করে রাখুন।',
        ]
      : [
          `আপনার "${args.productTitle}" প্ল্যানের মেয়াদ আগামীকাল (${dateStr}) শেষ হবে।`,
          '',
          'আজই রিনিউ করলে অ্যাক্সেস বন্ধ হওয়ার ঝুঁকি কমবে। স্টোর বা অর্ডার পেজ থেকে নিন।',
        ];
  lines.push('', `অর্ডার আইডি: ${args.orderId}`);
  return lines.join('\n');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Sends user_inbox rows for completed/paid orders whose subscription ends in 3 or 1 calendar days.
 * Idempotent via subscription_expiry_reminders.
 */
export async function runSubscriptionExpiryReminders(
  supabase: SupabaseClient
): Promise<{ scanned: number; sent_d3: number; sent_d1: number; errors: number }> {
  const { data: rows, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      user_id,
      created_at,
      status,
      payment_status,
      products:product_id ( title, duration )
    `
    )
    .in('status', ['completed', 'paid'])
    .order('created_at', { ascending: false })
    .limit(8000);

  if (error) throw error;

  const list = (rows || []) as any[];
  const now = new Date();

  const candidates: { row: any; key: 'd3' | 'd1'; expiresAt: Date; productTitle: string }[] = [];

  for (const row of list) {
    const duration = row.products?.duration as string | undefined;
    const productTitle = (row.products?.title as string) || 'সাবস্ক্রিপশন';
    if (!row.user_id || !row.created_at) continue;

    let expiresAt: Date;
    try {
      expiresAt = subscriptionExpiresAt(row.created_at, duration);
    } catch {
      continue;
    }

    const daysLeft = calendarDaysUntilSubscriptionEnd(expiresAt, now);
    if (daysLeft !== 3 && daysLeft !== 1) continue;

    const key: 'd3' | 'd1' = daysLeft === 3 ? 'd3' : 'd1';
    candidates.push({ row, key, expiresAt, productTitle });
  }

  if (candidates.length === 0) {
    return { scanned: list.length, sent_d3: 0, sent_d1: 0, errors: 0 };
  }

  const orderIds = [...new Set(candidates.map((c) => c.row.id as string))];
  const sentSet = new Set<string>();
  for (const part of chunk(orderIds, 400)) {
    const { data: logs, error: logErr } = await supabase
      .from('subscription_expiry_reminders')
      .select('order_id, reminder_key')
      .in('order_id', part);
    if (logErr) {
      console.error('[expiry-reminders] batch log fetch:', logErr);
      continue;
    }
    for (const l of logs || []) {
      sentSet.add(`${(l as any).order_id}:${(l as any).reminder_key}`);
    }
  }

  let sent_d3 = 0;
  let sent_d1 = 0;
  let errors = 0;

  for (const c of candidates) {
    const dedupe = `${c.row.id}:${c.key}`;
    if (sentSet.has(dedupe)) continue;

    const inboxTitle = TITLES[c.key];
    const body = buildBody({
      key: c.key,
      productTitle: c.productTitle,
      expiresAt: c.expiresAt,
      orderId: c.row.id,
    });

    const { error: insInbox } = await supabase.from('user_inbox').insert({
      user_id: c.row.user_id,
      title: inboxTitle,
      body,
      created_by: null,
    });

    if (insInbox) {
      console.error('[expiry-reminders] user_inbox insert failed:', insInbox, c.row.id);
      errors++;
      continue;
    }

    const { error: logIns } = await supabase.from('subscription_expiry_reminders').insert({
      order_id: c.row.id,
      reminder_key: c.key,
    });

    if (logIns) {
      console.error('[expiry-reminders] log insert failed:', logIns, c.row.id);
      errors++;
    }

    sentSet.add(dedupe);
    if (c.key === 'd3') sent_d3++;
    else sent_d1++;
  }

  return { scanned: list.length, sent_d3, sent_d1, errors };
}
