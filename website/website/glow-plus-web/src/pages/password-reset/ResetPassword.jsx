import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/config.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // [F65] — null while we ask, then either the address this link resets or the
  // reason it is dead. The form does not render until we know.
  const [check, setCheck] = useState(null);

  /**
   * Validate the link BEFORE offering the form.  [F65]
   *
   * This page used to check only that a `token` query param existed, so a
   * spent or expired link produced the same confident "Choose a new password"
   * screen as a fresh one, and the refusal arrived only after the customer had
   * typed a password and pressed the button. Found in J5 by clicking a used
   * link a second time: the form came back.
   *
   * The wasted keystrokes are the small half. The real one is that someone
   * re-opening an old link sets what they believe is their new password and is
   * then locked out with no idea why it does not work.
   */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(API_BASE_URL + '/auth/reset-password/' + encodeURIComponent(token))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setCheck({ ok: true, email: body.email });
        else setCheck({ ok: false, reason: body.message || 'This link is no longer valid.' });
      })
      .catch(() => {
        // A network failure is NOT a dead token, and saying so would send a
        // customer with a perfectly good link off to request another one.
        if (!cancelled) setCheck({ ok: true, email: null, unverified: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(API_BASE_URL + '/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'This link may have expired or already been used.');
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="card status-error">
        <Brand />
        <div className="icon">⚠️</div>
        <h1>Missing reset link</h1>
        <p>This link looks incomplete. Please use the link from your email exactly as it was sent.</p>
      </div>
    );
  }

  if (token && check === null) {
    return (
      <div className="card">
        <Brand />
        <h1>Checking your link…</h1>
      </div>
    );
  }

  if (token && check && !check.ok) {
    return (
      <div className="card status-error">
        <Brand />
        <div className="icon">⚠️</div>
        <h1>This link has expired</h1>
        <p>{check.reason} Reset links can only be used once, and they expire an hour after they are sent.</p>
        <p>
          <a className="btn btn-primary" href="/forgot-password">
            Request a new link
          </a>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card status-success">
        <Brand />
        <div className="icon">✅</div>
        <h1>Password updated</h1>
        <p>Your password has been changed. You can now sign in with your new password.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <Brand />
      <h1>Choose a new password</h1>
      <p>
        {check && check.email
          ? `Enter a new password for ${check.email}.`
          : 'Enter a new password for your account.'}
      </p>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
        {error && <div className="err">{error}</div>}
      </form>
    </div>
  );
}
