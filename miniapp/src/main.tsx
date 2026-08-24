import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import ErrorBoundary from './ErrorBoundary';
import './styles.css';

import { initTelegram } from './telegram';
import { rememberRef } from './api';

// Admin paneldan "kabinetga kirish": token URL manzilining hash
// qismida keladi (#token=...). Hash serverga YUBORILMAYDI — ya'ni
// token tarmoqda, jurnal fayllarda yoki proksida ko'rinmaydi.
//
// Tokenni saqlab, manzildan darhol tozalaymiz: brauzer tarixida
// yoki yangilanganda qayta ishlatilmasin.
(() => {
  const m = /[#&]token=([^&]+)/.exec(location.hash);
  if (!m) return;
  try {
    localStorage.setItem('token', decodeURIComponent(m[1]));
  } catch {
    /* localStorage yopiq bo'lishi mumkin */
  }
  history.replaceState(null, '', location.pathname + location.search);
})();

// Telegram Mini App muhitida ekranni to'liq ochamiz va mavzuga moslashamiz
initTelegram();

// Taklif havolasidan kelgan kodni darhol saqlab qo'yamiz: do'konchi
// kod kutib turib ekranni yangilasa ham yo'qolmasin
rememberRef();

// PWA: ilova qobig'ini keshlaydigan service worker.
//
// `updateViaCache: 'none'` — sw.js faylining o'zi ham brauzer keshidan
// emas, har doim tarmoqdan tekshiriladi. Aks holda yangi versiya
// serverga chiqqanidan keyin ham eski sw.js ishlab tura beradi va
// do'konchi F5 bosganda hamon eski ilovani ko'radi.
//
// Yangi versiya tayyor bo'lishi bilan darhol ishga tushiriladi
// (SKIP_WAITING) va sahifa BIR MARTA o'zi qayta yuklanadi — do'konchi
// Ctrl+Shift+R bosishi shart bo'lmaydi.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Kutib turgan yangi versiya bo'lsa — darhol faollashtiramiz
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage('SKIP_WAITING');
            }
          });
        });
        // Ilova qayta ochilganda ham yangilanishni darhol tekshiramiz
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      {/* Xato chiqsa oq ekran emas, tushunarli yozuv ko'rinadi */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>
);
