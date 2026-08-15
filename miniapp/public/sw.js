// ARABIC.ONE — service worker.
// Ilova qobig'i keshlanadi: internet sekin yoki yo'q bo'lsa ham tez ochiladi.
// API so'rovlari keshlanmaydi (ma'lumot doim yangi bo'lishi kerak).
//
// MUHIM: index.html hech qachon brauzer keshidan (HTTP kesh) olinmasin —
// aks holda yangi deploy qilingan versiya F5 bilan ko'rinmay qoladi,
// faqat to'liq tozalash (Ctrl+Shift+R) yordam beradi. Shuning uchun
// navigatsiya so'rovi doim `cache: 'no-store'` bilan, to'g'ridan-to'g'ri
// tarmoqdan so'raladi.

const CACHE = 'arabic-one-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

// Keshlash MUMKIN bo'lgan manzillar — faqat shu ro'yxat.
//
// DIQQAT: bu "oq ro'yxat" (faqat ruxsat berilgani keshlanadi), "qora
// ro'yxat" emas. Avval teskarisi edi — "boshqa domen bo'lmasa keshla" —
// va bu jimgina katta xatoga olib keldi: ishlab chiqarishda API
// so'rovlari Vite proksisi orqali AYNAN SHU domenga ketadi
// (https://duk.goybusut.uz/suppliers), ya'ni "boshqa domen" emas.
// Natijada /suppliers, /debts, /dashboard kabi javoblar birinchi
// ochilishda keshga tushib, keyin abadiy o'sha eski javob qaytardi:
// do'konchi postavshik qo'shsa ham ro'yxatda ko'rinmasdi, F5 yordam
// bermasdi, faqat Ctrl+Shift+R (u service worker'ni chetlab o'tadi)
// ma'lumotni yangilardi.
//
// Shu sababli yangi marshrut qo'shilganda hech narsa qilish shart emas —
// keshga faqat build fayllari va ikonkalar tushadi, API javoblari hech
// qachon tushmaydi.
function isCacheable(pathname) {
  // Vite build fayllari: mazmuni o'zgarsa nomi (hash) ham o'zgaradi
  if (pathname.startsWith('/assets/')) return true;
  if (pathname === '/manifest.webmanifest') return true;
  // Ildizdagi ikonkalar (/icon-192.png, /apple-touch-icon.png ...).
  // Ichki papkadagilar (masalan /uploads/rasm.png — do'kon yuklagan
  // surat, o'zgarishi mumkin) bu shartga tushmaydi.
  return /^\/[a-z0-9._-]+\.(png|ico|svg|webp|jpg|jpeg|woff2?)$/i.test(pathname);
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((url) => fetch(url, { cache: 'no-store' }).then((res) => c.put(url, res)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Yangi versiya kutmasdan darhol ishga tushsin — sahifa buni eshitib
// bir marta o'zi qayta yuklanadi (main.tsx dagi controllerchange).
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Boshqa domen (Telegram SDK va h.k.) — keshlanmaydi
  if (url.origin !== self.location.origin) return;

  // Navigatsiya (F5, havoladan kirish): har doim tarmoqdan, brauzer
  // keshini ham chetlab o'tib — shu orqali yangi deploy darhol ko'rinadi.
  // Faqat internet yo'q bo'lsa keshdagi qobiqqa qaytamiz.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('/index.html').then((r) => r || fetch(req)))
    );
    return;
  }

  // API va boshqa hamma narsa — service worker umuman aralashmaydi,
  // brauzer o'zi to'g'ridan-to'g'ri tarmoqqa chiqadi. Ma'lumot doim yangi.
  if (!isCacheable(url.pathname)) return;

  // Statik fayllar: Vite ularni mazmuni o'zgarsa yangi nom (hash) bilan
  // chiqaradi, shuning uchun bitta URL doim bitta mazmunni bildiradi —
  // keshdan olish xavfsiz.
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
