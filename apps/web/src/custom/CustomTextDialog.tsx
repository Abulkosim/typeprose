import { IllegalCharacterError, describeChar, normalizeText } from '@typeprose/engine';
import { MAX_CUSTOM_TEXT_LEN } from '@typeprose/schema';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useModeStore } from '../settings/mode';
import { useTypingStore } from '../stage/typingStore';
import { useCustomTextStore } from './customTextStore';

/**
 * Floor on a custom text (chars, after normalization). Anything shorter is
 * over in an instant and the server rejects runs under 3s anyway (plan §8).
 */
export const MIN_CUSTOM_TEXT_LEN = 10;

/** What a paste normalizes to: canonical text, or the reason it can't. */
type Normalized =
  | { ok: true; text: string; foldedChars: string[] }
  | { ok: false; error: string };

function normalize(raw: string): Normalized {
  let text: string;
  let foldedChars: string[];
  try {
    ({ text, foldedChars } = normalizeText(raw));
  } catch (err) {
    if (err instanceof IllegalCharacterError) {
      return {
        ok: false,
        error: `can't type ${err.characters.map(describeChar).join(', ')}`,
      };
    }
    throw err;
  }
  if (text.length < MIN_CUSTOM_TEXT_LEN) {
    return { ok: false, error: `at least ${String(MIN_CUSTOM_TEXT_LEN)} characters` };
  }
  if (text.length > MAX_CUSTOM_TEXT_LEN) {
    return {
      ok: false,
      error: `${String(text.length)} characters - the limit is ${String(MAX_CUSTOM_TEXT_LEN)}`,
    };
  }
  return { ok: true, text, foldedChars };
}

/**
 * The custom-text dialog: paste anything, see it normalized live (curly quotes,
 * dashes, and accents fold to the same canonical shape the corpus ingest uses),
 * and start a run over it. A palette-style overlay; while it is open the stage
 * and the palette bail on their own key handling, and Esc here closes only
 * this dialog.
 */
export function CustomTextDialog(): ReactElement | null {
  const isOpen = useCustomTextStore((s) => s.isOpen);
  const close = useCustomTextStore((s) => s.close);
  const navigate = useNavigate();
  const location = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [raw, setRaw] = useState('');

  // Seed from the last custom text and focus on each open, so reopening the
  // dialog offers the previous paste for editing rather than a blank slate.
  useEffect(() => {
    if (isOpen) {
      setRaw(useModeStore.getState().customText ?? '');
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  // Esc closes only this dialog. Capture phase, like the palette's own Esc
  // handler - which bails while this dialog is open, so exactly one of the
  // two acts on any given Esc.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      useCustomTextStore.getState().close();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen]);

  const normalized = useMemo(() => normalize(raw), [raw]);
  const empty = raw.trim() === '';

  if (!isOpen) return null;

  const start = (): void => {
    if (!normalized.ok) return;
    close();
    if (location.pathname !== '/') navigate('/');
    void useTypingStore.getState().loadCustom(normalized.text);
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-6 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Custom text"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-[68ch] bg-stage">
        <textarea
          ref={textareaRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            // Enter starts the run; Shift+Enter keeps its newline (which
            // normalizes to a space anyway - it just aids editing).
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={8}
          className="w-full resize-none bg-transparent px-4 py-3 text-bone placeholder:text-smoke"
          placeholder="paste your own text to type…"
          aria-label="Custom text to type"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-4 px-4 pb-3">
          {empty ? (
            <span className="subtitle text-smoke">
              quotes, dashes, and accents are folded to typeable characters
            </span>
          ) : normalized.ok ? (
            <span className="subtitle text-smoke">
              {normalized.text.split(' ').length} words &middot; {normalized.text.length} chars
              {normalized.foldedChars.length > 0
                ? ` · folded ${normalized.foldedChars.join(' ')}`
                : ''}
            </span>
          ) : (
            // Error state (never color-alone): prefixed wording carries it.
            <span className="subtitle text-blood" role="status">
              {normalized.error}
            </span>
          )}
          <button
            type="button"
            onClick={start}
            disabled={!normalized.ok}
            className="subtitle shrink-0 cursor-pointer text-bone transition-opacity duration-150 disabled:cursor-default disabled:opacity-40"
          >
            enter to start
          </button>
        </div>
      </div>
    </div>
  );
}
