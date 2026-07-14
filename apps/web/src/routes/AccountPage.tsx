import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { deleteProfile, renameProfile } from '../lib/api';
import { usePageMeta } from '../lib/head';
import { clearProfileId, getStoredProfileId } from '../lib/profile';
import { useProfileStore } from '../lib/profileInfo';

type RenameState = 'idle' | 'saving' | 'saved' | 'error';
/** Delete is a two-step confirm: the first click only arms the button. */
type DeleteState = 'idle' | 'armed' | 'deleting' | 'deleted' | 'error';

/**
 * `/account` (Batch D, plan §3.1 account management): rename, see claimed
 * state, sign out, or permanently delete a profile. No auth beyond the
 * localStorage profile id - this page only ever acts on the caller's own.
 */
export function AccountPage(): ReactElement {
  usePageMeta({
    title: 'Account',
    description:
      'Manage your prosetype profile: rename it, claim it with an email, sign out, or delete your data.',
    noindex: true,
  });
  const navigate = useNavigate();
  const info = useProfileStore((s) => s.info);
  const refresh = useProfileStore((s) => s.refresh);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [renameState, setRenameState] = useState<RenameState>('idle');
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const profileId = getStoredProfileId();

  // Refresh once on mount only - a passive page load, not a live subscription.
  useEffect(() => {
    void refresh().then(() => setLoaded(true));
  }, [refresh]);

  useEffect(() => {
    if (info !== null) setName(info.displayName ?? '');
  }, [info]);

  if (!loaded) {
    return (
      <section aria-label="Account" className="animate-fade-in">
        <h1 className="subtitle text-smoke">account</h1>
      </section>
    );
  }

  if (deleteState === 'deleted') {
    return (
      <section aria-label="Account" className="animate-fade-in">
        <h1 className="subtitle text-smoke">account</h1>
        <p className="mt-6 text-bone">Deleted.</p>
        <p className="mt-2 text-smoke">
          Your profile and its history are gone.{' '}
          <Link to="/" className="text-tungsten transition-opacity duration-150 hover:text-bone">
            Start typing
          </Link>{' '}
          again and a fresh anonymous profile begins.
        </p>
      </section>
    );
  }

  if (profileId === null || info === null) {
    return (
      <section aria-label="Account" className="animate-fade-in">
        <h1 className="subtitle text-smoke">account</h1>
        <p className="mt-6 text-bone">anonymous &mdash; nothing saved yet</p>
        <p className="mt-2 max-w-[46ch] text-smoke">
          <Link to="/" className="text-tungsten transition-opacity duration-150 hover:text-bone">
            Start typing
          </Link>{' '}
          to create a profile, then{' '}
          <Link
            to="/claim"
            className="text-tungsten transition-opacity duration-150 hover:text-bone"
          >
            claim it with an email
          </Link>{' '}
          to keep your history across devices.
        </p>
      </section>
    );
  }

  const onRename = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || renameState === 'saving') return;
    setRenameState('saving');
    void (async () => {
      try {
        await renameProfile(profileId, trimmed);
        await refresh();
        setRenameState('saved');
      } catch {
        setRenameState('error');
      }
    })();
  };

  const onSignOut = (): void => {
    clearProfileId();
    void refresh();
    navigate('/');
  };

  const onDelete = (): void => {
    if (deleteState !== 'armed') {
      setDeleteState('armed');
      return;
    }
    setDeleteState('deleting');
    void (async () => {
      try {
        await deleteProfile(profileId);
        clearProfileId();
        await refresh();
        setDeleteState('deleted');
      } catch {
        setDeleteState('error');
      }
    })();
  };

  return (
    <section aria-label="Account" className="animate-fade-in">
      <h1 className="subtitle text-smoke">account</h1>

      {info.claimed ? (
        <p className="mt-6 text-bone">
          You are <span className="text-tungsten">{info.displayName}</span>
          {info.email !== null ? <span className="text-smoke"> &middot; {info.email}</span> : null}.
        </p>
      ) : (
        <>
          <p className="mt-6 text-bone">anonymous profile</p>
          <p className="mt-2 max-w-[46ch] text-smoke">
            <Link
              to="/claim"
              className="text-tungsten transition-opacity duration-150 hover:text-bone"
            >
              Attach an email
            </Link>{' '}
            to keep your history across devices and put a name on the leaderboard.
          </p>
        </>
      )}

      <form onSubmit={onRename} className="mt-8 flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={32}
          aria-label="Display name"
          placeholder="display name"
          className="bg-bar px-4 py-2 text-bone placeholder:text-smoke"
        />
        <button
          type="submit"
          disabled={renameState === 'saving'}
          className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
        >
          {renameState === 'saving' ? 'saving…' : 'save name'}
        </button>
        {renameState === 'saved' ? <span className="subtitle text-smoke">saved</span> : null}
        {renameState === 'error' ? (
          <span className="subtitle text-blood">couldn&rsquo;t save - try again</span>
        ) : null}
      </form>
      <p className="mt-2 text-smoke">This name shows on the leaderboard.</p>

      <div className="mt-10 flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={onSignOut}
          className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
        >
          sign out
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteState === 'deleting'}
          className="subtitle text-blood transition-opacity duration-150 hover:text-bone"
        >
          {deleteState === 'armed'
            ? 'click again to delete everything'
            : deleteState === 'deleting'
              ? 'deleting…'
              : 'delete my data'}
        </button>
        {deleteState === 'error' ? (
          <span className="subtitle text-blood">couldn&rsquo;t delete - try again</span>
        ) : null}
      </div>
      {!info.claimed ? (
        <p className="mt-2 max-w-[46ch] text-smoke">
          Signing out of an unclaimed profile makes its history unreachable - claim it first if you
          want to keep it.
        </p>
      ) : null}
    </section>
  );
}
