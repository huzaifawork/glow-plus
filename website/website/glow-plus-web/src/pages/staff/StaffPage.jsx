/**
 * Merchant team management — T24.
 *
 * Same standalone-page pattern as BillingManager (T17), BookingPage (T18),
 * AdminPanel (T22) and RewardsPage (T23): a real page against the real API,
 * ahead of T35's SPA auth UI.
 *
 * The thing this page has to demonstrate that the others don't is a
 * ROLE-LIMITED VIEW. One sign-in box serves the salon owner and their staff;
 * `GET /staff/me` then decides what is rendered. An owner gets the roster,
 * the invite form, and role/removal controls. A staff member gets their own
 * details and a plain statement of what their role can and cannot do — the
 * management panel is not rendered at all for them, and the API refuses it
 * independently (RequireMerchantOwnerGuard), so hiding it here is convenience,
 * never the security boundary.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  clearStaffToken,
  getStaffMe,
  getStaffToken,
  inviteStaff,
  listStaff,
  removeStaff,
  revokeStaffInvite,
  teamSignIn,
  updateStaffRole,
} from '../../lib/api.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StaffPage() {
  const [authed, setAuthed] = useState(() => Boolean(getStaffToken()));
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const loadMe = useCallback(async () => {
    try {
      setMe(await getStaffMe());
      setLoadError(null);
    } catch (err) {
      // A token that outlived its account (the owner removed this staff
      // member) must not leave the page stuck on a spinner.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearStaffToken();
        setAuthed(false);
        return;
      }
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    if (authed) loadMe();
  }, [authed, loadMe]);

  function logOut() {
    clearStaffToken();
    setMe(null);
    setAuthed(false);
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="card center">
          <Brand />
          <SignInCard onSuccess={() => setAuthed(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <Brand />
        <button className="btn btn-quiet btn-small" onClick={logOut}>
          Log out
        </button>
      </div>

      {loadError ? <div className="card"><p className="err">{loadError}</p></div> : null}
      {!me ? (
        <div className="card"><p>Loading your account…</p></div>
      ) : (
        <>
          <WhoAmI me={me} />
          {me.role === 'OWNER' ? <TeamManager /> : <StaffOnlyNotice />}
        </>
      )}
    </div>
  );
}

function SignInCard({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await teamSignIn(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in to your team</h1>
      <p>Salon owners and staff both sign in here.</p>
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
        {error ? <p className="err" data-testid="signin-error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}

function WhoAmI({ me }) {
  return (
    <div className="card" data-testid="whoami">
      <h2>{me.merchant.businessName}</h2>
      <div className="staff-meta">
        <div>
          <div className="staff-name">{me.name || me.email}</div>
          <div className="staff-sub">{me.email}</div>
        </div>
        <span className={`role-pill role-${me.role.toLowerCase()}`} data-testid="my-role">
          {me.isOwnerAccount ? 'Salon owner' : me.role === 'OWNER' ? 'Owner' : 'Staff'}
        </span>
      </div>
      <p className="staff-sub">Last signed in: {formatDate(me.lastLoginAt)}</p>
    </div>
  );
}

function StaffOnlyNotice() {
  return (
    <div className="card" data-testid="staff-notice">
      <h2>Your access</h2>
      <p>
        You're signed in as staff. You can do the day-to-day work — log visits,
        view styles and manage bookings for this salon.
      </p>
      <ul className="access-list">
        <li className="allowed">Log client visits</li>
        <li className="allowed">View styles and bookings</li>
        <li className="denied">Invite or remove team members</li>
        <li className="denied">Change anyone's role</li>
        <li className="denied">Manage the salon's subscription</li>
      </ul>
      <p className="staff-sub">Ask the salon owner if you need one of these.</p>
    </div>
  );
}

function TeamManager() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await listStaff());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, message) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <InviteForm
        onInvited={(email) => {
          setNotice(`Invite sent to ${email}.`);
          load();
        }}
      />

      <div className="card" data-testid="roster">
        <h2>Team</h2>
        {error ? <p className="err">{error}</p> : null}
        {notice ? <p className="notice" data-testid="notice">{notice}</p> : null}
        {!data ? (
          <p>Loading…</p>
        ) : (
          <>
            {data.members.length === 0 ? (
              <p className="empty-note" data-testid="no-members">No staff accounts yet — invite someone below.</p>
            ) : (
              <div className="staff-list">
                {data.members.map((m) => (
                  <div className="staff-row" key={m.id} data-testid="staff-row">
                    <div className="staff-info">
                      <div className="staff-name">{m.name || m.email}</div>
                      <div className="staff-sub">{m.email}</div>
                      <div className="staff-sub">Last signed in: {formatDate(m.lastLoginAt)}</div>
                    </div>
                    <div className="staff-actions">
                      <select
                        className="role-select"
                        value={m.role}
                        aria-label={`Role for ${m.email}`}
                        onChange={(e) =>
                          act(() => updateStaffRole(m.id, e.target.value), `${m.email} is now ${e.target.value}.`)
                        }
                      >
                        <option value="STAFF">Staff</option>
                        <option value="OWNER">Owner</option>
                      </select>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => act(() => removeStaff(m.id), `${m.email} removed.`)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="section-gap">Pending invites</h2>
            {data.pendingInvites.length === 0 ? (
              <p className="empty-note" data-testid="no-invites">No invites outstanding.</p>
            ) : (
              <div className="staff-list">
                {data.pendingInvites.map((i) => (
                  <div className="staff-row" key={i.id} data-testid="invite-row">
                    <div className="staff-info">
                      <div className="staff-name">{i.email}</div>
                      <div className="staff-sub">
                        Invited as {i.role} · expires {formatDate(i.expiresAt)}
                      </div>
                    </div>
                    <div className="staff-actions">
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() => act(() => revokeStaffInvite(i.id), `Invite to ${i.email} revoked.`)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function InviteForm({ onInvited }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('STAFF');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await inviteStaff({ email: email.trim(), name: name.trim(), role });
      const invited = email.trim();
      setEmail('');
      setName('');
      setRole('STAFF');
      onInvited(invited);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" data-testid="invite-card">
      <h2>Invite a team member</h2>
      <p>They'll get an email with a link to set their own password.</p>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            placeholder="stylist@example.com"
          />
        </label>
        <label className="field">
          <span>Name (optional)</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STAFF">Staff — day-to-day work only</option>
            <option value="OWNER">Owner — full access, including billing</option>
          </select>
        </label>
        {error ? <p className="err" data-testid="invite-error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </form>
    </div>
  );
}
