/**
 * Admin team — T77.
 *
 * **How someone becomes an admin.** Either an owner promotes a customer here,
 * or an operator changes `User.role` in the Supabase table editor. Both do the
 * identical thing — set one column — and the database triggers in migration
 * 20260827020000_user_role_sync_admin create or remove the matching `Admin`
 * row. There is deliberately no "create an admin" form and no delete button:
 * a web form that mints platform administrators is reachable by anything that
 * can reach a logged-in owner's browser, and keeping the number of ways to
 * mint an admin low is worth more than the convenience of another one.
 *
 * Promotion never creates a credential. The promoted customer signs in with
 * the password they already have, so nobody invents a password and nobody has
 * to send one — which is how this project's other credentials leaked.
 *
 * Promotion is owner-only on the server (RequireAdminOwnerGuard). A plain
 * ADMIN is told so rather than shown a blank space, because a missing control
 * is indistinguishable from a bug.
 *
 * Changing your own password is open to every admin, and writes the User row
 * so the panel and the customer account never drift onto different passwords.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  changeAdminPassword,
  getAdminProfile,
  listAdmins,
  listUsersForPromotion,
  promoteUserToAdmin,
} from '../../lib/api.js';

const RoleBadge = ({ role }) => (
  <span className={role === 'OWNER' ? 'role-badge is-owner' : 'role-badge'}>
    {role === 'OWNER' ? 'Owner' : 'Admin'}
  </span>
);

export default function AdminTeam() {
  const [me, setMe] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [profile, list] = await Promise.all([getAdminProfile(), listAdmins()]);
      setMe(profile);
      setAdmins(list);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Signed in, but not an owner. Still load the profile so the password
        // form renders — that part is open to every admin.
        try {
          setMe(await getAdminProfile());
        } catch {
          /* the password form reports its own failures */
        }
        setAdmins([]);
        setError('owner-only');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load the admin team.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isOwner = me?.role === 'OWNER';

  return (
    <div className="card">
      <h2>Admin team</h2>

      {error && error !== 'owner-only' ? (
        <p className="err" role="alert">{error}</p>
      ) : null}
      {notice ? <p className="ok" role="status">{notice}</p> : null}

      {error === 'owner-only' ? (
        <p className="empty-note">
          Only an <strong>owner</strong> can promote customers to admin. You can still change
          your own password below.
        </p>
      ) : admins === null ? (
        <p className="empty-note">Loading…</p>
      ) : (
        <div className="merchant-list">
          {admins.map((a) => (
            <div className="merchant-row" key={a.id}>
              <div className="merchant-info">
                <div className="merchant-name">
                  {a.email}
                  {a.id === me?.id ? ' (you)' : ''}
                </div>
                <div className="merchant-email">
                  Added {new Date(a.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="merchant-actions">
                <RoleBadge role={a.role} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isOwner ? (
        <PromoteCustomer
          onDone={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
      <ChangeMyPassword />
    </div>
  );
}

/**
 * Promote an existing customer to admin.
 *
 * Their customer account is left intact: being an admin does not stop someone
 * being a customer, and their visits, bookings and points stay on that row.
 * The two share one password — changing it in either place moves both.
 */
function PromoteCustomer({ onDone }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async (query) => {
    setBusy(true);
    setErr(null);
    try {
      setResults(await listUsersForPromotion(query));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not load customers.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Show the customers immediately instead of waiting for a search. An empty
  // list behind a search box is indistinguishable from "there are no
  // customers", which is exactly how it read on a platform with two of them.
  // The box now narrows a list you can already see.
  useEffect(() => {
    load('');
  }, [load]);

  async function search(e) {
    e.preventDefault();
    await load(q);
  }

  async function promote(user) {
    if (!window.confirm(`Make ${user.email} an admin? They sign in with their existing password.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await promoteUserToAdmin(user.id);
      onDone(`${user.email} is now an admin — they sign in with their existing password.`);
      // Reload rather than clear: the row should stay visible and flip to an
      // "Admin" badge, so the promotion is something you can see happen.
      await load(q);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not promote that customer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subsection">
      <h3>Promote a customer to admin</h3>
      <p className="empty-note">
        They keep their existing password — nothing is generated or sent to them.
      </p>

      <form onSubmit={search} className="search-row">
        <input
          type="search"
          value={q}
          placeholder="Search by name or email"
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-quiet btn-small" type="submit" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {err ? <p className="err" role="alert">{err}</p> : null}
      {busy && results === null ? <p className="empty-note">Loading customers…</p> : null}
      {results && results.length === 0 ? (
        <p className="empty-note">{q.trim() ? 'No customers matched.' : 'No customers yet.'}</p>
      ) : null}

      {results && results.length ? (
        <div className="merchant-list" style={{ marginTop: 12 }}>
          {results.map((u) => (
            <div className="merchant-row" key={u.id}>
              <div className="merchant-info">
                <div className="merchant-name">{u.name}</div>
                <div className="merchant-email">{u.email}</div>
              </div>
              <div className="merchant-actions">
                {u.role && u.role !== 'CONSUMER' ? (
                  <RoleBadge role={u.role} />
                ) : (
                  <button
                    type="button"
                    className="btn btn-sage btn-small"
                    disabled={busy}
                    onClick={() => promote(u)}
                  >
                    Make admin
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every admin can rotate their own password. The server writes the User row
 * where there is one, so the admin panel and the customer account never end up
 * on different passwords, and revokes both sessions — "someone may know my
 * password" is the reason this gets used.
 */
function ChangeMyPassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setOk('Password changed. Your other sessions have been signed out.');
      setCurrent('');
      setNew('');
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subsection">
      <h3>Change my password</h3>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        {err ? <p className="err" role="alert">{err}</p> : null}
        {ok ? <p className="ok" role="status">{ok}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
