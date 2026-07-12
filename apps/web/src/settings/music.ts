import { create } from 'zustand';

import { ensureAudioContext } from './sound';

/**
 * Optional background music: two file channels (lo-fi, classical - bundled
 * CC-BY AAC files under /music/, loudness-matched, progressive download via a
 * single HTMLAudioElement) and one synthesized channel (ambient - filtered
 * noise through the shared AudioContext, no assets). Off by default. The
 * selection persists; playback always (re)starts inside a user gesture, so
 * the autoplay policy is satisfied without special cases.
 */
export const MUSIC_STORAGE_KEY = 'prosetype.music';

export type MusicChannel = 'off' | 'lofi' | 'classical' | 'ambient';
type FileChannel = 'lofi' | 'classical';

const CHANNELS: readonly MusicChannel[] = ['off', 'lofi', 'classical', 'ambient'];
const DEFAULT_VOLUME = 0.5;

interface Track {
  src: string;
  title: string;
  artist: string;
  source: string;
  license: string;
}

/** Bundled tracks per file channel; credits mirrored in public/music/ATTRIBUTION.txt. */
const TRACKS: Record<FileChannel, readonly Track[]> = {
  lofi: [
    {
      src: '/music/lofi-1.m4a',
      title: 'Tame The Beast',
      artist: 'Lofi Lion',
      source: 'https://archive.org/details/lofi-lion-tame-the-beast',
      license: 'CC BY 4.0',
    },
    {
      src: '/music/lofi-2.m4a',
      title: 'cafe (Time for Tea)',
      artist: 'Complex Routine',
      source: 'https://archive.org/details/time-for-tea',
      license: 'CC BY 4.0',
    },
  ],
  classical: [
    {
      src: '/music/classical-1.m4a',
      title: 'Gymnopédie No. 1 (Satie)',
      artist: 'Kevin MacLeod',
      source: 'https://incompetech.com/music/royalty-free/',
      license: 'CC BY 4.0',
    },
    {
      src: '/music/classical-2.m4a',
      title: 'Prelude in C - BWV 846 (Bach)',
      artist: 'Kevin MacLeod',
      source: 'https://incompetech.com/music/royalty-free/',
      license: 'CC BY 4.0',
    },
  ],
};

interface StoredMusic {
  channel: MusicChannel;
  volume: number;
}

function readStored(): StoredMusic {
  const fallback: StoredMusic = { channel: 'off', volume: DEFAULT_VOLUME };
  try {
    const raw = localStorage.getItem(MUSIC_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const { channel, volume } = parsed as Partial<StoredMusic>;
    return {
      channel: CHANNELS.includes(channel as MusicChannel) ? (channel as MusicChannel) : 'off',
      volume: typeof volume === 'number' ? clampVolume(volume) : DEFAULT_VOLUME,
    };
  } catch {
    return fallback;
  }
}

function persist(channel: MusicChannel, volume: number): void {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify({ channel, volume }));
  } catch {
    // Private mode: still audible this session, just not remembered.
  }
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0.1, Math.round(volume * 10) / 10));
}

interface MusicState {
  channel: MusicChannel;
  volume: number;
  /** A persisted channel was restored but playback awaits the first gesture. */
  pending: boolean;
  /** Must be called from a user gesture (palette Enter/click qualifies). */
  setChannel: (channel: MusicChannel) => void;
  adjustVolume: (delta: number) => void;
}

export const useMusicStore = create<MusicState>()((set, get) => ({
  channel: readStored().channel,
  volume: readStored().volume,
  pending: false,
  setChannel: (channel) => {
    const { volume } = get();
    persist(channel, volume);
    set({ channel, pending: false });
    stopPlayback();
    if (channel !== 'off') startPlayback(channel, volume);
  },
  adjustVolume: (delta) => {
    const { channel } = get();
    const volume = clampVolume(get().volume + delta);
    persist(channel, volume);
    set({ volume });
    applyVolume(volume);
  },
}));

// --- File-channel engine (module-level, like the context in sound.ts) ---

let el: HTMLAudioElement | null = null;
let trackIndex = 0;
let failedTracks = 0;
let activeFileChannel: FileChannel | null = null;

function ensureElement(): HTMLAudioElement {
  if (el === null) {
    el = new Audio();
    el.preload = 'none';
    el.addEventListener('ended', () => {
      advance(1);
    });
    el.addEventListener('error', () => {
      if (activeFileChannel === null) return;
      failedTracks += 1;
      if (failedTracks >= TRACKS[activeFileChannel].length) {
        console.warn('prosetype: no music track in this channel could be loaded');
        return; // Channel stays selected; silent by design, no error UI.
      }
      advance(1);
    });
    el.addEventListener('playing', () => {
      failedTracks = 0;
    });
  }
  return el;
}

/** Move to the next track in the active channel (wraps; sticky activation allows it). */
function advance(step: number): void {
  if (activeFileChannel === null) return;
  const tracks = TRACKS[activeFileChannel];
  trackIndex = (trackIndex + step + tracks.length) % tracks.length;
  const audio = ensureElement();
  const track = tracks[trackIndex];
  if (track === undefined) return;
  audio.src = track.src;
  void audio.play().catch(() => {
    // Blocked or unloadable outside the error handler's reach; stay quiet.
  });
}

function startFileChannel(channel: FileChannel, volume: number): void {
  activeFileChannel = channel;
  failedTracks = 0;
  // Random starting track per selection, sequential after - reloads and
  // re-picks don't always open on the same piece.
  trackIndex = Math.floor(Math.random() * TRACKS[channel].length);
  ensureElement().volume = volume;
  advance(0);
}

function stopFileChannel(): void {
  activeFileChannel = null;
  if (el === null) return;
  el.pause();
  el.removeAttribute('src');
  el.load(); // Abort any in-flight progressive download.
}

// --- Ambient synthesis (shared AudioContext with the keystroke thocks) ---

const AMBIENT_LEVEL = 0.5; // Synthesis reads hotter than normalized files.

interface AmbientGraph {
  source: AudioBufferSourceNode;
  lfo: OscillatorNode;
  master: GainNode;
}

let ambient: AmbientGraph | null = null;
let ambientNoise: AudioBuffer | null = null;

/**
 * A 4s looping white-noise bed. White noise is stateless, so the loop point is
 * inaudible by construction; the character comes from live filtering below
 * (pre-rendered brown noise would click at the wrap).
 */
function ensureAmbientNoise(c: AudioContext): AudioBuffer {
  if (ambientNoise === null || ambientNoise.sampleRate !== c.sampleRate) {
    const length = Math.floor(c.sampleRate * 4);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    ambientNoise = buffer;
  }
  return ambientNoise;
}

/**
 * Ambient room tone: a low-passed noise bed (~220Hz) whose cutoff slowly
 * breathes under a 0.07Hz LFO, plus a faint band-passed "air" layer - texture
 * without melody or pulse, so there is nothing to follow while typing.
 */
function startAmbient(volume: number): void {
  const c = ensureAudioContext();
  if (c === null) return;
  stopAmbient();

  const source = c.createBufferSource();
  source.buffer = ensureAmbientNoise(c);
  source.loop = true;

  const bedFilter = c.createBiquadFilter();
  bedFilter.type = 'lowpass';
  bedFilter.frequency.value = 220;
  const bedGain = c.createGain();
  bedGain.gain.value = 0.5;

  const airFilter = c.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.value = 2000;
  airFilter.Q.value = 0.7;
  const airGain = c.createGain();
  airGain.gain.value = 0.06;

  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.07;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 80;
  lfo.connect(lfoDepth).connect(bedFilter.frequency);

  const master = c.createGain();
  const now = c.currentTime;
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(volume * AMBIENT_LEVEL, now + 1);

  source.connect(bedFilter).connect(bedGain).connect(master);
  source.connect(airFilter).connect(airGain).connect(master);
  master.connect(c.destination);

  source.start(now);
  lfo.start(now);
  ambient = { source, lfo, master };
}

function stopAmbient(): void {
  if (ambient === null) return;
  const { source, lfo, master } = ambient;
  ambient = null;
  const c = ensureAudioContext();
  if (c === null) return;
  const now = c.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0, now + 0.8);
  source.stop(now + 0.85);
  lfo.stop(now + 0.85);
}

// --- Shared playback plumbing ---

function startPlayback(channel: Exclude<MusicChannel, 'off'>, volume: number): void {
  if (channel === 'ambient') startAmbient(volume);
  else startFileChannel(channel, volume);
}

function stopPlayback(): void {
  stopFileChannel();
  stopAmbient();
}

function applyVolume(volume: number): void {
  if (el !== null) el.volume = volume;
  if (ambient !== null) {
    const c = ensureAudioContext();
    if (c === null) return;
    const now = c.currentTime;
    ambient.master.gain.cancelScheduledValues(now);
    ambient.master.gain.setValueAtTime(ambient.master.gain.value, now);
    ambient.master.gain.linearRampToValueAtTime(volume * AMBIENT_LEVEL, now + 0.1);
  }
}

/**
 * Restore a persisted channel without violating the autoplay policy: mark it
 * pending and start playback on the first keystroke or click anywhere. Called
 * once from main.tsx, next to initTheme().
 */
export function initMusic(): void {
  const { channel } = useMusicStore.getState();
  if (channel === 'off' || typeof document === 'undefined') return;
  useMusicStore.setState({ pending: true });

  const resume = (): void => {
    document.removeEventListener('keydown', resume, true);
    document.removeEventListener('pointerdown', resume, true);
    const state = useMusicStore.getState();
    if (!state.pending || state.channel === 'off') return;
    useMusicStore.setState({ pending: false });
    startPlayback(state.channel, state.volume);
  };
  document.addEventListener('keydown', resume, { once: true, capture: true });
  document.addEventListener('pointerdown', resume, { once: true, capture: true });
}
