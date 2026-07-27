// Latin + latin-ext subsets only: the app is English (i18n/Cyrillic deferred),
// and latin-ext carries the accented author names (Brontë, Ántonia). Dropping
// the cyrillic/greek/vietnamese subsets the top-level `400.css` would pull cuts
// a stack of never-rendered font files out of the bundle *and* the SW precache.
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-ext-400-italic.css';
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
