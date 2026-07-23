import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { initNetwork } from './lib/network';
import { initOutbox } from './lib/outbox';
import { initCorpusSync } from './lib/passages';
import { initMusic } from './settings/music';
import { initTheme } from './settings/theme';

initTheme();
initMusic();
initNetwork();
initCorpusSync();
initOutbox();

// Prod-only: dev never serves /sw.js, and a dev-scope worker is a debugging
// tarpit. Registered on load so it never competes with first paint.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
