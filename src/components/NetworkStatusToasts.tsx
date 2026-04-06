import { useEffect, useRef } from 'react';
import { toast } from '../lib/toast';

const OFFLINE_TOAST_ID = 'network-offline';
const SLOW_TOAST_ID = 'network-slow';

type NetworkInformationLike = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function getConnectionInfo(): NetworkInformationLike | null {
  const nav = navigator as unknown as {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

function isSlowConnection(info: NetworkInformationLike | null): boolean {
  if (!info) return false;
  const et = String(info.effectiveType || '').toLowerCase();
  if (et === 'slow-2g' || et === '2g') return true;
  const rtt = typeof info.rtt === 'number' ? info.rtt : null;
  if (rtt != null && rtt >= 700) return true;
  const down = typeof info.downlink === 'number' ? info.downlink : null;
  if (down != null && down > 0 && down < 0.8) return true;
  return false;
}

export function NetworkStatusToasts() {
  const hasAnnouncedOnceRef = useRef(false);
  const wasOfflineRef = useRef(false);
  const slowShownRef = useRef(false);

  useEffect(() => {
    const showOffline = () => {
      hasAnnouncedOnceRef.current = true;
      wasOfflineRef.current = true;
      slowShownRef.current = false;
      toast.dismiss(SLOW_TOAST_ID);
      toast.warning('You’re offline', {
        id: OFFLINE_TOAST_ID,
        description: 'Check your internet connection. We’ll reconnect automatically.',
        duration: Infinity,
      });
    };

    const showOnline = () => {
      toast.dismiss(OFFLINE_TOAST_ID);
      const shouldAnnounce = hasAnnouncedOnceRef.current || wasOfflineRef.current;
      wasOfflineRef.current = false;
      if (!shouldAnnounce) return;
      toast.success('Back online', {
        description: 'Connection restored.',
      });
    };

    const evaluateSlow = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const slow = isSlowConnection(getConnectionInfo());
      if (slow && !slowShownRef.current) {
        slowShownRef.current = true;
        toast.info('Slow internet', {
          id: SLOW_TOAST_ID,
          description: 'Loading may take longer.',
          duration: 6000,
        });
      } else if (!slow) {
        slowShownRef.current = false;
        toast.dismiss(SLOW_TOAST_ID);
      }
    };

    // Initial state (only announce if we start offline).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showOffline();
    } else {
      evaluateSlow();
    }

    window.addEventListener('offline', showOffline);
    window.addEventListener('online', showOnline);

    const conn = getConnectionInfo();
    const onConnChange = () => evaluateSlow();
    conn?.addEventListener?.('change', onConnChange);

    return () => {
      window.removeEventListener('offline', showOffline);
      window.removeEventListener('online', showOnline);
      conn?.removeEventListener?.('change', onConnChange);
      toast.dismiss(OFFLINE_TOAST_ID);
      toast.dismiss(SLOW_TOAST_ID);
    };
  }, []);

  return null;
}

