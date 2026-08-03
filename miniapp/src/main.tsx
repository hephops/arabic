import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import './styles.css';

// Telegram Mini App muhitida ekranni to'liq ochamiz
const tg = (window as any).Telegram?.WebApp;
tg?.ready();
tg?.expand();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
