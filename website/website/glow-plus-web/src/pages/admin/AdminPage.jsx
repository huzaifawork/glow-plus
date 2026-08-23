/**
 * Admin panel — T22 [F7].
 *
 * A dedicated standalone page, same pattern as BillingManager.jsx (T17) and
 * BookingPage.jsx (T18): a real page against the real API, built before the
 * full SPA (T35-T38) exists. Before this, /admin/* had NO guard at all — any
 * logged-in consumer token could read it (F31's leak vector). Now every
 * write/read here requires a real admin login and RequireAdminGuard.
 *
 * Flow: admin sign in -> pending merchants list (approve/suspend) -> platform
 * metrics (MRR, churn, active merchants/visits/points).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  adminLogin,
  approveMerchant,
  clearAdminToken,
  getAdminToken,
  getChurn,
  getMrr,
  getPlatformStats,
  listPendingMerchants,
  suspendMerchant,
} from '../../lib/api.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span> <span style={{ fontWeight: 400 }}>Admin</span></div>
);

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => Boolean(getAdminToken()));

  if (!authed) {
    return (
      <div className="page">
        <div className="card center">
          <Brand />
          <LoginCard onSuccess={() => setAuthed(true)} />
        </div>
      </div>
    );
  }

  function logOut() {
    clearAdminToken();
    setAuthed(false);
  }

  return (
    <div className="page">
      <div className="topbar">
        <Brand />
        <button className="btn btn-quiet btn-small" onClick={logOut}>
          Log out
        </button>
      </div>
      <Metrics />
      <PendingMerchants />
    </div>
  );
}

function LoginCard({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <p>Sign in with an admin account to manage merchants and view platform metrics.</p>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}

function useAdminAuthGuard(err) {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    clearAdminToken();
    window.location.reload();
    return true;
  }
  return false;
}

function Metrics() {
  const [mrr, setMrr] = useState(null);
  const [churn, setChurn] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getMrr(), getChurn(), getPlatformStats()])
      .then(([m, c, p]) => {
        setMrr(m);
        setChurn(c);
        setPlatform(p);
      })
      .catch((err) => {
        if (useAdminAuthGuard(err)) return;
        setError(err.message);
      });
  }, []);

  return (
    <div className="card">
      <h2>Platform metrics</h2>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {mrr && churn && platform ? (
        <div className="metrics">
          <div className="metric">
            <div className="metric-label">MRR</div>
            <div className="metric-value">${(mrr.mrrCents / 100).toFixed(2)}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Active subs</div>
            <div className="metric-value">{mrr.activeSubscriptions}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Churn rate</div>
            <div className="metric-value">{(churn.churnRate * 100).toFixed(1)}%</div>
          </div>
          <div className="metric">
            <div className="metric-label">Active merchants</div>
            <div className="metric-value">{platform.activeMerchants}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Total visits</div>
            <div className="metric-value">{platform.totalVisits}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Points issued</div>
            <div className="metric-value">{platform.totalPointsIssued}</div>
          </div>
        </div>
      ) : !error ? (
        <p>Loading…</p>
      ) : null}
    </div>
  );
}

function PendingMerchants() {
  const [merchants, setMerchants] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMerchants(await listPendingMerchants());
    } catch (err) {
      if (useAdminAuthGuard(err)) return;
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id) {
    setBusyId(id);
    setError(null);
    try {
      await approveMerchant(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function suspend(id) {
    setBusyId(id);
    setError(null);
    try {
      await suspendMerchant(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h2>Pending merchants</h2>
      {merchants === null && !error ? <p>Loading…</p> : null}
      {merchants && merchants.length === 0 ? <p className="empty-note">No merchants awaiting approval.</p> : null}
      {merchants && merchants.length ? (
        <div className="merchant-list">
          {merchants.map((m) => (
            <div className="merchant-row" key={m.id}>
              <div className="merchant-info">
                <div className="merchant-name">{m.businessName}</div>
                <div className="merchant-email">{m.email}</div>
              </div>
              <div className="merchant-actions">
                <button
                  type="button"
                  className="btn btn-sage btn-small"
                  disabled={busyId === m.id}
                  onClick={() => approve(m.id)}
                >
                  {busyId === m.id ? '…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  disabled={busyId === m.id}
                  onClick={() => suspend(m.id)}
                >
                  {busyId === m.id ? '…' : 'Suspend'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
