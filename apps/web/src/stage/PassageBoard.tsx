import type { EngineSnapshot } from '@typeprose/engine';
import { Fragment, useCallback, useLayoutEffect, useRef, type ReactElement } from 'react';

import { Word, type RegisterChar } from './Word';

/** Char spans are keyed (wordIndex, charIndex); words never near 4096 chars. */
function charKey(wordIndex: number, charIndex: number): number {
  return wordIndex * 4096 + charIndex;
}

/**
 * The passage as a 3-line window (§9.3). Words render as memoized components
 * inside a wrapping inline flow (real spaces between inline-block words, so
 * line breaks fall on word boundaries). The caret is an absolutely positioned
 * bar moved via `transform` with a 90ms ease, measured from char span refs.
 * Once the caret passes the first line, completed lines translate up smoothly
 * (200ms); under prefers-reduced-motion the slide is a cut with a brief
 * opacity fade instead (WAAPI, opacity only).
 */
export function PassageBoard({ snapshot }: { snapshot: EngineSnapshot }): ReactElement {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const charEls = useRef(new Map<number, HTMLSpanElement>());
  const scrollYRef = useRef(0);

  const registerChar: RegisterChar = useCallback((wordIndex, charIndex, el) => {
    const key = charKey(wordIndex, charIndex);
    if (el === null) charEls.current.delete(key);
    else charEls.current.set(key, el);
  }, []);

  useLayoutEffect(() => {
    const windowEl = windowRef.current;
    const wordsEl = wordsRef.current;
    const caretEl = caretRef.current;
    if (windowEl === null || wordsEl === null) return;

    const active = snapshot.words[snapshot.activeWordIndex];
    if (active === undefined) return;
    const rendered = active.target.length + active.extras.length;
    const caretIndex = Math.min(snapshot.activeCharIndex, rendered);

    // Caret sits at the left edge of the next char span, or at the right
    // edge of the last rendered span when the word is fully consumed.
    let el: HTMLSpanElement | undefined;
    let x = 0;
    if (caretIndex < rendered) {
      el = charEls.current.get(charKey(snapshot.activeWordIndex, caretIndex));
      if (el !== undefined) x = el.offsetLeft;
    } else {
      el = charEls.current.get(charKey(snapshot.activeWordIndex, rendered - 1));
      if (el !== undefined) x = el.offsetLeft + el.offsetWidth;
    }
    if (el === undefined) return;
    const y = el.offsetTop;

    if (caretEl !== null) {
      caretEl.style.transform = `translate(${String(x)}px, ${String(y)}px)`;
      caretEl.style.height = `${String(el.offsetHeight)}px`;
    }

    // 3-line window: pin the active line to the middle line once past the top.
    const lineHeight = Number.parseFloat(window.getComputedStyle(wordsEl).lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
    windowEl.style.height = `${String(lineHeight * 3)}px`;
    const line = Math.floor((y + el.offsetHeight / 2) / lineHeight);
    const targetScroll = Math.max(0, (line - 1) * lineHeight);
    if (targetScroll !== scrollYRef.current) {
      scrollYRef.current = targetScroll;
      wordsEl.style.transform = `translateY(-${String(targetScroll)}px)`;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // The global reduced-motion rule zeroes the transform transition, so
        // the scroll is an instant cut; add an opacity-only fade (motion-safe).
        wordsEl.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      }
    }
  }, [snapshot]);

  return (
    <div
      ref={windowRef}
      className="relative overflow-hidden"
      style={{ height: 'calc(3 * 2.1 * 1.35rem)' }}
    >
      <div
        ref={wordsRef}
        data-testid="passage"
        className="relative text-[1.35rem] leading-[2.1] tracking-[0.01em] transition-transform duration-200 ease-out"
      >
        {snapshot.status !== 'complete' ? (
          <div
            ref={caretRef}
            aria-hidden="true"
            className="caret-pulse absolute left-0 top-0 w-[2px] bg-tungsten transition-transform duration-[90ms] ease-out"
          />
        ) : null}
        {snapshot.words.map((word, wi) => (
          <Fragment key={word.wordIndex}>
            {wi > 0 ? ' ' : null}
            <Word word={word} registerChar={registerChar} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
