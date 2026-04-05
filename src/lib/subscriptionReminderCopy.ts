/** In-app inbox, email subject/body, and WhatsApp text all use the same title + body. */

export type SubscriptionReminderCopy = {
  d3_title: string;
  d3_body: string;
  d1_title: string;
  d1_body: string;
};

export const SUBSCRIPTION_REMINDER_COPY_KEY = 'subscription_reminder_copy';

/** Default locale for {expiresDate} (e.g. en-US → "April 8, 2026"). */
export const DEFAULT_REMINDER_DATE_LOCALE = 'en-US';

/** Placeholders: {productTitle}, {expiresDate}, {orderId}, {renewUrl} */
export const SUBSCRIPTION_REMINDER_PLACEHOLDERS =
  '{productTitle}, {expiresDate} (locale below), {orderId}, {renewUrl} (store / renew link)';

export const DEFAULT_SUBSCRIPTION_REMINDER_COPY: SubscriptionReminderCopy = {
  d3_title: 'Your subscription ends in 3 days',
  d3_body: [
    'Your "{productTitle}" plan expires on {expiresDate}.',
    '',
    'Renew soon from the store or top up your wallet so your access continues without interruption.',
    '',
    'Store: {renewUrl}',
    '',
    'Order ID: {orderId}',
  ].join('\n'),
  d1_title: 'Your subscription ends tomorrow',
  d1_body: [
    'Your "{productTitle}" plan expires tomorrow ({expiresDate}).',
    '',
    'Renew today to reduce the risk of losing access. Use the store or your orders page.',
    '',
    'Store: {renewUrl}',
    '',
    'Order ID: {orderId}',
  ].join('\n'),
};

export function parseSubscriptionReminderCopy(raw: unknown): SubscriptionReminderCopy {
  const d = DEFAULT_SUBSCRIPTION_REMINDER_COPY;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    d3_title:
      typeof o.d3_title === 'string' && o.d3_title.trim() ? o.d3_title.trim().slice(0, 300) : d.d3_title,
    d3_body: typeof o.d3_body === 'string' && o.d3_body.trim() ? o.d3_body.trim().slice(0, 12000) : d.d3_body,
    d1_title:
      typeof o.d1_title === 'string' && o.d1_title.trim() ? o.d1_title.trim().slice(0, 300) : d.d1_title,
    d1_body: typeof o.d1_body === 'string' && o.d1_body.trim() ? o.d1_body.trim().slice(0, 12000) : d.d1_body,
  };
}

/** Parses copy fields plus optional renew_url on the same JSON row. */
export function parseSubscriptionReminderCopyRow(raw: unknown): {
  copy: SubscriptionReminderCopy;
  renew_url: string | null;
} {
  const copy = parseSubscriptionReminderCopy(raw);
  let renew_url: string | null = null;
  if (raw && typeof raw === 'object') {
    const ru = (raw as Record<string, unknown>).renew_url;
    if (typeof ru === 'string' && ru.trim()) renew_url = ru.trim().slice(0, 2000);
  }
  return { copy, renew_url };
}

export function formatReminderExpiresDate(expiresAt: Date, locale = DEFAULT_REMINDER_DATE_LOCALE): string {
  return expiresAt.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function applyReminderPlaceholders(
  template: string,
  vars: { productTitle: string; expiresDate: string; orderId: string; renewUrl: string },
): string {
  return template
    .replace(/\{productTitle\}/g, vars.productTitle)
    .replace(/\{expiresDate\}/g, vars.expiresDate)
    .replace(/\{orderId\}/g, vars.orderId)
    .replace(/\{renewUrl\}/g, vars.renewUrl);
}

export function buildReminderFromCopy(
  copy: SubscriptionReminderCopy,
  key: 'd3' | 'd1',
  args: { productTitle: string; expiresAt: Date; orderId: string; renewUrl: string; dateLocale?: string },
): { title: string; body: string } {
  const expiresDate = formatReminderExpiresDate(args.expiresAt, args.dateLocale ?? DEFAULT_REMINDER_DATE_LOCALE);
  const vars = { productTitle: args.productTitle, expiresDate, orderId: args.orderId, renewUrl: args.renewUrl };
  if (key === 'd3') {
    return {
      title: applyReminderPlaceholders(copy.d3_title, vars),
      body: applyReminderPlaceholders(copy.d3_body, vars),
    };
  }
  return {
    title: applyReminderPlaceholders(copy.d1_title, vars),
    body: applyReminderPlaceholders(copy.d1_body, vars),
  };
}

/** Sample values for admin preview */
export function previewSampleArgs(): { productTitle: string; expiresAt: Date; orderId: string } {
  return {
    productTitle: 'Premium (1 month)',
    expiresAt: new Date('2026-04-08T12:00:00'),
    orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  };
}
