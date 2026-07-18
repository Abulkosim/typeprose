// @typeprose/schema - zod schemas + shared DTOs (plan §3, §7.5, §8).

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
  passageSummaryItemSchema,
  passageSummaryListSchema,
  type Band,
  type Passage,
  type AuthorListItem,
  type ThemeListItem,
  type PassageSummaryItem,
} from './passages.ts';

export {
  runStatsSchema,
  resultModeSchema,
  MAX_WORD_TEXT_LEN,
  MAX_TIMED_TEXT_LEN,
  MAX_CUSTOM_TEXT_LEN,
  TIMED_SECONDS,
  TIMED_DURATIONS_MS,
  postResultsRequestSchema,
  postResultsResponseSchema,
  dailyStreakInfoSchema,
  type RunStats,
  type ResultMode,
  type TimedSeconds,
  type PostResultsRequest,
  type PostResultsResponse,
  type DailyStreakInfo,
} from './results.ts';

export {
  postProfilesResponseSchema,
  getProfileResponseSchema,
  renameProfileRequestSchema,
  type PostProfilesResponse,
  type GetProfileResponse,
  type RenameProfileRequest,
} from './profiles.ts';

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
  dailyStreakStatsSchema,
  profileStatsSchema,
  type ResultSummary,
  type BestRun,
  type AuthorAggregate,
  type KeyStat,
  type BigramStat,
  type DailyStreakStats,
  type ProfileStats,
} from './stats.ts';
