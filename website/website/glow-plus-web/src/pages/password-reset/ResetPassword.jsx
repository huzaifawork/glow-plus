import { useState } from 'react';
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
      <p>Enter a new password for your account.</p>
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
