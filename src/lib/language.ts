export type AppLanguage = 'bn' | 'en';

export function detectBrowserLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en';
  const raw = (window.navigator.language || '').toLowerCase();
  return raw.startsWith('bn') ? 'bn' : 'en';
}

export function getStoredLanguage(): AppLanguage | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem('app_lang');
  return v === 'bn' || v === 'en' ? v : null;
}

export function setStoredLanguage(lang: AppLanguage) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('app_lang', lang);
}

export function pickLocalized(primary: string, bangla?: string, lang?: AppLanguage) {
  if (lang === 'bn' && bangla && bangla.trim()) return bangla;
  return primary;
}

