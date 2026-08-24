/**
 * Consumer reward redemption — T23.
 *
 * Same standalone-page pattern as BookingPage.jsx (T18): a real page against
 * the real API, ahead of T35's SPA auth UI. Flow: sign in -> pick a salon
 * (GET /merchants/public, reused from T18) -> see progress toward each of
 * that salon's active reward rules (GET /redemptions/available) -> redeem an
 * unlocked one (POST /redemptions) -> redemption history (GET /redemptions/me).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  clearConsumerToken,
  consumerLogin,
  getConsumerToken,
  getMyPoints,
  listAvailableRewards,
  listMyRedemptions,
  listPublicMerchants,
  redeemReward,
} from '../../lib/api.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

function formatReward(rewardType, rewardValue) {
  if (rewardType === 'PERCENT_OFF') return `${rewardValue}% off`;
  if (rewardType === 'FLAT_DISCOUNT') return `$${(rewardValue / 100).toFixed(2)} off`;
  return 'Free service';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function RewardsPage() {
  const [authed, setAuthed] = useState(() => Boolean(getConsumerToken()));

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
    clearConsumerToken();
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
      <PointsBalance />
      <RewardsList />
      <RedemptionHistory />
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
      await consumerLogin(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in to see your rewards</h1>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
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

/**
 * Points balance + expiry — T25.
 *
 * Points have no balance column; they are the sum of a consumer's non-expired
 * Visit rows, which is why this reads from GET /points/me rather than being
 * derived in the browser. The expiry line is the part that matters to a
 * customer: a visit's expiry date is knowable the day it happens, so this
 * warns BEFORE the nightly job runs rather than reporting the loss after.
 */
function PointsBalance() {
  const [balances, setBalances] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setBalances(await getMyPoints());
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearConsumerToken();
        window.location.reload();
        return;
      }
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    // Redeeming doesn't spend points in this model, but a visit logged in
    // another tab does change the balance — reuse the same event the history
    // list listens for so the two panels never disagree.
    window.addEventListener('glowplus:reward-redeemed', load);
    return () => window.removeEventListener('glowplus:reward-redeemed', load);
  }, [load]);

  return (
    <div className="card" data-testid="points-card">
      <h2>Your points</h2>
      {error ? <p className="err">{error}</p> : null}
      {!balances ? (
        <p>Loading…</p>
      ) : balances.length === 0 ? (
        <p className="empty-note" data-testid="no-points">No visits logged yet — your points will show up here.</p>
      ) : (
        <div className="points-list">
          {balances.map((b) => (
            <div className="points-row" key={b.merchantId} data-testid="points-row">
              <div className="points-info">
                <div className="points-salon">{b.businessName}</div>
                <div className="points-sub">
                  {b.activeVisits} visit{b.activeVisits === 1 ? '' : 's'} counting
                  {b.expiredPoints > 0 ? ` · ${b.expiredPoints} pts expired` : ''}
                </div>
                {b.expiringSoon.points > 0 ? (
                  <div className="points-warning" data-testid="expiring-soon">
                    {b.expiringSoon.points} pts expire within {b.expiringSoon.withinDays} days
                  </div>
                ) : b.nextExpiry ? (
                  <div className="points-sub" data-testid="next-expiry">
                    Next {b.nextExpiry.points} pts expire {formatDate(b.nextExpiry.date)}
                  </div>
                ) : null}
              </div>
              <div className="points-value" data-testid="points-value">
                {b.activePoints}
                <span className="points-unit">pts</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="points-foot">Points expire {balances?.[0]?.expiresAfterDays ?? 365} days after the visit that earned them.</p>
    </div>
  );
}

function RewardsList() {
  const [merchants, setMerchants] = useState([]);
  const [merchantId, setMerchantId] = useState('');
  const [rewards, setRewards] = useState(null);
  const [error, setError] = useState(null);
  const [redeeming, setRedeeming] = useState(null);

  useEffect(() => {
    listPublicMerchants()
      .then((data) => {
        setMerchants(data);
        if (data.length) setMerchantId(data[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  const load = useCallback(async () => {
    if (!merchantId) return;
    setError(null);
    try {
      setRewards(await listAvailableRewards(merchantId));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearConsumerToken();
        window.location.reload();
        return;
      }
      setError(err.message);
    }
  }, [merchantId]);

  useEffect(() => {
    setRewards(null);
    load();
  }, [load]);

  async function redeem(ruleId) {
    setRedeeming(ruleId);
    setError(null);
    try {
      await redeemReward(ruleId);
      await load();
      window.dispatchEvent(new CustomEvent('glowplus:reward-redeemed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setRedeeming(null);
    }
  }

  return (
    <div className="card">
      <h2>Your rewards</h2>

      <div className="form">
        <label className="field">
          <span>Salon</span>
          <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
            {merchants.length === 0 ? <option value="">No salons available yet</option> : null}
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.businessName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rewards === null ? <p>Loading…</p> : null}
      {rewards && rewards.length === 0 ? (
        <p className="empty-note">This salon has no active reward programs yet.</p>
      ) : null}
      {rewards && rewards.length
        ? rewards.map((r) => (
            <div className="reward-row" key={r.ruleId}>
              <div className="reward-info">
                <div className="reward-name">{r.name}</div>
                <div className="reward-progress">
                  {formatReward(r.rewardType, r.rewardValue)} · {r.progress}/{r.triggerValue}
                  {r.triggerType === 'POINTS_THRESHOLD' ? ' points' : ' visits'}
                  {r.eligible ? '' : ` · ${r.remaining} to go`}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={!r.eligible || redeeming === r.ruleId}
                onClick={() => redeem(r.ruleId)}
              >
                {redeeming === r.ruleId ? 'Redeeming…' : r.eligible ? 'Redeem' : 'Locked'}
              </button>
            </div>
          ))
        : null}

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RedemptionHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHistory(await listMyRedemptions());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('glowplus:reward-redeemed', load);
    return () => window.removeEventListener('glowplus:reward-redeemed', load);
  }, [load]);

  return (
    <div className="card">
      <h2>Redemption history</h2>
      {history === null ? <p>Loading…</p> : null}
      {history && history.length === 0 ? <p className="empty-note">No rewards redeemed yet.</p> : null}
      {history && history.length
        ? history.map((h) => (
            <div className="reward-history-row" key={h.id}>
              <span>{h.rewardRule.name}</span>
              <span>{formatDateTime(h.redeemedAt)}</span>
            </div>
          ))
        : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
