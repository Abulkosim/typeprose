import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { CREDIT_CARDS, CREDITS_HOLD_MS, CREDITS_MS_PER_CHAR, type CreditCard } from './credits';
import { useCreditsStore } from './creditsStore';

/**
 * "Roll credits" - the about screen staged as an opening title sequence
 * (§9.4 film language) instead of a modal. The house goes dark (the
 * `credits-noir` scope re-points the theme tokens, so even matinee plays it
 * in a dark room), and each card types itself out behind the app's own caret
 * before the supporting line fades in - the product introducing itself in
 * its own medium.
 *
 * Controls mirror a patient projectionist: cards auto-advance after a hold;
 * click / space / enter / tab skips (first to the full card, then onward);
 * Esc leaves the theater. The palette's Esc handler and the stage's document
 * key handler both bail while this is open (same coordination the palette
 * itself uses), so keys land here.
 */
export function TitleSequence(): ReactElement | null {
  const isOpen = useCreditsStore((s) => s.isOpen);
  if (!isOpen) return null;
  // Inner component mounts fresh per open, so the sequence always starts
  // from card one with no reset bookkeeping.
  return <CreditsRoll />;
}

function CreditsRoll(): ReactElement {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const card = CREDIT_CARDS[index] as CreditCard;
  const titleDone = revealed >= card.title.length;

  const advance = useCallback(() => {
    if (card.final === true || index >= CREDIT_CARDS.length - 1) {
      useCreditsStore.getState().close();
      return;
    }
    setIndex(index + 1);
  }, [card.final, index]);

  // Skip is two-stage, like impatient projector-cranking: a mid-type card
  // completes in place; a landed card cuts to the next.
  const skip = useCallback(() => {
    if (!titleDone) {
      setRevealed(card.title.length);
      return;
    }
    advance();
  }, [titleDone, card.title.length, advance]);

  // Typewriter reveal, one card at a time. Reduced motion lands the whole
  // title in a frame (opacity-only fades remain, per the motion language).
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setRevealed(reduceMotion ? card.title.length : 0);
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setRevealed((r) => {
        if (r + 1 >= card.title.length) clearInterval(interval);
        return r + 1;
      });
    }, CREDITS_MS_PER_CHAR);
    return () => {
      clearInterval(interval);
    };
    // card is derived from index; re-run per card only.
  }, [index]);

  // Hold the landed card, then cut.
  useEffect(() => {
    if (!titleDone) return;
    const timer = setTimeout(advance, CREDITS_HOLD_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [titleDone, advance]);

  // Document keys while the sequence is up. Capture phase, and the palette /
  // stage handlers bail on `useCreditsStore.isOpen`, so nothing double-fires.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        useCreditsStore.getState().close();
        return;
      }
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        skip();
        return;
      }
      // Any other plain key dies here - preventDefault so no beforeinput ever
      // fires on the stage's hidden textarea behind the overlay, stopPropagation
      // so its keydown handlers never see it. Modified combos (browser/system
      // shortcuts) stay live.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [skip]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About prosetype"
      className="credits-noir film-stage fixed inset-0 z-50 flex flex-col items-center justify-center bg-stage px-6 text-bone"
      onMouseDown={skip}
    >
      {/* keyed on index: each card gets its own 180ms film-cut fade in */}
      <div
        key={index}
        className="animate-fade-in flex max-w-[52ch] flex-col items-center text-center"
      >
        <p
          className={`text-[1.7rem] leading-snug tracking-[0.04em] ${
            card.final === true ? 'text-tungsten' : 'text-bone'
          }`}
          aria-label={card.title}
        >
          <span aria-hidden>{card.title.slice(0, revealed)}</span>
          {titleDone ? null : (
            <span
              aria-hidden
              className="caret-pulse ml-1 inline-block h-[1.1em] w-[2px] translate-y-[0.18em] bg-tungsten"
            />
          )}
        </p>
        {/* fixed-height body slot so the card doesn't jump when it fades in */}
        <div className="mt-6 min-h-12">
          {titleDone && card.body !== undefined ? (
            <p className="subtitle animate-fade-in leading-relaxed text-smoke">{card.body}</p>
          ) : null}
        </div>
      </div>

      {/* frame counter: one dot per card, the current frame lit */}
      <div aria-hidden className="absolute bottom-16 flex items-center gap-3">
        {CREDIT_CARDS.map((c, i) => (
          <span
            key={c.title}
            className={`h-1 w-1 rounded-full ${i === index ? 'bg-tungsten' : 'bg-smoke/40'}`}
          />
        ))}
      </div>
      <p className="subtitle absolute bottom-8 text-smoke/60">
        click &middot; next&ensp;&ensp;esc &middot; leave the theater
      </p>
    </div>
  );
}
