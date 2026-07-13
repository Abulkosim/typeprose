import { useEffect, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import type { PassageQuery } from '../lib/api';
import { usePageMeta } from '../lib/head';
import { TypingStage } from '../stage/TypingStage';
import { useTypingStore } from '../stage/typingStore';

/**
 * `/` - the test (§9.1). Reads any library filter from the query string
 * (`?band`/`?theme`/`?author`) and drives loading: a filter present in the URL
 * always (re)loads a matching passage (a library pick, forcing prose), while a
 * bare `/` only loads when there is no live run - following the persisted mode
 * (a word set in word mode, else a random passage) - so returning from another
 * route keeps an in-progress test. `?passage=<id>` (batch B item 1.5) loads
 * that exact passage - a library pick or a "retype this passage" link - and
 * takes priority over the broader filters.
 */
export function StagePage(): ReactElement {
  usePageMeta({
    description:
      'Practice typing on curated public-domain literary prose. Live WPM, accuracy, and consistency, then a per-word hesitation heatmap of your run.',
  });
  const [params] = useSearchParams();
  const band = params.get('band') ?? undefined;
  const theme = params.get('theme') ?? undefined;
  const author = params.get('author') ?? undefined;
  const daily = params.get('daily') !== null;
  const passageParam = params.get('passage');
  const passageId = passageParam !== null && /^\d+$/.test(passageParam) ? Number(passageParam) : null;

  useEffect(() => {
    const state = useTypingStore.getState();
    if (daily) {
      void state.loadDaily();
      return;
    }
    if (passageId !== null) {
      void state.loadById(passageId);
      return;
    }
    const hasFilter = band !== undefined || theme !== undefined || author !== undefined;
    if (hasFilter) {
      const query: PassageQuery = { band, theme, author };
      void state.loadNext(query);
      return;
    }
    // Bare "/": follow the persisted mode, but only when nothing is in progress.
    if (state.test === null) {
      void state.loadNext();
    }
  }, [band, theme, author, daily, passageId]);

  return <TypingStage />;
}
