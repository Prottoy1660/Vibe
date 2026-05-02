/** Default profile pictures (hosted on Supabase). First = male, second = female. */
export const DEFAULT_AVATAR_MALE_URL =
  'https://supabase.vibeaccessbd.com/storage/v1/object/public/product-images/products/male.png';

export const DEFAULT_AVATAR_FEMALE_URL =
  'https://supabase.vibeaccessbd.com/storage/v1/object/public/product-images/products/female.png';

const DEFAULT_AVATAR_URLS = [DEFAULT_AVATAR_MALE_URL, DEFAULT_AVATAR_FEMALE_URL] as const;

const FEMALE_NAME_TOKENS = [
  'fatema', 'fatima', 'fathima', 'ayesha', 'aisha', 'jannat', 'nusrat',
  'sadia', 'sumaiya', 'sumaya', 'maria', 'mariya', 'sumi', 'rima', 'tania', 'tanjina',
  'mim', 'mou', 'sultana', 'khatun', 'akter', 'begum', 'sabrina', 'priya', 'rupa',
  'shila', 'sheela', 'nipa', 'liza', 'tisha', 'mehjabin',
];

const MALE_NAME_TOKENS = [
  'mohammad', 'mohammed', 'md', 'abdul', 'rahman', 'hossain', 'hasan', 'hassan',
  'karim', 'islam', 'sakib', 'shakib', 'rakib', 'tamim', 'riad', 'riyad', 'fahim',
  'mahmud', 'imran', 'sohel', 'sohail', 'rubel', 'jahid', 'jihad', 'khan',
  'ahmed', 'ahmad', 'zia', 'nazmul', 'ashik', 'ashiq', 'farhan',
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function detectAvatarUrlFromName(name?: string | null): string | null {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/[^a-z\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (FEMALE_NAME_TOKENS.includes(token)) return DEFAULT_AVATAR_FEMALE_URL;
  }
  for (const token of tokens) {
    if (MALE_NAME_TOKENS.includes(token)) return DEFAULT_AVATAR_MALE_URL;
  }

  return null;
}

export type AvatarDefaultGender = 'auto' | 'male' | 'female';

export function parseAvatarDefaultGender(raw: unknown): AvatarDefaultGender {
  if (raw === 'male' || raw === 'female' || raw === 'auto') return raw;
  return 'auto';
}

/**
 * Picks default character PNG when user has no custom `avatar_url`.
 * `preference`: profile override — male/female skip name/hash; auto uses name tokens then stable hash.
 */
export function getDefaultAvatarUrl(
  seed?: string | null,
  name?: string | null,
  preference?: AvatarDefaultGender | null,
): string {
  const p = preference ?? 'auto';
  if (p === 'male') return DEFAULT_AVATAR_MALE_URL;
  if (p === 'female') return DEFAULT_AVATAR_FEMALE_URL;

  const byName = detectAvatarUrlFromName(name);
  if (byName) return byName;

  const safeSeed = (seed || '').trim() || 'default-avatar';
  const idx = hashSeed(safeSeed) % DEFAULT_AVATAR_URLS.length;
  return DEFAULT_AVATAR_URLS[idx];
}
