import { create } from 'zustand';

/**
 * Optional keystroke sound (Phase 3, plan §10.3 "typewriter thock"). Synthesized
 * with the Web Audio API - no audio assets - so it stays a zero-dependency,
 * self-hosted concern like the fonts. Off by default (sound is intrusive; this
 * mirrors Monkeytype). The mute toggle persists; a keystroke is a user gesture,
 * so the AudioContext resumes fine under the autoplay policy.
 */
export const SOUND_STORAGE_KEY = 'prosetype.sound';

export type ThockVariant = 'key' | 'space' | 'back';

function readStored(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function persist(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private mode: still audible this session, just not remembered.
  }
}

interface SoundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

export const useSoundStore = create<SoundState>()((set, get) => ({
  enabled: readStored(),
  setEnabled: (enabled) => {
    persist(enabled);
    set({ enabled });
    if (enabled) void warm(); // create/resume the context on the enabling gesture
  },
  toggle: () => {
    get().setEnabled(!get().enabled);
  },
}));

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/**
 * Lazily create (and resume) the shared AudioContext; null where unsupported.
 * Shared with the music engine (music.ts): browsers cap live contexts, and one
 * context means one resume path under the autoplay policy.
 */
export function ensureAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

async function warm(): Promise<void> {
  const c = ensureAudioContext();
  if (c !== null && c.state === 'suspended') await c.resume();
}

/** A short white-noise buffer, reused across presses (regen on rate change). */
function ensureNoise(c: AudioContext): AudioBuffer {
  if (noise === null || noise.sampleRate !== c.sampleRate) {
    const length = Math.floor(c.sampleRate * 0.05);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    noise = buffer;
  }
  return noise;
}

/**
 * Play one percussive thock: a band-passed noise click over a short low sine
 * "body", with a ~40ms decay. A no-op when muted or where Web Audio is absent
 * (tests, SSR), so callers need no guards of their own.
 */
export function playThock(variant: ThockVariant = 'key'): void {
  if (!useSoundStore.getState().enabled) return;
  const c = ensureAudioContext();
  if (c === null) return;

  const now = c.currentTime;
  const peak = variant === 'back' ? 0.1 : 0.18;
  const clickHz = variant === 'space' ? 900 : variant === 'back' ? 520 : 1400;
  const bodyHz = variant === 'space' ? 120 : 170;

  const click = c.createBufferSource();
  click.buffer = ensureNoise(c);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = clickHz;
  band.Q.value = 0.8;
  const clickGain = c.createGain();
  clickGain.gain.setValueAtTime(0, now);
  clickGain.gain.linearRampToValueAtTime(peak, now + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  click.connect(band).connect(clickGain).connect(c.destination);

  const body = c.createOscillator();
  body.type = 'sine';
  body.frequency.value = bodyHz;
  const bodyGain = c.createGain();
  bodyGain.gain.setValueAtTime(peak * 0.5, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  body.connect(bodyGain).connect(c.destination);

  click.start(now);
  click.stop(now + 0.05);
  body.start(now);
  body.stop(now + 0.05);
}
