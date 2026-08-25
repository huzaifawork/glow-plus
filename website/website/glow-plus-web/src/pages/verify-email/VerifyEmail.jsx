import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/config.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

/**
 * Port of glow-plus-frontend/public/verify-email.html.
 *
 * Same three states, same copy, same single POST to /auth/verify-email. The
 * original swapped the card's innerHTML; here the state drives which branch
 * renders, which produces the identical DOM.
 */
export default function VerifyEmail() {
  const [view, setView] = useState({ status: 'loading' });
  // The original fired verify() exactly once on script evaluation. This guard
  // keeps that true even if the effect is re-run (React StrictMode), because a
  // second POST would burn an already-consumed token.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const renderError = (title, message) =>
      setView({ status: 'error', title, message });

    async function verify() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        renderError(
          'Missing verification link',
          'This link looks incomplete. Please use the link from your email exactly as it was sent.'
        );
        return;
      }

      try {
        const res = await fetch(API_BASE_URL + '/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          renderError(
            'Verification failed',
            body.message || 'This link may have expired or already been used.'
          );
          return;
        }

        const data = await res.json();
        setView({ status: 'success', accountType: data.accountType });
      } catch (err) {
        // Dev/production split, same reasoning as lib/api.js: naming the API
        // origin and telling the reader to start a backend is developer copy,
        // and this card is the FIRST thing a new customer sees after signing up.
        renderError(
          'Could not reach the server',
          import.meta.env.DEV
            ? 'Make sure your Glow+ backend is running at ' + API_BASE_URL + ' and try again.'
            : 'We could not reach Glow+ just now. Check your internet connection, then open the link from your email again.'
        );
      }
    }

    verify();
  }, []);

  if (view.status === 'success') {
    const who = view.accountType === 'MERCHANT' ? 'salon account' : 'account';
    return (
      <div className="card status-success" id="card">
        <Brand />
        <div className="icon">✅</div>
        <h1>Email confirmed!</h1>
        <p>Your {who} is now verified. You can close this tab and continue.</p>
      </div>
    );
  }

  if (view.status === 'error') {
    return (
      <div className="card status-error" id="card">
        <Brand />
        <div className="icon">⚠️</div>
        <h1>{view.title}</h1>
        <p>{view.message}</p>
      </div>
    );
  }

  return (
    <div className="card" id="card">
      <Brand />
      <div className="spinner"></div>
      <h1>Confirming your email…</h1>
      <p>Just a moment.</p>
    </div>
  );
}
