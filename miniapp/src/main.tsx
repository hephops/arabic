import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import './styles.css';

import { initTelegram } from './telegram';

// Telegram Mini App muhitida ekranni to'liq ochamiz va mavzuga moslashamiz
initTelegram();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
