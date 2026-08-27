/**
 * Admin team, inside the main console — T77.
 *
 * **Why this exists here as well as on /admin/panel.** There are two admin
 * UIs: this one, reached from the header's Admin button, and the standalone
 * `/admin/panel` page (T22). The team controls were built on the standalone
 * page first, which meant the console an admin actually reaches by clicking
 * something could not manage its own team — you had to know a URL. This closes
 * that, and this console is the better home for it: it is the one with a link
 * pointing at it.
 *
 * **Copy is plain English, deliberately.** Every customer-facing string in
 * this SPA goes through `t()` in eight languages, but T37 and T38 both chose
 * plain English for panels only an administrator reads rather than inventing
 * eight translations for them (see the statusLabel comment in Admin.jsx). This
 * follows that call. The i18n layer falls back to English for missing keys, so
 * nothing here breaks in another language — it simply reads in English.
 *
 * **The profile is fetched before anything owner-only.** A plain ADMIN calling
 * the owner routes gets a legitimate 403, and every 403 in this console raises
 * a toast. Checking the role first means an ordinary admin sees a quiet
 * explanation instead of two error toasts every time the console loads.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  changeAdminPassword,
  getAdminProfile,
  listAdmins,
  listUsersForPromotion,
  promoteUserToAdmin,
} from '../lib/api.js';
import { formatDay } from '../lib/helpers.js';

const roleLabel = (role) => (role === 'OWNER' ? 'Owner' : 'Admin');

export default function AdminTeamPanel() {
  const [me, setMe] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadOwnerData = useCallback(async (query) => {
    const [list, people] = await Promise.all([listAdmins(), listUsersForPromotion(query)]);
    setAdmins(list);
    setUsers(people);
  }, []);

  const load = useCallback(async () => {
    try {
      const profile = await getAdminProfile();
      setMe(profile);
      // Only an OWNER may read these two. Asking first avoids a guaranteed
      // 403 (and its toast) on every load for an ordinary admin.
      if (profile.role === 'OWNER') await loadOwnerData('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, [loadOwnerData]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = me?.role === 'OWNER';

  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUsers(await listUsersForPromotion(q));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function promote(user) {
    if (!window.confirm(`Make ${user.email} an admin? They sign in with the password they already have.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await promoteUserToAdmin(user.id);
      setNotice(`${user.email} is now an admin — they sign in with their existing password.`);
      // Reload rather than clear, so the row stays put and flips to a role
      // tag. The promotion is something you can watch happen.
      await loadOwnerData(q);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!me && error) {
    return (
      <>
        <div className="block-head">
          <div className="block-title">Admin team</div>
        </div>
        <p className="err" role="alert">{error}</p>
      </>
    );
  }

  return (
    <>
      <div className="block-head">
        <div className="block-title">Admin team</div>
      </div>

      {error ? <p className="err" role="alert">{error}</p> : null}
      {notice ? <div className="sub" role="status">{notice}</div> : null}

      {!isOwner ? (
        <div className="empty">
          Only an owner can promote customers to admin. You can still change your own
          password below.
        </div>
      ) : (
        <>
          <div className="list">
            {admins === null ? (
              <div className="empty">Loading…</div>
            ) : (
              admins.map((a) => (
                <div className="list-card" key={a.id}>
                  <div>
                    <div className="lc-name">
                      {a.email}
                      {a.id === me?.id ? ' (you)' : ''}
                    </div>
                    <div className="lc-meta">Added {formatDay(a.createdAt)}</div>
                  </div>
                  <div className="lc-actions">
                    <span className={a.role === 'OWNER' ? 'toggle active' : 'toggle inactive'}>
                      {roleLabel(a.role)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="block-head" style={{ marginTop: 22 }}>
            <div className="block-title">Promote a customer to admin</div>
          </div>
          <div className="sub">
            They keep the password they already have — nothing is generated, and nothing
            has to be sent to them.
          </div>

          <form onSubmit={search} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
            <input
              type="search"
              value={q}
              placeholder="Search by name or email"
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="submit" className="navbtn ghost" disabled={busy}>
              {busy ? '…' : 'Search'}
            </button>
          </form>

          <div className="list">
            {users === null ? (
              <div className="empty">Loading…</div>
            ) : users.length === 0 ? (
              <div className="empty">
                {q.trim() ? 'No customers matched.' : 'No customers yet.'}
              </div>
            ) : (
              users.map((u) => (
                <div className="list-card" key={u.id}>
                  <div>
                    <div className="lc-name">{u.name}</div>
                    <div className="lc-meta">{u.email}</div>
                  </div>
                  <div className="lc-actions">
                    {u.role && u.role !== 'CONSUMER' ? (
                      <span className={u.role === 'OWNER' ? 'toggle active' : 'toggle inactive'}>
                        {roleLabel(u.role)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="toggle active"
                        disabled={busy}
                        onClick={() => promote(u)}
                      >
                        Make admin
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <ChangeMyPassword />
    </>
  );
}

/**
 * Every admin can rotate their own password, owner or not.
 *
 * This is the only self-service route an admin has: `forgot-password` looks up
 * User and Merchant only, and answers `{ ok: true }` regardless, so an admin
 * who lost their password would wait for an email that never arrives.
 *
 * The server writes the User row where the admin was promoted from a customer,
 * so the console and the customer account never drift onto different
 * passwords, and revokes both sessions.
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
      setErr(e2 instanceof ApiError ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="block-head" style={{ marginTop: 22 }}>
        <div className="block-title">Change my password</div>
      </div>

      <form onSubmit={submit}>
        <label htmlFor="adminCurrentPassword">Current password</label>
        <input
          type="password"
          id="adminCurrentPassword"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        <label htmlFor="adminNewPassword">New password</label>
        <input
          type="password"
          id="adminNewPassword"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />

        {err ? <p className="err" role="alert">{err}</p> : null}
        {ok ? <div className="sub" role="status">{ok}</div> : null}

        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? '…' : 'Change password'}
        </button>
      </form>
    </>
  );
}
