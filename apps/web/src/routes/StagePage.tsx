import type { ReactElement } from 'react';

/**
 * Phase 0 placeholder for the typing stage (§9.1 `/`). No engine yet — this
 * renders a sample styled passage so the §9.4 tokens can be judged in place:
 * bone for typed text, smoke for pending, tungsten caret, blood for an
 * example error character, EB Garamond italic for the attribution epigraph.
 */
export function StagePage(): ReactElement {
  return (
    <section aria-label="Typing stage preview">
      <p className="text-[1.35rem] leading-[2.1] tracking-[0.01em]">
        {/* "Typed" portion — bone on stage */}
        <span className="text-bone">
          Pain and suffering are al
          {/* Example error character — blood, errors only */}
          <span className="text-blood">v</span>
          ays inevitable for a large intelligence
        </span>
        {/* Caret — the single tungsten accent */}
        <span
          aria-hidden="true"
          className="caret-pulse mx-[1px] inline-block h-[1.15em] w-[2px] translate-y-[0.22em] bg-tungsten"
        />
        {/* Pending portion — smoke */}
        <span className="text-smoke">
          {' and a deep heart. The really great men must, I think, have '}
          great sadness on earth.
        </span>
      </p>

      <p className="mt-10 font-serif text-[1.1rem] italic text-smoke">
        &mdash; Fyodor Dostoevsky, Crime and Punishment, trans. Garnett
      </p>

      <p className="subtitle mt-16 text-tungsten">
        42 wpm <span className="text-smoke">&middot; 0:12</span>
      </p>
    </section>
  );
}
