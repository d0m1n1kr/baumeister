import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { version } from './package.json';

// GitHub Pages serves the app under /<repo>/ — the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    // Versionsnummer in die statische index.html (Lade-Splash) einsetzen
    {
      name: 'html-version',
      transformIndexHtml: (html: string) => html.replace(/__APP_VERSION__/g, version)
    },
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Tiny Towns',
        short_name: 'Tiny Towns',
        description: 'Tiny Towns for tablets and phones — play on one device or together with your own devices',
        lang: 'en',
        // Feste Identität, Geltungsbereich und Startadresse: Erst damit kann
        // Chrome/Android einen geteilten Link (#daily=…, #join=…) an die
        // installierte App geben, statt ihn im Browser zu öffnen. Und
        // navigate-existing heißt: in das schon offene Fenster, kein zweites.
        // iOS kann das nicht — Safari übergibt Web-Links nie an eine
        // Homescreen-App. Dort führt die Tageswahl im Startbildschirm hin.
        id: base,
        scope: base,
        start_url: base,
        launch_handler: { client_mode: 'navigate-existing' },
        display: 'standalone',
        orientation: 'any',
        background_color: '#1e2a38',
        theme_color: '#1e2a38',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}']
      }
    })
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
} as any);
