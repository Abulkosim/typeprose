import { lazy, Suspense, type ReactElement } from 'react';
import { Route, Routes } from 'react-router';

import { Letterbox } from './components/Letterbox';
import { StagePage } from './routes/StagePage';

// The stage (landing + typing) stays eager - it must paint instantly. The
// secondary routes split into their own chunks, fetched on first navigation
// (and precached by the service worker, so they stay available offline). Each
// page already renders its own loading state, so the Suspense fallback while
// the chunk arrives is deliberately empty - the letterbox frame is still up.
const StatsPage = lazy(() => import('./routes/StatsPage').then((m) => ({ default: m.StatsPage })));
const LibraryPage = lazy(() =>
  import('./routes/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const LeaderboardPage = lazy(() =>
  import('./routes/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
);
const ClaimPage = lazy(() => import('./routes/ClaimPage').then((m) => ({ default: m.ClaimPage })));
const AccountPage = lazy(() =>
  import('./routes/AccountPage').then((m) => ({ default: m.AccountPage })),
);

export function App(): ReactElement {
  return (
    <Letterbox>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<StagePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/claim" element={<ClaimPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </Suspense>
    </Letterbox>
  );
}
