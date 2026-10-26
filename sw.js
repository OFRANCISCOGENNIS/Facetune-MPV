'use strict';
// The release builder replaces the revision and asset list with content-derived values.
const REVISION = '2ba06250c78934d5243d';
const PRECACHE_URLS = ["./", "README.md", "app.js", "assets/demo.png", "assets/fonts/InstrumentSerif-OFL.txt", "assets/fonts/InstrumentSerif-Regular.ttf", "assets/fonts/Manrope-OFL.txt", "assets/fonts/Manrope.ttf", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon.svg", "index.html", "manifest.webmanifest", "runtime.js", "styles.css", "vendor/heic-to/LICENSE", "vendor/heic-to/SOURCES.md", "vendor/heic-to/UPSTREAM-README.md", "vendor/heic-to/heic-to.js", "vendor/heic-to/libde265-COPYING", "vendor/heic-to/libheif-COPYING", "vendor/heic-to/provenance.json"];
const PREFIX = `portrait:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = PREFIX + REVISION;
const assetURLs = new Set(PRECACHE_URLS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  // A failed or partial download never activates an incomplete release.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)));
  // Updates wait until existing tabs are closed, preserving in-progress edits.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = ''; url.hash = '';
  if (!assetURLs.has(url.href)) return;
  // Cache only the app's release assets. User photos/blobs never enter this cache.
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(url.href);
    return cached || fetch(event.request);
  }));
});
