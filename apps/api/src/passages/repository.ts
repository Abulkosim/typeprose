import type { AuthorListItem, Band, Passage, PassageSummaryItem, ThemeListItem } from '@prosetype/schema';

/**
 * Filters for random passage selection (plan §8, GET /passages/next).
 * All filters are optional and combine with AND.
 */
export interface PassageFilter {
  band?: Band | undefined;
  /** Theme slug; matches passages whose themes array contains it. */
  theme?: string | undefined;
  /** Author slug. */
  author?: string | undefined;
  /** Recently seen passage ids to exclude; route validation caps this at 20. */
  excludeIds: number[];
}

/** Filters for listing individual passages (GET /passages, library batch B). */
export interface PassageListFilter {
  band?: Band | undefined;
  theme?: string | undefined;
  author?: string | undefined;
}

/**
 * Data access for passages, kept behind an interface so route tests can
 * substitute a stub (no live Postgres in unit tests until Phase 2 CI).
 */
export interface PassageRepository {
  /** A random passage matching the filter, or null when none match. */
  findRandom(filter: PassageFilter): Promise<Passage | null>;
  /**
   * The deterministic "passage of the day" for a UTC date key (§10.3): stable
   * for a given key, varies day to day. Null only when the corpus is empty.
   */
  findDaily(dateKey: string): Promise<Passage | null>;
  /** A passage by id with full attribution, or null when absent. */
  findById(id: number): Promise<Passage | null>;
  /** Authors that have at least one passage, with their passage counts (GET /authors). */
  listAuthors(): Promise<AuthorListItem[]>;
  /** Distinct themes across passages, with their passage counts (GET /themes). */
  listThemes(): Promise<ThemeListItem[]>;
  /**
   * Passage summaries matching the filter, for the library's per-passage
   * listing (GET /passages, batch B item 1.5). Ordered by author then work.
   */
  list(filter: PassageListFilter): Promise<PassageSummaryItem[]>;
}
