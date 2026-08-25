import { useState } from 'react';
import { API_BASE_URL } from '../../lib/config.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

/**
 * Works for both consumer and merchant accounts — the backend looks the
 * email up in both tables (T21) — so this one form serves both. Always shows
 * the same "check your email" success state regardless of whether the email
 * matched anything, matching the backend's account-enumeration protection.
 */
export default function ForgotPassword() {
  // Prefilled from `?email=` when arriving from a sign-in form [F56], so a
  // walk-in who has just been told their address is taken does not have to
  // type it a second time.
  const [email, setEmail] = useState(
    () => new URLSearchParams(window.location.search).get('email') || '',
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(API_BASE_URL + '/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Something went wrong. Please try again.');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="card status-success">
        <Brand />
        <div className="icon">✉️</div>
        <h1>Check your email</h1>
        <p>If an account exists for {email}, we've sent a link to reset your password. The link expires in 1 hour.</p>
        {/* [F66] — this page is a standalone entry point, so nothing on it
            belonged to the SPA's nav and its only exit was the browser's Back
            button. Someone who mistyped their address, or who remembered the
            password while reading this, had nowhere to go. */}
        <p style={{ marginTop: '18px' }}>
          <a className="link-btn" href="/?view=view-consumer-auth">
            Back to sign in
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <Brand />
      <h1>Forgot your password?</h1>
      <p>Enter your email and we'll send you a link to reset it.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
        {error && <div className="err">{error}</div>}
      </form>
      <p style={{ marginTop: '18px' }}>
        <a className="link-btn" href="/?view=view-consumer-auth">
          Remembered it? Sign in
        </a>
      </p>
    </div>
  );
}
