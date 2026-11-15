import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: a visitor on an old cached bundle gets the new service
      // worker + assets silently in the background and it takes over on
      // next navigation — no "new version available" prompt to build, which
      // matters here since this app deploys often (auto-commit workflow).
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'pwa/apple-touch-icon.png'],
      manifest: {
        name: 'Comonn International Courier',
        short_name: 'Comonn',
        description: 'Book, track and manage international courier shipments with Comonn.',
        theme_color: '#0E1B3D',
        background_color: '#F7F5F0',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Without these two, a newly-activated service worker sits in
        // "waiting" until every open tab is closed — registerType:
        // 'autoUpdate' alone only skips the "new version available" prompt,
        // it doesn't make the new SW actually take over. That's why a push
        // could take several manual refreshes before it showed up: each
        // refresh was still being served by the OLD SW until the browser's
        // own lifecycle finally let the new one activate. skipWaiting lets
        // the new SW activate immediately instead of waiting for old
        // clients to disconnect; clientsClaim lets it then take control of
        // already-open tabs right away instead of only on their next load.
        skipWaiting: true,
        clientsClaim: true,
        // Orders/tracking/pricing data must never be served stale from cache
        // — only the app shell (JS/CSS/images) is precached. API calls and
        // the Razorpay checkout script always hit the network directly.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
