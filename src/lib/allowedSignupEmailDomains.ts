/**
 * Email/password signup: only well-known consumer / major provider domains.
 * Blocks custom domains, disposable hosts, and unknown mail servers.
 */

const EXACT_ALLOWED_DOMAINS = new Set([
  // Google
  'gmail.com',
  'googlemail.com',
  // Microsoft (common)
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'passport.com',
  // Yahoo & Yahoo regional
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'yahoo.de',
  'yahoo.fr',
  'yahoo.ca',
  'yahoo.com.au',
  'yahoo.com.br',
  'yahoo.com.mx',
  'yahoo.com.sg',
  'yahoo.com.ph',
  'yahoo.co.id',
  'yahoo.co.jp',
  'yahoo.es',
  'yahoo.it',
  'yahoo.nl',
  // Apple
  'icloud.com',
  'me.com',
  'mac.com',
  // Other major free / consumer
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'gmx.at',
  'gmx.ch',
  'web.de',
  't-online.de',
  'fastmail.com',
  'fastmail.fm',
  'hey.com',
  'tutanota.com',
  'tuta.io',
  'posteo.net',
  'posteo.de',
  'hushmail.com',
  'skiff.com',
  'yandex.com',
  'yandex.ru',
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'sina.com',
  'rediffmail.com',
  'inbox.com',
  'lavabit.com',
  // Microsoft regional (explicit)
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.es',
  'hotmail.it',
  'hotmail.nl',
  'hotmail.com.au',
  'outlook.co.uk',
  'outlook.de',
  'outlook.fr',
  'outlook.jp',
  'outlook.com.au',
  'outlook.sa',
  'live.co.uk',
  'live.nl',
  'live.com.au',
  'live.de',
  'live.fr',
  'live.jp',
]);

/** Patterns for regional TLDs not listed explicitly (yahoo.*, hotmail.*, outlook.*, live.*). */
const REGIONAL_SUFFIX_PATTERNS: RegExp[] = [
  /^yahoo\.co\.[a-z]{2}$/i,
  /^hotmail\.co\.[a-z]{2}$/i,
  /^outlook\.co\.[a-z]{2}$/i,
  /^live\.co\.[a-z]{2}$/i,
];

function extractDomain(email: string): string | null {
  const t = email.trim().toLowerCase();
  const at = t.lastIndexOf('@');
  if (at < 1 || at === t.length - 1) return null;
  return t.slice(at + 1);
}

export function isAllowedSignupEmail(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }
  if (EXACT_ALLOWED_DOMAINS.has(domain)) return true;
  for (const re of REGIONAL_SUFFIX_PATTERNS) {
    if (re.test(domain)) return true;
  }
  return false;
}

/** Shown when the email domain is not on the allowlist */
export const SIGNUP_EMAIL_DOMAIN_BLOCKED =
  'You can only sign up with a recognized provider (e.g. Gmail, Outlook, Yahoo, Hotmail, iCloud, Proton). Custom, company, or unknown domains are not accepted.';
