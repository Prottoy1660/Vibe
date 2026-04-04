/** Detect provider quota / billing / rate-limit style errors (Gemini, OpenAI). */
export function isAiQuotaOrBillingErrorMessage(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('exceeded your current') ||
    m.includes('resource_exhausted') ||
    m.includes('resource exhausted') ||
    m.includes('rate limit') ||
    m.includes('rate-limit') ||
    m.includes('too many requests') ||
    m.includes('billing') ||
    m.includes('free_tier') ||
    m.includes('limit: 0') ||
    m.includes('insufficient_quota') ||
    m.includes('429')
  );
}

/** Shown in the help chat UI — no raw API text. */
export const SUPPORT_AI_QUOTA_USER_MESSAGE =
  'এই মুহূর্তে AI সেবার কোটা শেষ বা সাময়িক সীমায় আছে। কিছুক্ষণ পর আবার চেষ্টা করুন, অথবা WhatsApp ও Support টিকিট ব্যবহার করুন।';

export const SUPPORT_AI_GENERIC_USER_MESSAGE =
  'দুঃখিত, এখন উত্তর দিতে পারছি না। আবার চেষ্টা করুন, অথবা Support পেজে টিকিট খুলুন।';
