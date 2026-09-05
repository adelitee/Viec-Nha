/* Service worker — chạy offline phần vỏ app; dữ liệu vẫn cần mạng */
const CACHE = 'viecnha-v1';
const SHELL = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // không cache lời gọi Google Apps Script
  if (url.hostname.indexOf('script.google') >= 0) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => { });
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
