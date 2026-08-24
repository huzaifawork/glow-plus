/**
 * Staff invite acceptance — T24.
 *
 * The other half of the invite flow: the page the emailed link lands on.
 * `APP_URL + /staff/accept-invite?token=…` is baked into the backend
 * (staff.service.ts), so this route can't change — the same constraint
 * /verify-email and /reset-password carry.
 *
 * Both calls it makes are public. The invitee has no account yet, so there is
 * no token to send; the invite token in the URL is the only credential, and
 * the server treats it as single-use.
 */
import { useEffect, useState } from 'react';
import { acceptStaffInvite, previewStaffInvite } from '../../lib/api.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

export default function AcceptInvitePage() {
  const token = new URLSearchParams(window.location.search).get('token');

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its invite token. Please use the link from your email.');
      return;
    }
    previewStaffInvite(token).then(
      (data) => {
        setInvite(data);
        setName(data.name ?? '');
      },
      (err) => setLoadError(err.message),
    );
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    // Checked here as well as server-side purely so the user doesn't have to
    // wait for a round trip to learn they mistyped.
    if (password !== confirm) {
      setError('Those passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptStaffInvite({ token, password, name: name.trim() });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card center">
        <Brand />
        {loadError ? (
          <>
            <h1>This invite can&rsquo;t be used</h1>
            <p className="err" data-testid="load-error">{loadError}</p>
            <p>Invites expire after 7 days, and each one can only be used once. Ask the salon to send a new one.</p>
          </>
        ) : done ? (
          <>
            <h1>You&rsquo;re on the team</h1>
            <p data-testid="done">
              Your account is ready. Sign in with <strong>{invite?.email}</strong> and the password you just chose.
            </p>
            <a className="btn btn-primary btn-link" href="/business/staff">Go to sign in</a>
          </>
        ) : !invite ? (
          <p>Checking your invite…</p>
        ) : (
          <>
            <h1>Join {invite.businessName}</h1>
            <p data-testid="invite-summary">
              You&rsquo;ve been invited as <strong>{invite.role === 'OWNER' ? 'an owner' : 'staff'}</strong>. Choose a
              password to activate <strong>{invite.email}</strong>.
            </p>
            <form onSubmit={submit} className="form">
              <label className="field">
                <span>Your name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  required
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat it"
                />
              </label>
              {error ? <p className="err" data-testid="accept-error">{error}</p> : null}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Activating…' : 'Activate my account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
