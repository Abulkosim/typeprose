import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';

import { Letterbox } from './components/Letterbox';
import { LibraryPage } from './routes/LibraryPage';
import { StagePage } from './routes/StagePage';
import { StatsPage } from './routes/StatsPage';

export function App(): ReactElement {
  return (
    <Letterbox>
      <Routes>
        <Route path="/" element={<StagePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/library" element={<LibraryPage />} />
      </Routes>
    </Letterbox>
  );
}
