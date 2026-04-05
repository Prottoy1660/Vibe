import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parsePlatformStatus, type PlatformStatusValue, DEFAULT_PLATFORM_STATUS } from '../lib/platformStatus';

type Ctx = {
  platform: PlatformStatusValue;
  ready: boolean;
  refresh: () => Promise<void>;
};

const MaintenanceModeContext = createContext<Ctx>({
  platform: DEFAULT_PLATFORM_STATUS,
  ready: false,
  refresh: async () => {},
});

export const useMaintenanceMode = () => useContext(MaintenanceModeContext);

export const MaintenanceModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [platform, setPlatform] = useState<PlatformStatusValue>(DEFAULT_PLATFORM_STATUS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'platform_status')
        .maybeSingle();
      if (error) return;
      setPlatform(parsePlatformStatus(data?.value));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel('platform_status_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.platform_status' },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [refresh]);

  return (
    <MaintenanceModeContext.Provider value={{ platform, ready, refresh }}>{children}</MaintenanceModeContext.Provider>
  );
};
