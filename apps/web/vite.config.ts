import { createHash } from 'node:crypto';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Public files precached alongside the built assets. '/' stands in for
// index.html (navigations fall back to caches.match('/')). Deliberately not
// listed: music (runtime-cached on first play), og-image/robots/sitemap
// (crawler-only).
const PUBLIC_PRECACHE = [
  '/',
  '/favicon.svg',
  '/favicon-96x96.png',
  '/site.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

/**
 * Injects the precache manifest into the service worker chunk (emitted
 * unhashed as /sw.js - browsers look the worker up at a stable URL). The
 * cache name embeds a hash of the manifest so every deploy yields a
 * byte-different sw.js, which is what triggers the browser's update check.
 */
function swPrecache(): Plugin {
  return {
    name: 'typeprose-sw-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const sw = bundle['sw.js'];
      if (sw === undefined || sw.type !== 'chunk') {
        throw new Error('sw.js chunk missing from bundle');
      }
      const assets = Object.keys(bundle)
        .filter((name) => name !== 'sw.js' && name !== 'index.html')
        .map((name) => `/${name}`);
      const precache = [...PUBLIC_PRECACHE, ...assets];
      const hash = createHash('sha256').update(JSON.stringify(precache)).digest('hex').slice(0, 8);
      sw.code = sw.code
        .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(precache))
        .replaceAll('__BUILD_HASH__', JSON.stringify(hash));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swPrecache()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sw: 'src/sw.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
