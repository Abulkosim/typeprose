import { useEffect } from 'react';

/**
 * Per-route document metadata for this SPA (SEO). Social scrapers don't run
 * JS, so the crawlable Open Graph/Twitter tags live in index.html; this hook
 * keeps the live document title, meta description, and robots directive in
 * sync as the user navigates: the bits browsers, history, and logged-in users
 * actually see. Dependency-free (no react-helmet).
 */

const SITE_NAME = 'prosetype';
const DEFAULT_TITLE = 'prosetype: type the classics';

interface PageMeta {
  /** Page title; suffixed with " · prosetype". Omit on the home route for the full default. */
  title?: string;
  /** Meta description for this route. Falls back to the index.html default when omitted. */
  description?: string;
  /** Keep this route out of search indexes (per-profile or transactional pages). */
  noindex?: boolean;
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el === null) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function usePageMeta({ title, description, noindex = false }: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title === undefined ? DEFAULT_TITLE : `${title} · ${SITE_NAME}`;

    if (description !== undefined) {
      upsertMeta('meta[name="description"]', 'name', 'description', description);
    }

    upsertMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      noindex ? 'noindex, nofollow' : 'index, follow',
    );

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, noindex]);
}
