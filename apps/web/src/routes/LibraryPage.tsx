import type { AuthorListItem, Band, PassageSummaryItem, ThemeListItem } from '@prosetype/schema';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { fetchAuthors, fetchPassages, fetchThemes, type PassageQuery } from '../lib/api';
import { usePageMeta } from '../lib/head';

/** The four difficulty bands, warm-up first (§6.4). */
const BANDS: Band[] = ['warmup', 'standard', 'hard', 'brutal'];

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; authors: AuthorListItem[]; themes: ThemeListItem[] };

/** 'russian-soul' → 'russian soul' for display. */
function prettify(slug: string): string {
  return slug.replace(/-/g, ' ');
}

function count(n: number): string {
  return `${String(n)} ${n === 1 ? 'passage' : 'passages'}`;
}

/**
 * The individual passages under one author/theme (batch B item 1.5): closed
 * until toggled, fetched once on first open and cached for the row's
 * lifetime. Each passage links straight to `/?passage=<id>` - the stage picks
 * that exact passage up via `StagePage`/`loadById` rather than a random one
 * matching the filter.
 */
type DisclosureState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'open'; items: PassageSummaryItem[] };

function PassageDisclosure({ query }: { query: PassageQuery }): ReactElement {
  const [state, setState] = useState<DisclosureState>({ status: 'closed' });

  const toggle = (): void => {
    if (state.status === 'open' || state.status === 'loading') {
      setState({ status: 'closed' });
      return;
    }
    setState({ status: 'loading' });
    fetchPassages(query)
      .then((items) => setState({ status: 'open', items }))
      .catch(() => setState({ status: 'error' }));
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={state.status === 'open'}
        className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
      >
        {state.status === 'open' ? 'hide passages' : 'show passages'}
      </button>

      {state.status === 'error' ? (
        <p className="mt-2 text-smoke">could not load passages</p>
      ) : null}

      {state.status === 'open' ? (
        <ul className="mt-2 space-y-2 border-l border-smoke/20 pl-4">
          {state.items.length === 0 ? (
            <li className="text-smoke">no passages</li>
          ) : (
            state.items.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/?passage=${String(p.id)}`}
                  className="flex items-baseline justify-between gap-4 text-bone transition-opacity duration-150 hover:text-tungsten"
                >
                  <span>
                    {p.work.title} <span className="text-smoke">&middot; {p.opening}</span>
                  </span>
                  <span className="text-smoke">{p.band}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * `/library` (§9.1): browse by band, author, or theme. The author/theme name
 * navigates to `/` with the corresponding filter (a random matching passage,
 * kept across Tab); "show passages" instead lists the actual excerpts under
 * that author/theme (batch B item 1.5) for a specific pick. Rendered as a
 * title card - labels in letterspaced caps, picks as quiet buttons that warm
 * to bone on hover.
 */
export function LibraryPage(): ReactElement {
  usePageMeta({
    title: 'Library',
    description:
      'Browse the prosetype library by author, theme, or difficulty band - Dostoevsky to Woolf - and start a typing test on any passage.',
  });
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [authors, themes] = await Promise.all([fetchAuthors(), fetchThemes()]);
        if (!cancelled) setState({ status: 'ready', authors, themes });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = (params: Record<string, string>): void => {
    void navigate(`/?${new URLSearchParams(params).toString()}`);
  };

  return (
    <section aria-label="Library" className="animate-fade-in">
      <h1 className="subtitle text-smoke">library</h1>

      {state.status === 'loading' ? (
        <p className="mt-6 text-smoke">stocking the shelves&hellip;</p>
      ) : null}

      {state.status === 'error' ? (
        <p className="mt-6 text-bone">The shelves are dark. Could not load the library.</p>
      ) : null}

      {state.status === 'ready' ? (
        <div className="mt-8 space-y-12">
          <div>
            <h2 className="subtitle text-smoke">by difficulty</h2>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {BANDS.map((band) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => {
                    start({ band });
                  }}
                  className="text-bone transition-opacity duration-150 hover:text-tungsten"
                >
                  {band}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="subtitle text-smoke">by author</h2>
            <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
              {state.authors.map((author) => (
                <li key={author.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      start({ author: author.slug });
                    }}
                    className="flex w-full items-baseline justify-between gap-4 text-left text-bone transition-opacity duration-150 hover:text-tungsten"
                  >
                    <span>{author.name}</span>
                    <span className="text-smoke">{count(author.passageCount)}</span>
                  </button>
                  <PassageDisclosure query={{ author: author.slug }} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="subtitle text-smoke">by theme</h2>
            <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
              {state.themes.map((theme) => (
                <li key={theme.theme}>
                  <button
                    type="button"
                    onClick={() => {
                      start({ theme: theme.theme });
                    }}
                    className="flex w-full items-baseline justify-between gap-4 text-left text-bone transition-opacity duration-150 hover:text-tungsten"
                  >
                    <span>{prettify(theme.theme)}</span>
                    <span className="text-smoke">{count(theme.passageCount)}</span>
                  </button>
                  <PassageDisclosure query={{ theme: theme.theme }} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
