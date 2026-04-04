import React, { useEffect, useState } from 'react';
import { Loader2, Music2, Save } from 'lucide-react';
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
    <div className="mx-auto max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft dark:border-[#26262d] dark:bg-[#151518] dark:shadow-none">
        <div className="bg-gradient-to-r from-primary/15 via-violet-500/10 to-secondary/10 px-6 py-5 dark:from-primary/20 dark:via-violet-500/10 dark:to-secondary/15">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-primary shadow-sm dark:bg-[#1a1a1f] dark:text-violet-400">
              <Music2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Lobby music</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">YouTube audio only · no video UI</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-6">
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`flex w-full items-center justify-between gap-4 rounded-2xl border-2 px-4 py-4 text-left transition ${
              enabled
                ? 'border-primary bg-primary/10 dark:border-violet-500/50 dark:bg-primary/15'
                : 'border-gray-200 bg-gray-50 dark:border-[#26262d] dark:bg-[#0f0f12]'
            }`}
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {enabled ? 'On — music available to customers' : 'Off — no music for anyone'}
            </span>
            <span
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                enabled ? 'bg-primary dark:bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                  enabled ? 'left-7' : 'left-1'
                }`}
              />
            </span>
          </button>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              YouTube links
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={8}
              placeholder={
                'One playlist or multiple videos (one per line):\nhttps://www.youtube.com/watch?v=…\nhttps://www.youtube.com/playlist?list=…'
              }
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-100"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Videos are shuffled. One playlist uses YouTube shuffle. Audio starts muted until the customer taps the volume
              control (browser rules).
            </p>
          </div>

          {msg && (
            <p
              className={`text-sm ${msg.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {msg.text}
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-secondary py-3.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:opacity-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
