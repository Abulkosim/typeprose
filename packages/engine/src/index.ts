// @prosetype/engine — pure TS typing engine + stats (plan §7).
// Zero runtime dependencies, no DOM. Deterministic: given (passageText,
// eventLog) every output is reproducible; the live engine and the pure replay
// share one reducer, so live stats and computeStats cannot drift.

export {
  EngineError,
  EventAfterCompletionError,
  IndexOutOfRangeError,
  InvalidEventError,
  InvalidInputError,
  InvalidPassageError,
  MalformedLogError,
  NonMonotonicTimestampError,
  UnknownEventCodeError,
} from './errors.ts';

export { parsePassage, type ParsedPassage, type PassageWord } from './passage.ts';

export { MAX_EXTRA_CHARS, type CharState } from './state.ts';

export {
  TypingEngine,
  createEngine,
  type EngineSnapshot,
  type EngineStatus,
  type WordSnapshot,
} from './engine.ts';

export { computePerSecondRawWpm, computeStats, kogasa, type RunStats } from './replay.ts';

export { computeHeatmap, type CharHeat, type HeatmapData, type SlowWord } from './heatmap.ts';

export {
  aggregateKeyStats,
  MIN_OCCURRENCES,
  type BigramStat,
  type KeyStat,
  type KeyStatsData,
  type KeyStatsRun,
} from './keystats.ts';
