// ARABIC.ONE — service worker.
// Ilova qobig'i keshlanadi: internet sekin yoki yo'q bo'lsa ham tez ochiladi.
// API so'rovlari keshlanmaydi (ma'lumot doim yangi bo'lishi kerak).

const CACHE = 'arabic-one-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Boshqa domen (API, Telegram SDK) — keshlanmaydi
  if (url.origin !== self.location.origin) return;

  // Navigatsiya: avval tarmoq, ulanmasa keshdagi qobiq
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // Statik fayllar: keshdan, parallel ravishda yangilanadi
  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
