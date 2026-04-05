import React, { useEffect, useState } from 'react';
import { Loader2, Music2, Save, ListMusic } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseLobbyMusicSettings, type LobbyMusicSettings } from '../../lib/lobbyMusicSettings';

/**
 * Single focused card: master switch + YouTube URLs. When off, customers see no music controls.
 */
export const AdminLobbyMusic: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [urlsText, setUrlsText] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'lobby_music').maybeSingle();
        if (error) throw error;
        const s = parseLobbyMusicSettings(data?.value);
        setEnabled(s.enabled);
        setUrlsText(s.urls.join('\n'));
      } catch {
        setMsg({ type: 'err', text: 'Could not load lobby music settings.' });
        setEnabled(false);
        setUrlsText('');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const lines = urlsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const value: LobbyMusicSettings = {
      enabled,
      urls: [...new Set(lines)],
    };
    try {
      const { error } = await supabase.from('system_settings').update(
        { value, updated_at: new Date().toISOString() }
      ).eq('key', 'lobby_music');
      if (error) throw error;
      setUrlsText(value.urls.join('\n'));
      setMsg({
        type: 'ok',
        text: enabled
          ? 'Saved. Signed-in customers can hear music (they can stop or mute from the floating control).'
          : 'Saved. Lobby music is off — customers will not see the music button.',
      });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#26262d] dark:bg-[#151518] dark:shadow-none">
        <div className="border-b border-gray-100 bg-gradient-to-r from-indigo-50/90 via-white to-violet-50/60 px-5 py-4 sm:px-8 sm:py-5 dark:border-white/5 dark:from-indigo-950/35 dark:via-[#151518] dark:to-violet-950/20">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 bg-white text-indigo-600 shadow-sm dark:border-[#2a2a32] dark:bg-[#1a1a1f] dark:text-indigo-400 sm:h-12 sm:w-12">
              <Music2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-xl">Lobby music</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">YouTube audio only · no video UI</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr_auto] lg:gap-8 lg:min-h-[min(28rem,70vh)]">
            {/* Toggle */}
            <div className="lg:col-span-5 lg:row-start-1">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                  enabled
                    ? 'border-indigo-300/80 bg-indigo-50/90 dark:border-indigo-500/35 dark:bg-indigo-500/10'
                    : 'border-gray-200 bg-gray-50/90 dark:border-[#26262d] dark:bg-[#111113]'
                }`}
              >
                <span className="min-w-0 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100 pr-2">
                  {enabled ? 'On — customers can play lobby music' : 'Off — no music for anyone'}
                </span>
                <span
                  className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                    enabled ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-300 dark:bg-zinc-600'
                  }`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200 ${
                      enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* URLs — spans full height on large screens */}
            <div className="flex min-h-[14rem] flex-col lg:col-span-7 lg:row-span-3 lg:row-start-1 lg:min-h-0">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                YouTube links
              </label>
              <textarea
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={
                  'One playlist or multiple videos (one per line):\nhttps://www.youtube.com/watch?v=…\nhttps://www.youtube.com/playlist?list=…'
                }
                className="mt-2 min-h-[12rem] w-full flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-100 resize-y [scrollbar-width:thin]"
              />
              <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Shuffled playback; playlists use YouTube shuffle. Audio starts muted until the customer unmutes (browser policy).
              </p>

              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/90 p-4 dark:border-[#26262d] dark:bg-white/[0.03] lg:hidden">
                <div className="flex items-start gap-2">
                  <ListMusic className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                    Paste watch or playlist URLs only. Empty list with music on may show no tracks until you add at least one link.
                  </p>
                </div>
              </div>
            </div>

            {/* Tips — desktop, fills middle row next to textarea */}
            <div className="hidden min-h-0 lg:col-span-5 lg:row-start-2 lg:flex lg:flex-col">
              <div className="flex flex-1 flex-col rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-[#26262d] dark:bg-white/[0.03]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <ListMusic className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" aria-hidden />
                  Quick tips
                </div>
                <ul className="mt-3 flex-1 space-y-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>One URL per line — watch links or playlist links both work.</li>
                  <li>Turn music on only after you have at least one valid URL.</li>
                  <li>Customers control mute/unmute; autoplay rules vary by browser.</li>
                </ul>
              </div>
            </div>

            {/* Status + Save */}
            <div className="flex flex-col gap-4 lg:col-span-5 lg:row-start-3">
              {msg ? (
                <div
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    msg.type === 'ok'
                      ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : 'border-red-200/80 bg-red-50/90 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200'
                  }`}
                >
                  {msg.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 sm:w-auto sm:self-start sm:min-w-[10rem]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
