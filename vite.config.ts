import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs'
import path from 'node:path'
import { buildBrandedSpaIndexVariants, injectSpaSiteMeta } from './api/lib/spaSiteMeta';

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
    (() => {
      let devRequestHost = '';
      return {
      name: 'superreseller-pwa-manifest',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          devRequestHost = req.headers.host ?? '';
          if (req.url?.startsWith('/manifest.webmanifest')) {
            const host = req.headers.host ?? '';
            if (host.includes('superreseller')) {
              req.url = '/manifest.superreseller.webmanifest';
            }
          }
          next();
        });
      },
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const pathOnly = (ctx.originalUrl ?? ctx.path ?? '/').split('?')[0] || '/';
          const host = devRequestHost || 'localhost:5173';
          return injectSpaSiteMeta(html, host, pathOnly);
        },
      },
      };
    })(),
    {
      name: 'spa-branded-index-build',
      closeBundle() {
        const outDir = path.resolve(process.cwd(), 'dist')
        const indexPath = path.join(outDir, 'index.html')
        if (!fs.existsSync(indexPath)) return

        const raw = fs.readFileSync(indexPath, 'utf8')
        const branded = buildBrandedSpaIndexVariants(raw)
        fs.writeFileSync(path.join(outDir, 'index.vibe.html'), branded.vibe)
        fs.writeFileSync(path.join(outDir, 'index.superreseller.html'), branded.superReseller)
      },
    },
    VitePWA({
      // We need a custom service worker to handle Web Push events.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Avoid unexpected reloads while the user is filling forms / doing admin work.
      // We'll show an in-app prompt instead (see src/main.tsx).
      registerType: 'prompt',
      includeAssets: [
        'favicon.png',
        'favicon-32.png',
        'favicon-16.png',
        'apple-touch-icon.png',
        'masked-icon.svg',
        'super.png',
        'super-favicon.svg',
        'manifest.superreseller.webmanifest',
      ],
      injectManifest: {
        // Keep install/update light like the previous Workbox config.
        globIgnores: [
          '**/charts-*.js',
          '**/AdminRedeemCodes-*.js',
          '**/AdminEmails-*.js',
          '**/AdminUsers-*.js',
          '**/AdobeEmail-*.js',
          '**/AdminSubscriptionReminders-*.js',
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
            src: 'favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'favicon.png',
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
