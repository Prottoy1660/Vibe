export type LobbyMusicSettings = {
  enabled: boolean;
  /** YouTube watch, youtu.be, or playlist URLs — one per line in admin. */
  urls: string[];
};

export const DEFAULT_LOBBY_MUSIC: LobbyMusicSettings = {
  enabled: false,
  urls: [],
};

export function parseLobbyMusicSettings(raw: unknown): LobbyMusicSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LOBBY_MUSIC };
  const o = raw as Record<string, unknown>;
  const urlsRaw = o.urls;
  const urls = Array.isArray(urlsRaw)
    ? urlsRaw.filter((u): u is string => typeof u === 'string').map((u) => u.trim()).filter(Boolean)
    : [];
  return {
    enabled: o.enabled === true,
    urls: [...new Set(urls)],
  };
}

export type ParsedTubeLine =
  | { kind: 'video'; id: string }
  | { kind: 'playlist'; id: string };

/** Extract a video id or playlist id from a line (URL or bare 11-char video id). */
export function parseYouTubeLine(line: string): ParsedTubeLine | null {
  const u = line.trim();
  if (!u) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(u)) {
    return { kind: 'video', id: u };
  }

  try {
    const url = new URL(u, 'https://www.youtube.com');
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return { kind: 'video', id };
    }

    if (host.includes('youtube.com')) {
      const list = url.searchParams.get('list');
      if (list && /^[a-zA-Z0-9_-]+$/.test(list)) {
        return { kind: 'playlist', id: list };
      }
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return { kind: 'video', id: v };
    }
  } catch {
    return null;
  }

  return null;
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
