import type { ReactElement } from 'react';

/** Phase 0 placeholder for `/stats` (§9.1). History + aggregates arrive in Phase 2. */
export function StatsPage(): ReactElement {
  return (
    <section aria-label="Stats">
      <h1 className="subtitle text-smoke">stats</h1>
      <p className="mt-6 text-bone">Nothing on the reel yet.</p>
      <p className="mt-2 text-smoke">Your history and per-author aggregates will appear here.</p>
    </section>
  );
}
