import { useEffect, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import type { PassageQuery } from '../lib/api';
import { TypingStage } from '../stage/TypingStage';
import { useTypingStore } from '../stage/typingStore';

/**
 * `/` — the test (§9.1). Reads any library filter from the query string
 * (`?band`/`?theme`/`?author`) and drives passage loading: a filter present in
 * the URL always (re)loads a matching passage (a library pick), while a bare
 * `/` only loads when there is no live run, so returning from another route
 * keeps an in-progress passage.
 */
export function StagePage(): ReactElement {
  const [params] = useSearchParams();
  const band = params.get('band') ?? undefined;
  const theme = params.get('theme') ?? undefined;
  const author = params.get('author') ?? undefined;
  const daily = params.get('daily') !== null;

  useEffect(() => {
    const state = useTypingStore.getState();
    if (daily) {
      void state.loadDaily();
      return;
    }
    const query: PassageQuery = { band, theme, author };
    const hasFilter = band !== undefined || theme !== undefined || author !== undefined;
    if (hasFilter || state.passage === null) {
      void state.loadNext(query);
    }
  }, [band, theme, author, daily]);

  return <TypingStage />;
}
