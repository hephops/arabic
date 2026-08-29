import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { installDomGuard } from './domGuard';
import './styles.css';

// Tarjimon/kengaytma sahifaga aralashsa ham panel qulamasin.
// React chizishni boshlashidan OLDIN qo'yilishi shart.
installDomGuard();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Panel qobig'ining o'zi qulasa ham oq ekran chiqmasin */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
