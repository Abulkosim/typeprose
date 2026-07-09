import type { AuthorListItem, Band, ThemeListItem } from '@prosetype/schema';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { fetchAuthors, fetchThemes } from '../lib/api';
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
 * `/library` (§9.1): browse by band, author, or theme. Each pick navigates to
 * `/` with the corresponding filter, which the stage loads (and keeps across
 * Tab). Rendered as a title card, labels in letterspaced caps, picks as quiet
 * buttons that warm to bone on hover.
 */
export function LibraryPage(): ReactElement {
  usePageMeta({
    title: 'Library',
    description:
      'Browse the prosetype library by author, theme, or difficulty band, Dostoevsky to Woolf, and start a typing test on any passage.',
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
            <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
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
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="subtitle text-smoke">by theme</h2>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {state.themes.map((theme) => (
                <button
                  key={theme.theme}
                  type="button"
                  onClick={() => {
                    start({ theme: theme.theme });
                  }}
                  className="text-bone transition-opacity duration-150 hover:text-tungsten"
                >
                  {prettify(theme.theme)}
                  <span className="ml-2 text-smoke">{theme.passageCount}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
