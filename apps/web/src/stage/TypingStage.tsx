import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { useCommandStore } from '../command/commandStore';
import { Epigraph } from '../components/Epigraph';
import { useCreditsStore } from '../credits/creditsStore';
import { isKeyboardless } from '../lib/device';
import { ResultView } from '../result/ResultView';
import { playThock } from '../settings/sound';
import { Hud } from './Hud';
import { PassageBoard } from './PassageBoard';
import { useTypingStore, wordTestLabel } from './typingStore';

/**
 * A quiet, honest notice for touch-only devices (§ mobile): the stage's
 * hidden-textarea input model needs a physical keyboard (Tab/Esc have no
 * on-screen equivalent), so typing here would otherwise just silently fail.
 * Library/stats/leaderboard stay reachable via the letterbox nav.
 */
function KeyboardlessNotice(): ReactElement {
  return (
    <section aria-label="Typing stage unavailable" className="animate-fade-in">
      <p className="subtitle text-smoke">typeprose needs a keyboard</p>
      <p className="mt-4 text-bone">
        Typing runs require a physical keyboard - open this page on a desktop or laptop to type.
      </p>
      <p className="mt-6 text-smoke">
        You can still browse the <Link to="/library" className="text-bone hover:underline">library</Link>,{' '}
        <Link to="/stats" className="text-bone hover:underline">stats</Link>, and{' '}
        <Link to="/leaderboard" className="text-bone hover:underline">leaderboard</Link> from here.
      </p>
    </section>
  );
}

/**
 * The typing stage (plan §9.3). A visually hidden textarea holds focus;
 * chars arrive via native `beforeinput` (composition-safe), Backspace/Tab/Esc
 * via `keydown`. Timestamps are `performance.now()` captured first thing in
 * each handler; the store appends to the engine synchronously and React
 * renders from the derived snapshot.
 */
export function TypingStage(): ReactElement {
  const phase = useTypingStore((s) => s.phase);
  const test = useTypingStore((s) => s.test);
  const snapshot = useTypingStore((s) => s.snapshot);
  const completedRun = useTypingStore((s) => s.completedRun);
  const paletteOpen = useCommandStore((s) => s.isOpen);
  const creditsOpen = useCreditsStore((s) => s.isOpen);
  const [keyboardless] = useState(() => isKeyboardless());

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unfocused, setUnfocused] = useState(false);

  // Passage loading is driven by StagePage (which reads the library filter
  // from the URL); the stage only owns input, focus, and rendering.

  // Regain focus whenever a fresh run becomes typeable - but not while the
  // command palette or the credits sequence owns the keys; refocus the
  // textarea when they close.
  useEffect(() => {
    if (phase === 'typing' && !paletteOpen && !creditsOpen) textareaRef.current?.focus();
  }, [phase, paletteOpen, creditsOpen]);

  // Native listeners on the hidden textarea: beforeinput gives inputType +
  // data with a cancelable event (React's synthetic onBeforeInput does not).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;

    const onBeforeInput = (e: InputEvent): void => {
      const ts = performance.now(); // before any other work
      if (e.inputType.startsWith('insertFrom')) {
        e.preventDefault(); // paste/drop/autofill never reach the engine
        return;
      }
      // Ignore everything between compositionstart and compositionend
      // (composition beforeinput is not reliably cancelable - don't try).
      if (composingRef.current || e.isComposing || e.inputType === 'insertCompositionText') {
        return;
      }
      e.preventDefault(); // the textarea itself stays empty
      if (e.inputType !== 'insertText' || e.data === null) return;
      const store = useTypingStore.getState();
      for (const char of e.data) {
        if (char === ' ') {
          store.commitSpace(ts);
          playThock('space');
        } else {
          store.typeChar(char, ts);
          playThock('key');
        }
      }
    };

    const onInput = (): void => {
      // Anything that slipped past preventDefault (e.g. composition) is
      // discarded - the engine, not the textarea, holds the typed state.
      if (!composingRef.current) textarea.value = '';
    };

    const onCompositionStart = (): void => {
      composingRef.current = true;
    };
    const onCompositionEnd = (): void => {
      composingRef.current = false;
      textarea.value = ''; // composed text is ignored (§9.3)
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      const ts = performance.now();
      useTypingStore.getState().setCapsLock(e.getModifierState('CapsLock'));
      if (e.key === 'Backspace') {
        e.preventDefault();
        useTypingStore.getState().backspace(ts, e.ctrlKey || e.altKey);
        playThock('back');
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      useTypingStore.getState().setCapsLock(e.getModifierState('CapsLock'));
    };
    const onPaste = (e: ClipboardEvent): void => {
      e.preventDefault();
    };

    textarea.addEventListener('beforeinput', onBeforeInput);
    textarea.addEventListener('input', onInput);
    textarea.addEventListener('compositionstart', onCompositionStart);
    textarea.addEventListener('compositionend', onCompositionEnd);
    textarea.addEventListener('keydown', onKeyDown);
    textarea.addEventListener('keyup', onKeyUp);
    textarea.addEventListener('paste', onPaste);
    return () => {
      textarea.removeEventListener('beforeinput', onBeforeInput);
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('compositionstart', onCompositionStart);
      textarea.removeEventListener('compositionend', onCompositionEnd);
      textarea.removeEventListener('keydown', onKeyDown);
      textarea.removeEventListener('keyup', onKeyUp);
      textarea.removeEventListener('paste', onPaste);
    };
  }, []);

  // Document-level keys while the stage is up: Tab = next passage (also from
  // the result and error views, and never moves focus), and printable keys
  // never reach browser chrome (Firefox quick-find on ' " /) - if focus
  // escaped the textarea, swallow the key and refocus. Esc is owned by the
  // command palette (its capture handler toggles it); while the palette is
  // open we bail entirely so keystrokes reach its search box, not here.
  useEffect(() => {
    const onDocKeyDown = (e: KeyboardEvent): void => {
      if (useCommandStore.getState().isOpen) return;
      if (useCreditsStore.getState().isOpen) return; // the title sequence owns the keys
      if (e.key === 'Tab') {
        e.preventDefault();
        void useTypingStore.getState().loadNext();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (document.activeElement !== textareaRef.current) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', onDocKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onDocKeyDown, true);
    };
  }, []);

  // Focus loss (§9.3): after 1s unfocused, dim the stage and offer refocus.
  // The engine's clock is wall time, so the timer keeps running regardless.
  const handleBlur = (): void => {
    blurTimerRef.current = setTimeout(() => {
      setUnfocused(true);
    }, 1000);
  };
  const handleFocus = (): void => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setUnfocused(false);
  };
  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
    };
  }, []);

  if (keyboardless) return <KeyboardlessNotice />;

  return (
    <section aria-label="Typing stage" onClick={() => textareaRef.current?.focus()}>
      <textarea
        ref={textareaRef}
        className="absolute h-px w-px resize-none opacity-0"
        aria-label="Type the passage"
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        tabIndex={-1}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />

      {phase === 'loading' ? <p className="subtitle text-smoke">loading&hellip;</p> : null}

      {phase === 'error' ? (
        <div>
          <p className="subtitle text-smoke">could not load a passage</p>
          <p className="subtitle mt-4 text-smoke">tab to retry</p>
        </div>
      ) : null}

      {phase === 'typing' && snapshot !== null && test !== null ? (
        <div className="relative">
          <div className={`transition-opacity duration-150 ${unfocused ? 'opacity-30' : ''}`}>
            <Hud />
            <PassageBoard snapshot={snapshot} />
            <div className="mt-10">
              {test.kind === 'passage' ? (
                <Epigraph passage={test.passage} />
              ) : (
                <p className="subtitle text-smoke">{wordTestLabel(test)}</p>
              )}
            </div>
          </div>
          {unfocused ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="subtitle text-bone">click to refocus</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'complete' && completedRun !== null && test !== null ? (
        <ResultView
          run={completedRun}
          test={test}
          onNext={() => {
            void useTypingStore.getState().loadNext();
          }}
        />
      ) : null}
    </section>
  );
}
