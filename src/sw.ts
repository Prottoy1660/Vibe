/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: any[];
};

// Activate new SW ASAP to reduce "old HTML + new chunks" mismatches.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// SPA navigation fallback (but never for /api)
const handler = createHandlerBoundToURL('/index.html');
const navRoute = new NavigationRoute(handler, {
  denylist: [/^\/api/],
});
registerRoute(navRoute);

// Runtime cache: JS chunks under /assets (same behavior as previous config)
registerRoute(
  ({ request, url }) => request.destination === 'script' && url.pathname.includes('/assets/'),
  new StaleWhileRevalidate({
    cacheName: 'vibe-js-chunks',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 72,
        maxAgeSeconds: 14 * 24 * 60 * 60,
      }),
    ],
  }),
);

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

self.addEventListener('push', (event) => {
  const raw = event.data?.text() || '';
  let data: PushPayload = {};
  try {
    data = raw ? (JSON.parse(raw) as PushPayload) : {};
  } catch {
    data = { title: 'Vibe', body: raw };
  }

  const title = data.title || 'Vibe';
  const body = data.body || '';
  const url = data.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon-32.png',
      badge: '/favicon-32.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification as any)?.data?.url || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      const w = client as WindowClient;
      // Focus existing tab if it matches origin.
      if ('focus' in w) {
        try {
          const u = new URL(url, self.location.origin);
          const c = new URL(w.url);
          if (c.origin === u.origin) {
            await w.focus();
            // Navigate the focused client to the desired URL.
            if ('navigate' in w) await w.navigate(u.toString());
            return;
          }
        } catch {
          // ignore
        }
      }
    }
    await self.clients.openWindow(url);
  })());
});

