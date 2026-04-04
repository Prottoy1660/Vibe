import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  parseLobbyMusicSettings,
  type LobbyMusicSettings,
  parseYouTubeLine,
  shuffleInPlace,
  type ParsedTubeLine,
} from '../lib/lobbyMusicSettings';

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  loadVideoById: (id: string) => void;
  loadPlaylist: (cfg: { list: string; listType: string; index?: number }) => void;
  setShuffle: (s: boolean) => void;
  destroy: () => void;
};

type YTPlayerCtor = new (
  el: string | HTMLElement,
  opts: {
    height: string;
    width: string;
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: { target: YTPlayer }) => void;
      onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    };
  }
) => YTPlayer;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as {
    YT?: { Player: YTPlayerCtor };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => resolve();
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      done();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
}

const ENDED = 0;

type Props = {
  userId: string | null;
  /** When true, lobby music is disabled (admin panel). */
  adminRoute: boolean;
};

/**
 * Hidden YouTube player (audio-focused) + floating control for signed-in customers.
 * Hidden entirely when admin disables feature or customer is on /admin.
 */
export const LobbyMusicPlayer: React.FC<Props> = ({ userId, adminRoute }) => {
  const hostId = `lobby-yt-${useId().replace(/:/g, '')}`;
  const [settings, setSettings] = useState<LobbyMusicSettings | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const videoIdsRef = useRef<string[]>([]);
  const playlistIdsRef = useRef<string[]>([]);
  const videoIndexRef = useRef(0);
  const inPlaylistAfterVideosRef = useRef(false);
  const playlistOnlyRef = useRef(false);
  const [fabMode, setFabMode] = useState<'playing' | 'muted'>('playing');

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'lobby_music').maybeSingle();
    if (error) {
      setSettings(null);
      return;
    }
    setSettings(parseLobbyMusicSettings(data?.value));
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const fetchSettingsRef = useRef(fetchSettings);
  fetchSettingsRef.current = fetchSettings;

  useEffect(() => {
    const channelName = `lobby_music_rt:${crypto.randomUUID()}`;
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.lobby_music' },
        () => {
          void fetchSettingsRef.current();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const globOn = settings?.enabled === true && (settings.urls?.length ?? 0) > 0;
  const active = Boolean(userId && !adminRoute && globOn);

  const syncFabFromPlayer = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      setFabMode(p.isMuted() ? 'muted' : 'playing');
    } catch {
      setFabMode('muted');
    }
  }, []);

  useEffect(() => {
    if (!active) {
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    const lines = settings?.urls ?? [];
    const parsed = lines.map(parseYouTubeLine).filter((x): x is ParsedTubeLine => x != null);
    if (parsed.length === 0) return;

    const videos = shuffleInPlace(parsed.filter((x) => x.kind === 'video').map((x) => x.id));
    const playlists = [...new Set(parsed.filter((x) => x.kind === 'playlist').map((x) => x.id))];

    videoIdsRef.current = videos;
    playlistIdsRef.current = playlists;
    videoIndexRef.current = 0;
    inPlaylistAfterVideosRef.current = false;
    playlistOnlyRef.current = false;

    let cancelled = false;

    const boot = async () => {
      await loadYouTubeApi();
      if (cancelled) return;
      const w = window as unknown as { YT: { Player: YTPlayerCtor } };
      const host = document.getElementById(hostId);
      if (!host) return;

      const commonVars: Record<string, string | number> = {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        mute: 0,
      };

      const onStateChange = (e: { data: number; target: YTPlayer }) => {
        if (playlistOnlyRef.current) return;
        if (e.data !== ENDED) return;
        const p = e.target;
        if (!inPlaylistAfterVideosRef.current && videoIdsRef.current.length > 0) {
          const next = videoIndexRef.current + 1;
          if (next < videoIdsRef.current.length) {
            videoIndexRef.current = next;
            p.loadVideoById(videoIdsRef.current[next]);
            return;
          }
          if (playlistIdsRef.current.length > 0) {
            playlistOnlyRef.current = true;
            inPlaylistAfterVideosRef.current = true;
            p.loadPlaylist({
              listType: 'playlist',
              list: playlistIdsRef.current[0],
              index: 0,
            });
            p.setShuffle(true);
          }
          return;
        }
      };

      try {
        if (videos.length === 0 && playlists.length > 0) {
          playlistOnlyRef.current = true;
          inPlaylistAfterVideosRef.current = true;
          playerRef.current = new w.YT.Player(host, {
            height: '1',
            width: '1',
            playerVars: {
              ...commonVars,
              listType: 'playlist',
              list: playlists[0],
            },
            events: {
              onReady: (e) => {
                try {
                  e.target.setShuffle(true);
                  e.target.playVideo();
                } catch {
                  /* ignore */
                }
                queueMicrotask(syncFabFromPlayer);
              },
              onStateChange: () => {
                queueMicrotask(syncFabFromPlayer);
              },
            },
          });
        } else if (videos.length > 0) {
          playerRef.current = new w.YT.Player(host, {
            height: '1',
            width: '1',
            videoId: videos[0],
            playerVars: commonVars,
            events: {
              onReady: (e) => {
                e.target.playVideo();
                queueMicrotask(syncFabFromPlayer);
              },
              onStateChange: (ev) => {
                queueMicrotask(syncFabFromPlayer);
                onStateChange(ev);
              },
            },
          });
        }
      } catch {
        /* ignore */
      }
    };

    void boot();

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [active, hostId, settings?.enabled, settings?.urls?.join('\n'), syncFabFromPlayer]);

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.isMuted()) {
        p.unMute();
        setFabMode('playing');
      } else {
        p.mute();
        setFabMode('muted');
      }
    } catch {
      /* ignore */
    }
  };

  if (!active) return null;

  const lines = settings?.urls ?? [];
  const hasParsed = lines.map(parseYouTubeLine).some((x) => x != null);
  if (!hasParsed) return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 right-0 h-1 w-1 overflow-hidden opacity-0"
        style={{ zIndex: -1 }}
      >
        <div id={hostId} />
      </div>

      {/* Sit to the left of SupportChatWidget (h-14 + gutters) so FABs never overlap */}
      <div className="fixed bottom-6 right-[5.25rem] z-[50] flex flex-col items-end gap-2 md:right-24">
        <div className="flex gap-1.5">
          {fabMode === 'playing' ? (
            <button
              type="button"
              onClick={toggleMute}
              title="Mute"
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-primary shadow-lg transition hover:scale-[1.03] hover:shadow-xl dark:border-[#26262d] dark:bg-[#151518] dark:text-violet-400"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleMute}
              title="Sound on"
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-md transition hover:scale-[1.03] dark:border-[#26262d] dark:bg-[#151518] dark:text-gray-300"
            >
              <VolumeX className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
};
