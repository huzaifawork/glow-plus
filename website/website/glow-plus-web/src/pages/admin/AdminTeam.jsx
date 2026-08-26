/**
 * Admin team management — T77.
 *
 * **Why this exists.** Until now the only ways to obtain an admin account were
 * a CLI script and a hand-written SQL INSERT, both needing production database
 * credentials. That made the client permanently dependent on a developer for
 * something they will genuinely need — a second administrator, or a
 * replacement for one who has left — and the fallback advice was to hand a
 * business owner a SQL console pointed at their live database.
 *
 * Adding and removing admins is owner-only on the server
 * (RequireAdminOwnerGuard). A plain ADMIN is shown the explanation rather than
 * a blank space, because a missing button is indistinguishable from a bug.
 *
 * Changing your own password is the exception and is open to every admin.
 * Before T77 nobody could: `forgot-password` only ever looked up User and
 * Merchant, and answered `{ ok: true }` regardless — so an admin who lost
 * their password waited for an email that was never going to arrive.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  changeAdminPassword,
  createAdmin,
  deleteAdmin,
  getAdminProfile,
  listAdmins,
  listUsersForPromotion,
  promoteUserToAdmin,
} from '../../lib/api.js';

export default function AdminTeam() {
  const [me, setMe] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [profile, list] = await Promise.all([getAdminProfile(), listAdmins()]);
      setMe(profile);
      setAdmins(list);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Signed in, but not an owner. Still load the profile so the password
        // form below renders — that part is open to every admin.
        try {
          setMe(await getAdminProfile());
        } catch {
          /* the password form handles its own failures */
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

  async function remove(id, email) {
    if (!window.confirm(`Remove admin access for ${email}? Their sessions end immediately.`)) return;
    setBusyId(id);
    setNotice(null);
    try {
      await deleteAdmin(id);
      setNotice(`${email} is no longer an admin.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that admin.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h2>Admin team</h2>

      {error && error !== 'owner-only' && <p className="err" role="alert">{error}</p>}
      {notice && <p className="ok" role="status">{notice}</p>}

      {error === 'owner-only' ? (
        <p className="muted">
          Only an <strong>owner</strong> can add or remove admins. You can still change your
          own password below.
        </p>
      ) : admins === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.email}</td>
                <td>{a.role === 'OWNER' ? 'Owner' : 'Admin'}</td>
                <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                <td>
                  {a.id === me?.id ? (
                    <span className="muted">you</span>
                  ) : isOwner ? (
                    <button
                      className="btn btn-quiet btn-small"
                      disabled={busyId === a.id}
                      onClick={() => remove(a.id, a.email)}
                    >
                      {busyId === a.id ? 'Removing…' : 'Remove'}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isOwner && (
        <PromoteCustomer
          onDone={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      )}
      {isOwner && (
        <CreateAdminForm
          onDone={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      )}
      <ChangeMyPassword />
    </div>
  );
}

/**
 * Promote an existing customer.
 *
 * Preferred over "add a new admin" wherever it applies, because no password is
 * invented here and none is transmitted: the server copies the customer's
 * existing hash, so they sign in with the password they already use. Every
 * other route to granting admin access ends with someone sending a credential
 * over a chat app, which is precisely how this project's other keys leaked.
 */
function PromoteCustomer({ onDone }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setResults(await listUsersForPromotion(q));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }

  async function promote(user) {
    if (!window.confirm(`Make ${user.email} an admin? They sign in with their existing password.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await promoteUserToAdmin(user.id);
      onDone(`${user.email} is now an admin — they sign in with their existing password.`);
      setResults(null);
      setQ('');
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not promote that customer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subsection">
      <h3>Promote a customer</h3>
      <p className="muted">They keep their existing password — nothing is generated or sent to them.</p>
      <form onSubmit={search}>
        <input
          type="search"
          value={q}
          placeholder="Search by name or email"
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-small" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
      {results && results.length === 0 && <p className="muted">No customers matched.</p>}
      {results && results.length > 0 && (
        <ul>
          {results.map((u) => (
            <li key={u.id}>
              {u.name} — {u.email}{' '}
              <button className="btn btn-small" disabled={busy} onClick={() => promote(u)}>
                Make admin
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Create an admin who has no existing customer account. */
function CreateAdminForm({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ADMIN');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const normalised = email.trim().toLowerCase();
    try {
      await createAdmin(normalised, password, role);
      onDone(`${normalised} can now sign in to this panel.`);
      setEmail('');
      setPassword('');
      setRole('ADMIN');
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not create that admin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subsection">
      <h3>Add a new admin</h3>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ADMIN">Admin — approve and suspend salons</option>
            <option value="OWNER">Owner — can also manage the admin team</option>
          </select>
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create admin'}
        </button>
      </form>
    </div>
  );
}

/**
 * Every admin can rotate their own password. The server revokes their other
 * refresh tokens in the same transaction, so a change made because "someone
 * may have my password" actually ends the other party's session.
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
      <form onSubmit={submit}>
        <label>
          Current password
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        {ok && <p className="ok" role="status">{ok}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
