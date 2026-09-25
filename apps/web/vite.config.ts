import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'assets/img/iso.png',
        'assets/img/logo.png',
      ],
      manifest: {
        name: 'Cero Tres',
        short_name: '03',
        description: 'Pedidos de pepitos Cero Tres',
        theme_color: '#3E1F1C',
        background_color: '#3E1F1C',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/assets/img/iso.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});
