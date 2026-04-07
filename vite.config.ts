import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        // Keep dev-only Babel helpers out of production bundles.
        plugins: process.env.NODE_ENV === 'production' ? [] : ['react-dev-locator'],
      },
    }),
    tsconfigPaths(),
    VitePWA({
      // Avoid unexpected reloads while the user is filling forms / doing admin work.
      // We'll show an in-app prompt instead (see src/main.tsx).
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // Default precache pulls every hashed chunk (~2MB) — slows first SW install/update.
        // Skip the heaviest lazy chunks; they still load from network and populate runtime cache below.
        globIgnores: [
          '**/charts-*.js',
          '**/AdminRedeemCodes-*.js',
          '**/AdminEmails-*.js',
          '**/AdminUsers-*.js',
          '**/AdobeEmail-*.js',
          '**/AdminSubscriptionReminders-*.js',
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'script' && url.pathname.includes('/assets/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'vibe-js-chunks',
              expiration: {
                maxEntries: 72,
                maxAgeSeconds: 14 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Vibe Access',
        short_name: 'Vibe',
        description: 'Premium digital accounts management platform',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          {
            src: 'https://cdn.discordapp.com/attachments/1315891782298701915/1339893994305814528/vibe_access_logo-removebg-preview.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://cdn.discordapp.com/attachments/1315891782298701915/1339893994305814528/vibe_access_logo-removebg-preview.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  build: {
    // Modern browsers only — smaller, faster output than legacy ES5-style polyfills
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          if (process.env.DEBUG_PROXY === '1') {
            proxy.on('proxyReq', (_proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          }
        },
      }
    }
  }
})
