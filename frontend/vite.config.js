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
