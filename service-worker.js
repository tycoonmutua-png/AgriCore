const CACHE_NAME = "agricore-v1";
const ASSETS = [
  "/shop.html",
  "/index.html",
  "/manifest.json",
  "/icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});