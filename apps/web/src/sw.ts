/// <reference lib="webworker" />
// Self-contained by design: this file must import nothing so Rollup emits it
// as a single standalone chunk at /sw.js (see the sw entry + precache plugin
// in vite.config.ts, which injects the two build-time placeholders below).
// Typechecked separately under tsconfig.sw.json (WebWorker lib, no DOM).
//
// Strategy: /api/* is never intercepted (offline data is an app-layer
// concern); navigations are network-first with the precached shell as the
// offline fallback, so online users always get the freshest deploy and a new
// worker activates only when all tabs close - no skipWaiting, no reload.

// The bare export makes this a module so the `self` declaration below shadows
// the lib global instead of colliding with it; Rollup elides the empty export.
export {};

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE_MANIFEST__: readonly string[];
declare const __BUILD_HASH__: string;

const APP_CACHE = `typeprose-app-${__BUILD_HASH__}`;
const MUSIC_CACHE = 'typeprose-music';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll([...__PRECACHE_MANIFEST__])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith('typeprose-app-') && key !== APP_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

/** Network-first shell: freshest deploy online, cached '/' offline. */
async function handleNavigate(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match('/');
    return cached ?? Response.error();
  }
}

/** Hashed assets are immutable - cache wins, network fills the cache. */
async function assetCacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached !== undefined) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(APP_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Music is cached by URL, not Request: <audio> sends Range requests, and a
 * 206 can't be put into a cache. Fetching the bare URL gets the full file
 * once; a 200 satisfies ranged playback fine. Lives in its own unversioned
 * cache so deploys never re-download ~10MB of m4a.
 */
async function musicCacheFirst(url: string): Promise<Response> {
  const cached = await caches.match(url);
  if (cached !== undefined) return cached;
  const response = await fetch(url);
  if (response.status === 200) {
    const cache = await caches.open(MUSIC_CACHE);
    await cache.put(url, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // pass through untouched

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetCacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/music/')) {
    event.respondWith(musicCacheFirst(url.href));
    return;
  }
  // Anything else same-origin (icons, manifest): precache if present, else network.
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
