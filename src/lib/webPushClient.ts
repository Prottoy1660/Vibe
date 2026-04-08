import { supabase } from './supabase';
import { getApiBaseUrl } from './apiBase';

function apiUrl(path: string) {
  const b = getApiBaseUrl().replace(/\/$/, '');
  return b ? `${b}${path}` : path;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari exposes navigator.standalone; others use display-mode media query
  const iosStandalone = (navigator as any).standalone === true;
  const displayMode = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  return iosStandalone || displayMode;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(ua);
}

export async function enableWebPush(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === 'undefined') return { ok: false, reason: 'Not in a browser' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'Service Worker not supported' };
  if (!('PushManager' in window)) return { ok: false, reason: 'Push not supported' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'Permission not granted' };

  const keyRes = await fetch(apiUrl('/api/push/vapid-public-key'));
  const keyJson = await keyRes.json().catch(() => ({}));
  const publicKey = String(keyJson?.publicKey || '').trim();
  if (!keyRes.ok || !publicKey) return { ok: false, reason: 'Missing VAPID public key' };

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const res = await fetch(apiUrl('/api/push/subscribe'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      subscription,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, reason: String(json?.error || 'Subscribe failed') };
  return { ok: true };
}

export async function disableWebPush(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return { ok: false, reason: 'Not supported' };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  const endpoint = sub?.endpoint || '';
  if (sub) await sub.unsubscribe().catch(() => {});

  const res = await fetch(apiUrl('/api/push/unsubscribe'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ endpoint }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, reason: String(json?.error || 'Unsubscribe failed') };
  return { ok: true };
}

