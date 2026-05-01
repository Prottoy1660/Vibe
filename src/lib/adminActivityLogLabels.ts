/**
 * Human-readable labels for admin activity log (API + DB audit rows).
 */

export type HttpStatusPresentation = {
  code: number;
  /** Short label under the code, e.g. "Server error" */
  label: string;
  /** Longer explanation for tooltip */
  hint: string;
  variant: 'success' | 'redirect' | 'client' | 'server' | 'neutral';
};

const DB_TABLE_LABELS: Record<string, string> = {
  emails_pool: 'Email pool',
  email_teams: 'Email team',
  operational_expenses: 'Operational expense',
  system_settings: 'System setting',
  products: 'Product',
  coupons: 'Coupon',
  notices: 'Notice',
  orders: 'Order',
  users: 'User account',
  redeem_codes: 'Redeem code',
  support_tickets: 'Support ticket',
  user_inbox: 'User inbox item',
  product_waitlist: 'Product waitlist',
  subscription_reminder_delivery_log: 'Subscription reminder delivery',
  subscription_reminder_ops: 'Subscription reminder ops',
  campaigns: 'Campaign',
  user_sessions: 'User session',
};

/** method + normalized path (no query) → short English description */
const API_EXACT: Record<string, string> = {
  // Admin ops
  'GET /api/admin/ops/catalog-products': 'Viewed admin product catalog',
  'GET /api/admin/ops/risk-overview': 'Opened risk overview',
  'GET /api/admin/ops/subscription-health': 'Opened subscription health',
  'GET /api/admin/ops/renewal-packs': 'Viewed renewal packs',
  'GET /api/admin/ops/campaigns': 'Listed marketing campaigns',
  'POST /api/admin/ops/campaigns': 'Created a marketing campaign',
  'POST /api/admin/ops/run-policies': 'Ran automated policies',
  'POST /api/admin/ops/run-reminders': 'Ran renewal / reminder job',
  'POST /api/admin/ops/bulk/orders/status': 'Bulk-updated order statuses',
  'POST /api/admin/ops/bulk/notices': 'Sent bulk notices',
  'POST /api/admin/ops/bulk/renew-offers': 'Sent bulk renewal offers',
  'POST /api/admin/ops/process-notification-queue': 'Processed notification queue',
  'POST /api/admin/ops/churn/run-campaign': 'Ran churn campaign',
  'POST /api/admin/ops/sidebar-config': 'Saved admin sidebar configuration',
  'GET /api/admin/ops/subscription-reminder/integrations': 'Opened subscription reminder API settings',
  'PATCH /api/admin/ops/subscription-reminder/integrations': 'Updated subscription reminder API settings',
  'POST /api/admin/ops/subscription-reminder/run': 'Ran subscription expiry reminder job',
  'POST /api/admin/ops/subscription-reminder/test': 'Sent subscription reminder test to admin',
  'GET /api/admin/ops/referral/settings': 'Opened referral program settings',
  'PATCH /api/admin/ops/referral/settings': 'Updated referral program settings',
  'GET /api/admin/ops/referral/rewards': 'Listed referral rewards',
  'GET /api/admin/ops/analytics/cohort-retention': 'Viewed cohort retention analytics',
  'GET /api/admin/ops/analytics/funnel': 'Viewed funnel analytics',
  'GET /api/admin/ops/analytics/ltv': 'Viewed LTV analytics',
  'GET /api/admin/ops/support-chat/settings': 'Opened AI support chat settings',
  'PATCH /api/admin/ops/support-chat/settings': 'Updated AI support chat settings',
  'GET /api/admin/ops/support-chat/training': 'Opened support chat training data',
  'DELETE /api/admin/ops/support-chat/training': 'Cleared support chat training data',
  'POST /api/admin/ops/activity-logs/purge': 'Purged admin activity logs',
  'POST /api/admin/users/:id/impersonate': 'Logged in as a user from admin panel',
  // Redeem (admin)
  'GET /api/admin/orders/query': 'Listed orders (admin query)',
  'GET /api/admin/finance/operational-expenses': 'Listed operational expenses',
  'GET /api/admin/redeem/pending': 'Viewed pending redeem orders',
  'GET /api/admin/redeem/revoked': 'Viewed revoked / seized redeem orders',
  // cPanel
  'POST /api/cpanel/create-emails': 'Created emails via cPanel',
  'POST /api/cpanel/delete-email': 'Deleted email via cPanel',
  'POST /api/cpanel/inbox': 'Opened cPanel inbox action',
  // Cron (admin-triggered)
  'POST /api/cron/burn-expired-emails': 'Ran job: burn expired emails',
  'POST /api/cron/subscription-expiry-reminders': 'Ran job: subscription expiry reminders',
};

/** Patterns after normalizing UUIDs and numeric path segments to placeholders */
const API_PATTERN: Array<{ re: RegExp; label: string }> = [
  { re: /^GET \/api\/admin\/ops\/support-summary\/[^/]+$/, label: 'Opened support summary for a user' },
  { re: /^PUT \/api\/admin\/ops\/campaigns\/[^/]+$/, label: 'Updated a marketing campaign' },
  { re: /^DELETE \/api\/admin\/ops\/campaigns\/[^/]+$/, label: 'Deleted a marketing campaign' },
  { re: /^GET \/api\/admin\/ops\/campaigns\/[^/]+\/roi$/, label: 'Viewed campaign ROI' },
  { re: /^POST \/api\/admin\/ops\/referral\/rewards\/[^/]+\/approve$/, label: 'Approved a referral reward' },
  { re: /^POST \/api\/admin\/ops\/referral\/rewards\/[^/]+\/reject$/, label: 'Rejected a referral reward' },
  { re: /^POST \/api\/admin\/ops\/referral\/process-order\/[^/]+$/, label: 'Processed referral for an order' },
  { re: /^DELETE \/api\/admin\/users\/[^/]+$/, label: 'Deleted a user account' },
  { re: /^PUT \/api\/admin\/users\/[^/]+$/, label: 'Updated a user account' },
  { re: /^DELETE \/api\/admin\/ops\/support-tickets\/[^/]+$/, label: 'Deleted a support ticket' },
  { re: /^POST \/api\/admin\/redeem\/cancel\/[^/]+$/, label: 'Cancelled / seized a redeem order' },
  { re: /^POST \/api\/admin\/redeem\/restore\/[^/]+$/, label: 'Restored a seized redeem order (new payment window)' },
  { re: /^POST \/api\/admin\/redeem\/mark-paid\/[^/]+$/, label: 'Marked a redeem order as paid' },
  { re: /^POST \/api\/admin\/orders\/[^/]+\/renew$/, label: 'Triggered order renewal' },
  { re: /^POST \/api\/admin\/users\/[^/]+\/impersonate$/, label: 'Logged in as a user from admin panel' },
];

function stripQuery(p: string): string {
  const i = p.indexOf('?');
  return i === -1 ? p : p.slice(0, i);
}

/** Replace UUIDs and trailing numeric segments for pattern matching */
function normalizeApiPath(path: string): string {
  let p = stripQuery(path).replace(/\/+$/, '') || '/';
  p = p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id');
  p = p.replace(/\/(\d+)(?=\/|$)/g, '/:id');
  return p;
}

function verbForMethod(method: string): string {
  const m = method.toUpperCase();
  if (m === 'GET') return 'Loaded';
  if (m === 'POST') return 'Submitted';
  if (m === 'PUT') return 'Updated';
  if (m === 'PATCH') return 'Updated';
  if (m === 'DELETE') return 'Removed';
  if (m === 'HEAD') return 'Checked';
  if (m === 'OPTIONS') return 'Preflight';
  return 'Called';
}

function fallbackApiLabel(method: string, path: string): string {
  const p = stripQuery(path);
  const m = method.toUpperCase();
  const tail = p
    .replace(/^\/api\/admin/i, '')
    .replace(/^\/api\/cpanel/i, 'cPanel')
    .replace(/^\/api\/cron/i, 'scheduled job')
    .replace(/^\/api\//i, '');
  const readable = tail.replace(/\//g, ' · ').replace(/:/g, '') || 'admin API';
  return `${verbForMethod(m)} ${readable}`.replace(/\s+/g, ' ').trim();
}

export function technicalApiLine(httpMethod: string | null, path: string | null): string {
  if (!path) return httpMethod ? `${httpMethod} (path unknown)` : '—';
  const p = stripQuery(path);
  return `${(httpMethod || '?').toUpperCase()} ${p}`;
}

export function friendlyApiSummary(httpMethod: string | null, path: string | null): string {
  if (!path) return httpMethod ? `${verbForMethod(httpMethod)} API` : 'API request';
  const p = stripQuery(path);
  const m = (httpMethod || 'GET').toUpperCase();
  const key = `${m} ${p}`;
  if (API_EXACT[key]) return API_EXACT[key];

  const norm = normalizeApiPath(p);
  const normKey = `${m} ${norm}`;
  if (API_EXACT[normKey]) return API_EXACT[normKey];

  for (const { re, label } of API_PATTERN) {
    if (re.test(`${m} ${norm}`)) return label;
  }

  return fallbackApiLabel(m, p);
}

function friendlyDbSummary(action: string, summary: string, details: Record<string, unknown> | null): string {
  // action like "public.orders.UPDATE"
  const parts = action.split('.').filter(Boolean);
  const op = (parts[parts.length - 1] || '').toUpperCase();
  const table = parts.length >= 2 ? parts[parts.length - 2] : '';
  const niceTable = DB_TABLE_LABELS[table] || table.replace(/_/g, ' ') || 'record';

  const opVerb: Record<string, string> = {
    INSERT: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
  };
  const verb = opVerb[op] || op || 'Changed';

  const id = details && typeof details.id === 'string' ? details.id : null;
  const shortId = id && id.length > 12 ? `${id.slice(0, 8)}…` : id;

  let extra = '';
  if (table === 'system_settings' && id) {
    extra = ` (“${id}”)`;
  } else if (shortId) {
    extra = ` (ref: ${shortId})`;
  }

  return `${verb} ${niceTable}${extra}`;
}

export function friendlyActivityTitle(input: {
  source: string;
  action: string;
  summary: string;
  http_method: string | null;
  path: string | null;
  details: Record<string, unknown> | null;
}): string {
  if (input.source === 'api') {
    return friendlyApiSummary(input.http_method, input.path);
  }
  return friendlyDbSummary(input.action, input.summary, input.details);
}

export function humanizeHttpStatus(code: number | null): HttpStatusPresentation | null {
  if (code == null) return null;

  if (code === 304) {
    return {
      code,
      label: 'Cached',
      hint: '304 Not Modified — browser reused cached data; nothing new was sent.',
      variant: 'neutral',
    };
  }
  if (code >= 200 && code < 300) {
    return {
      code,
      label: 'OK',
      hint: 'Request completed successfully.',
      variant: 'success',
    };
  }
  if (code >= 300 && code < 400) {
    return {
      code,
      label: 'Redirect',
      hint: 'The client was redirected to another URL.',
      variant: 'redirect',
    };
  }
  if (code === 400) {
    return {
      code,
      label: 'Bad request',
      hint: '400 — the request was invalid or missing required data.',
      variant: 'client',
    };
  }
  if (code === 401) {
    return {
      code,
      label: 'Not signed in',
      hint: '401 — authentication required or session expired.',
      variant: 'client',
    };
  }
  if (code === 403) {
    return {
      code,
      label: 'Forbidden',
      hint: '403 — signed in but not allowed to perform this action.',
      variant: 'client',
    };
  }
  if (code === 404) {
    return {
      code,
      label: 'Not found',
      hint: '404 — the requested resource does not exist.',
      variant: 'client',
    };
  }
  if (code === 429) {
    return {
      code,
      label: 'Too many requests',
      hint: '429 — rate limited; try again after a short wait.',
      variant: 'client',
    };
  }
  if (code >= 400 && code < 500) {
    return {
      code,
      label: 'Client error',
      hint: `${code} — something was wrong with the request or permissions.`,
      variant: 'client',
    };
  }
  if (code >= 500) {
    return {
      code,
      label: 'Server error',
      hint: `${code} — the server failed while handling this. Check API logs or database; users may see a generic error.`,
      variant: 'server',
    };
  }
  return {
    code,
    label: 'Done',
    hint: `HTTP ${code}`,
    variant: 'neutral',
  };
}

export function rowMatchesSearch(
  row: {
    action: string;
    summary: string;
    path: string | null;
    details: Record<string, unknown> | null;
    source: string;
    http_method: string | null;
    status_code: number | null;
  },
  queryLower: string,
): boolean {
  const friendly = friendlyActivityTitle({
    source: row.source,
    action: row.action,
    summary: row.summary,
    http_method: row.http_method,
    path: row.path,
    details: row.details,
  }).toLowerCase();
  const http = humanizeHttpStatus(row.status_code);
  const httpBits = http ? `${http.label} ${http.hint}`.toLowerCase() : '';
  return (
    row.action.toLowerCase().includes(queryLower) ||
    row.summary.toLowerCase().includes(queryLower) ||
    (row.path && row.path.toLowerCase().includes(queryLower)) ||
    JSON.stringify(row.details || {}).toLowerCase().includes(queryLower) ||
    friendly.includes(queryLower) ||
    httpBits.includes(queryLower)
  );
}
