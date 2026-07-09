import type { Passage } from '@prosetype/schema';
import type { ReactElement } from 'react';

import { formatAttribution } from '../lib/shareCard';

/**
 * Attribution epigraph (§9.4): EB Garamond italic, e.g.
 * "Fyodor Dostoevsky, Crime and Punishment, trans. Garnett". The text is
 * built by `formatAttribution` (shared with the shareable result card).
 */
export function Epigraph({ passage }: { passage: Passage }): ReactElement {
  return <p className="font-serif text-[1.1rem] italic text-smoke">{formatAttribution(passage)}</p>;
}
