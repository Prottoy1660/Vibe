/**
 * Only treat real quota / rate-limit / billing-limit errors as "quota" UX.
 * Avoid broad substring matches (e.g. "429" inside unrelated text) so users are not
 * told "quota finished" for invalid key, wrong model, or other failures.
 */
export function isAiQuotaOrBillingErrorMessage(message: string): boolean {
  const m = String(message || '');
  const lower = m.toLowerCase();

  // Structured prefixes from supportChatAi.ts throws
  if (/^\[gemini\s+429\b/i.test(m.trim())) return true;
  if (/^\[openai\s+429\b/i.test(m.trim())) return true;
  if (/^\[gemini\s+403\b/i.test(m.trim()) && lower.includes('quota')) return true;

  if (lower.includes('resource_exhausted') || lower.includes('resource exhausted')) return true;
  if (lower.includes('exceeded your current quota')) return true;
  if (lower.includes('quota exceeded for metric')) return true;
  if (lower.includes('insufficient_quota')) return true;
  if (lower.includes('rate_limit_exceeded') || lower.includes('rate limit exceeded')) return true;
  if (lower.includes('too many requests') && (lower.includes('rate') || lower.includes('quota'))) return true;
  if (lower.includes('billing_hard_limit')) return true;
  if (lower.includes('free_tier') && (lower.includes('limit') || lower.includes('quota'))) return true;

  return false;
}

/** Shown in the help chat UI — no raw API text. */
export const SUPPORT_AI_QUOTA_USER_MESSAGE =
  'এই মুহূর্তে AI সেবার কোটা বা রেট লিমিটে আছে। কিছুক্ষণ পর আবার চেষ্টা করুন, অথবা WhatsApp ও Support টিকিট ব্যবহার করুন।';

export const SUPPORT_AI_GENERIC_USER_MESSAGE =
  'দুঃখিত, এখন উত্তর দিতে পারছি না। আবার চেষ্টা করুন, অথবা Support পেজে টিকিট খুলুন।';
