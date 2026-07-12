import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { requestClaim, verifyClaim } from '../lib/api';
import { usePageMeta } from '../lib/head';
import { ensureProfileId, setProfileId } from '../lib/profile';

/**
 * `/claim` (Phase 3, plan §10.3, account claim). Two modes:
 *  - with `?token=…`: verify the magic link, adopt the canonical profile id
 *    (results may have been merged into an existing account), show the name.
 *  - otherwise: an email form that requests a magic link for this profile.
 * In dev the link is logged by the API's console mailer rather than emailed.
 */
type RequestState = 'idle' | 'sending' | 'sent' | 'error';
type VerifyState =
  | { status: 'verifying' }
  | { status: 'done'; displayName: string }
  | { status: 'error' };

export function ClaimPage(): ReactElement {
  usePageMeta({
    title: 'Claim your account',
    description: 'Claim your prosetype profile with an email magic link to keep your history.',
    noindex: true,
  });
  const [params] = useSearchParams();
  const token = params.get('token');

  const [email, setEmail] = useState('');
  const [reqState, setReqState] = useState<RequestState>('idle');
  const [verify, setVerify] = useState<VerifyState>({ status: 'verifying' });

  useEffect(() => {
    if (token === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await verifyClaim(token);
        setProfileId(result.profileId);
        if (!cancelled) setVerify({ status: 'done', displayName: result.displayName });
      } catch {
        if (!cancelled) setVerify({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (reqState === 'sending' || email.trim() === '') return;
    setReqState('sending');
    void (async () => {
      try {
        const profileId = await ensureProfileId();
        await requestClaim(profileId, email.trim());
        setReqState('sent');
      } catch {
        setReqState('error');
      }
    })();
  };

  if (token !== null) {
    return (
      <section aria-label="Claim account" className="animate-fade-in">
        <h1 className="subtitle text-smoke">claim account</h1>
        {verify.status === 'verifying' ? (
          <p className="mt-6 text-smoke">verifying the link&hellip;</p>
        ) : verify.status === 'done' ? (
          <>
            <p className="mt-6 text-bone">
              Claimed. You are <span className="text-tungsten">{verify.displayName}</span>.
            </p>
            <p className="mt-2 text-smoke">
              Your history now follows this account, and your name appears on the leaderboard.
            </p>
          </>
        ) : (
          <>
            <p className="mt-6 text-bone">That link didn&rsquo;t work.</p>
            <p className="mt-2 text-smoke">It may have expired or already been used. Request a new one.</p>
          </>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Claim account" className="animate-fade-in">
      <h1 className="subtitle text-smoke">claim account</h1>
      <p className="mt-6 max-w-[46ch] text-smoke">
        Attach an email to keep your history across devices and put a name on the leaderboard. We
        send a one-time link; there is no password.
      </p>

      {reqState === 'sent' ? (
        <p className="mt-8 text-bone">
          Check <span className="text-tungsten">{email}</span> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-wrap items-center gap-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="bg-bar px-4 py-2 text-bone placeholder:text-smoke"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={reqState === 'sending'}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            {reqState === 'sending' ? 'sending…' : 'send link'}
          </button>
          {reqState === 'error' ? (
            <span className="subtitle text-blood">couldn&rsquo;t send - try again</span>
          ) : null}
        </form>
      )}
    </section>
  );
}
