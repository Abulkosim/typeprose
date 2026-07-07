import type { ReactElement } from 'react';

/** Phase 0 placeholder for `/library` (§9.1). Author/theme/band browsing arrives in Phase 2. */
export function LibraryPage(): ReactElement {
  return (
    <section aria-label="Library">
      <h1 className="subtitle text-smoke">library</h1>
      <p className="mt-6 text-bone">The shelves are being stocked.</p>
      <p className="mt-2 text-smoke">Browse authors, themes, and difficulty bands here — soon.</p>
    </section>
  );
}
