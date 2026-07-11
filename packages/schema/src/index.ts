// @prosetype/schema — zod schemas + shared DTOs (plan §3, §7.5, §8).

export {
  CHAR_EVENTS_VERSION,
  MAX_CHAR_EVENTS,
  MAX_CHAR_EVENTS_BYTES,
  CharEventCode,
  charEventSchema,
  charEventsSchema,
  type CharEvent,
  type CharEventCodeValue,
  type CharEvents,
} from './charEvents.ts';

export {
  bandSchema,
  passageAuthorSchema,
  passageWorkSchema,
  passageSchema,
  authorListItemSchema,
  authorListSchema,
  themeListItemSchema,
  themeListSchema,
  type Band,
  type Passage,
  type AuthorListItem,
  type ThemeListItem,
} from './passages.ts';

export {
  runStatsSchema,
  postResultsRequestSchema,
  postResultsResponseSchema,
  type RunStats,
  type PostResultsRequest,
  type PostResultsResponse,
} from './results.ts';

export { postProfilesResponseSchema, type PostProfilesResponse } from './profiles.ts';

export {
  leaderboardEntrySchema,
  leaderboardSchema,
  type LeaderboardEntry,
  type Leaderboard,
} from './leaderboard.ts';

export {
  claimRequestSchema,
  claimRequestResponseSchema,
  claimVerifyRequestSchema,
  claimVerifyResponseSchema,
  type ClaimRequest,
  type ClaimRequestResponse,
  type ClaimVerifyRequest,
  type ClaimVerifyResponse,
} from './claim.ts';

export {
  resultSummarySchema,
  bestRunSchema,
  authorAggregateSchema,
  keyStatSchema,
  bigramStatSchema,
  profileStatsSchema,
  type ResultSummary,
  type BestRun,
  type AuthorAggregate,
  type KeyStat,
  type BigramStat,
  type ProfileStats,
} from './stats.ts';
