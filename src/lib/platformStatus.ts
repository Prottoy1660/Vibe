export type PlatformLevel = 'operational' | 'degraded' | 'maintenance' | 'unknown';

export interface PlatformStatusValue {
  level: PlatformLevel;
  message: string;
  show_banner: boolean;
  /** When true, non-admins only see the full-screen maintenance page (admins use the app normally). */
  lock_public_site: boolean;
}

export const DEFAULT_PLATFORM_STATUS: PlatformStatusValue = {
  level: 'operational',
  message: '',
  show_banner: false,
  lock_public_site: false,
};

export function parsePlatformStatus(raw: unknown): PlatformStatusValue {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLATFORM_STATUS };
  const o = raw as Record<string, unknown>;
  const level = o.level === 'degraded' || o.level === 'maintenance' || o.level === 'operational' ? o.level : 'operational';
  return {
    level,
    message: typeof o.message === 'string' ? o.message : '',
    show_banner: o.show_banner === true,
    lock_public_site: o.lock_public_site === true,
  };
}
