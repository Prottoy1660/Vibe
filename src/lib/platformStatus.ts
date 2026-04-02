export type PlatformLevel = 'operational' | 'degraded' | 'maintenance' | 'unknown';

export interface PlatformStatusValue {
  level: PlatformLevel;
  message: string;
  show_banner: boolean;
}

export const DEFAULT_PLATFORM_STATUS: PlatformStatusValue = {
  level: 'operational',
  message: '',
  show_banner: false,
};

export function parsePlatformStatus(raw: unknown): PlatformStatusValue {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLATFORM_STATUS };
  const o = raw as Record<string, unknown>;
  const level = o.level === 'degraded' || o.level === 'maintenance' || o.level === 'operational' ? o.level : 'operational';
  return {
    level,
    message: typeof o.message === 'string' ? o.message : '',
    show_banner: o.show_banner === true,
  };
}
