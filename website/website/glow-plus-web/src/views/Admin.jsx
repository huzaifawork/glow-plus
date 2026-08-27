import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import {
  ApiError,
  adminLogin,
  approveMerchant,
  getChurn,
  getMrr,
  getPlatformStats,
  listAllMerchants,
  listPendingMerchants,
  suspendMerchant,
} from '../lib/api.js';
import { formatDay } from '../lib/helpers.js';
import T from '../components/T.jsx';
import AdminTeamPanel from './AdminTeamPanel.jsx';

/**
 * The platform admin console, against the real API  (T38)
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 *
 * Everything on this screen used to be fiction, and in the most misleading
 * way of the three dashboards. It read the merchant list out of `data.js` →
 * `localStorage` [F9], so "Approve" wrote `status:'ACTIVE'` to the operator's
 * own browser: the salon stayed PENDING on the server, the salon owner saw no
 * change, and the admin had no way to tell. Est. MRR was `activeSalons *
 * 4999` — a number invented in the browser, not one subscription read. And
 * the view was reachable from the topbar by **anyone**, with no sign-in at
 * all, because there was nothing real behind it to protect.
 *
 * ── What had to be built first ─────────────────────────────────────────────
 *
 * T22 already built admin login, the pending queue, approve/suspend and the
 * three metrics endpoints, all behind `RequireAdminGuard` [F7]. The one gap
 * was the **"All salons" list**: the API only ever exposed the PENDING slice
 * (`GET /admin/merchants/pending`), and a SUSPENDED or CANCELLED salon by
 * definition never appears in a pending queue — so there was no way to see,
 * let alone reactivate, one. T38 added `GET /admin/merchants` for it, the
 * same "build the missing HTTP layer, then wire the panel" move T37 made for
 * reward rules.
 *
 * ── Three things worth knowing ─────────────────────────────────────────────
 *
 * 1. **Reactivate is `approve`, not a third endpoint.** The API has exactly
 *    two transitions — approve → ACTIVE and suspend → SUSPENDED. A suspended
 *    salon coming back and a new application being accepted are the same
 *    write; only the button's label differs, and it differs because the
 *    admin's intent does.
 * 2. **Est. MRR is real money now, and it can legitimately read $0.00.** It
 *    is the sum of every ACTIVE/TRIALING `Subscription`, annuals normalised
 *    to a month. A merchant who is ACTIVE but never completed Stripe checkout
 *    has no subscription row and contributes nothing — which is the honest
 *    answer, and the one the invented `count * 4999` could never give.
 * 3. **Suspend appears in the pending queue too.** It is how an application
 *    gets rejected: without it a bad signup sits in the queue forever, since
 *    the only other button promotes it.
 */

/* ============================================================
   Shared plumbing — the same seam T36/T37 established, on the
   admin session instead of the consumer/merchant one
   ============================================================ */

/**
 * One place that decides what a failed admin request looks like.
 *
 * A 401 means `lib/api.js` has already discarded the rejected admin token, so
 * this view is holding a session the server no longer honours; dropping the
 * local identity too is what puts it back to the sign-in card instead of
 * rendering a console whose every request fails. Guarded on `currentAdmin`
 * for the reason T36 found the hard way — every view stays mounted, so an
 * ungated sign-out could fire for someone merely looking at the landing page.
 *
 * A **403** is deliberately not treated as a sign-out here, unlike the
 * standalone `/admin/panel` page (T22), which reloads on either. A 403 is a
 * valid token refused one route; throwing the session away on it is how a
 * single unlucky endpoint logs an admin out of everything.
 */
function useAdminApiError() {
  const { toast, signOutAdmin, currentAdmin } = useApp();
  return useCallback(
    (err) => {
      toast(err instanceof ApiError ? err.message : String(err));
      if (err instanceof ApiError && err.status === 401 && currentAdmin) signOutAdmin();
    },
    [toast, signOutAdmin, currentAdmin],
  );
}

/**
 * `useAsyncData` with the rejection handled, and gated on a real admin
 * session.
 *
 * The gate is load-bearing. This view is mounted from first paint like every
 * other, so without it an anonymous visitor on the marketing page fires
 * `GET /admin/merchants`, the pending queue and three metrics calls — six
 * guaranteed 401s before they have clicked anything, on the one screen whose
 * 401s look most alarming in a server log.
 */
function useAdminData(loader, deps) {
  const { currentAdmin, dataVersion } = useApp();
  const onError = useAdminApiError();
  return useAsyncData(
    async () => {
      if (!currentAdmin) return null;
      try {
        return await loader();
      } catch (err) {
        onError(err);
        return null;
      }
    },
    [...deps, currentAdmin, dataVersion],
    null,
  );
}

/** Runs a write, reports its error, and refreshes every panel on success. */
function useAdminAction() {
  const { bumpData } = useApp();
  const onError = useAdminApiError();
  return useCallback(
    async (fn) => {
      try {
        const result = await fn();
        bumpData();
        return result;
      } catch (err) {
        onError(err);
        return null;
      }
    },
    [bumpData, onError],
  );
}

/* ============================================================
   Status labels
   ============================================================ */

/**
 * The prototype knew three statuses; the schema has five. PAST_DUE and
 * CANCELLED fell through its chain and rendered the raw enum name in the
 * badge — which no admin had ever seen, because no status was real.
 *
 * Only the original three have translation keys (they are the only ones the
 * prototype's copy covered). The two new ones use plain English, the same
 * call T37 made for the portal's new panels rather than inventing eight
 * translations for a string an admin reads.
 */
function statusLabel(status, t) {
  if (status === 'ACTIVE') return t('status_active');
  if (status === 'PENDING') return t('status_pending');
  if (status === 'SUSPENDED') return t('status_suspended');
  if (status === 'PAST_DUE') return 'past due';
  if (status === 'CANCELLED') return 'cancelled';
  return status;
}

/** The tag classes are reused purely for their colours — SPA green reads as
 *  healthy, NAIL gold as "needs attention", HAIR pink as stopped. */
function statusTagClass(status) {
  if (status === 'ACTIVE') return 'SPA';
  if (status === 'PENDING' || status === 'PAST_DUE') return 'NAIL';
  return 'HAIR';
}

/* ============================================================
   Sign in
   ============================================================ */

/**
 * Admin accounts are **not self-service** — `AdminAuthService` has a login
 * method and no signup, and the `Admin` table is seeded, so there is
 * deliberately no "create an account" toggle here the way BusinessAuth has
 * one. An operator who needs an account gets one from whoever runs the
 * platform.
 */
function AdminSignIn() {
  const { t } = useI18n();
  const { setCurrentAdmin } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await adminLogin(email.trim(), password);
      setCurrentAdmin({ id: data.admin.id, email: data.admin.email });
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <T as="h2" k="admin_title" />
      <div className="sub">
        Sign in with a platform admin account to review salon applications and
        see how the business is doing.
      </div>

      <form id="adminForm" onSubmit={submit}>
        <T as="label" htmlFor="adminEmail" k="label_email" />
        <input
          type="email"
          id="adminEmail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@glowplus.com"
          autoComplete="username"
          required
        />
        <T as="label" htmlFor="adminPassword" k="label_password" />
        <input
          type="password"
          id="adminPassword"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? '…' : t('auth_continue')}
        </button>
      </form>
    </div>
  );
}

/* ============================================================
   Stats
   ============================================================ */
function AdminStats() {
  const { t } = useI18n();

  const stats = useAdminData(async () => {
    const [mrr, churn, platform, pending, all] = await Promise.all([
      getMrr(),
      getChurn(),
      getPlatformStats(),
      listPendingMerchants(),
      listAllMerchants(),
    ]);
    return {
      // activeMerchants comes from the API rather than from filtering `all`
      // locally — it is the same number, and taking it from the metrics
      // endpoint means the tile keeps working if the directory ever paginates.
      activeSalons: platform.activeMerchants,
      pending: pending.length,
      suspended: all.filter((m) => m.status === 'SUSPENDED').length,
      mrrCents: mrr.mrrCents,
      activeSubscriptions: mrr.activeSubscriptions,
      churnRate: churn.churnRate,
      totalVisits: platform.totalVisits,
      totalPointsIssued: platform.totalPointsIssued,
    };
  }, []);

  // Two rows of four, because `.stat-row` is a fixed 4-column grid (2 at
  // mobile widths). Salon health first, then the money and volume numbers.
  const salonRows = stats
    ? [
        [t('stat_active_salons'), stats.activeSalons],
        [t('admin_pending_title'), stats.pending],
        [t('stat_suspended'), stats.suspended],
        [t('stat_est_mrr'), '$' + (stats.mrrCents / 100).toFixed(2)],
      ]
    : [];

  const platformRows = stats
    ? [
        ['Churn rate', (stats.churnRate * 100).toFixed(1) + '%'],
        ['Active subscriptions', stats.activeSubscriptions],
        ['Visits logged', stats.totalVisits],
        ['Points issued', stats.totalPointsIssued],
      ]
    : [];

  return (
    <>
      <div className="stat-row" id="adminStats">
        {salonRows.map(([lbl, num]) => (
          <div className="stat-box" key={lbl}>
            <div className="num">{num}</div>
            <div className="lbl">{lbl}</div>
          </div>
        ))}
      </div>
      <div className="stat-row" id="adminPlatformStats">
        {platformRows.map(([lbl, num]) => (
          <div className="stat-box" key={lbl}>
            <div className="num">{num}</div>
            <div className="lbl">{lbl}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================================================
   Approval queue
   ============================================================ */
function PendingQueue() {
  const { t } = useI18n();
  const { toast } = useApp();
  const run = useAdminAction();
  const [busyId, setBusyId] = useState(null);

  const pending = useAdminData(() => listPendingMerchants(), []);

  async function decide(m, fn, toastKey) {
    setBusyId(m.id);
    const result = await run(() => fn(m.id));
    setBusyId(null);
    if (result) toast(t(toastKey) + m.businessName);
  }

  return (
    <>
      <div className="block-head" style={{ textAlign: 'left', marginBottom: '16px' }}>
        <T as="h2" className="block-title" style={{ fontSize: '22px' }} k="admin_pending_title" />
      </div>
      <div id="adminPending">
        {!pending ? null : pending.length ? (
          pending.map((m) => (
            <div className="list-card" key={m.id}>
              <div>
                <div className="lc-name">{m.businessName}</div>
                <div className="lc-meta">
                  {/* [F74] — the free first month is a FOUNDING-member benefit
                      (7 standard trial days + 30 bonus), not something every
                      salon gets. The badge two lines up was already gated on
                      it; this suffix was not, so an admin reviewing salon #51
                      was told they get a free month when they get seven days. */}
                  {(m.foundingMember ? t('badge_founding_50') + ' · ' : '') +
                    m.email +
                    ' · ' +
                    t('meta_applied') +
                    ' ' +
                    formatDay(m.createdAt) +
                    (m.foundingMember ? ' · ' + t('meta_first_month_free') : '')}
                </div>
              </div>
              <div className="lc-actions">
                <button
                  className="toggle active"
                  disabled={busyId === m.id}
                  onClick={() => decide(m, approveMerchant, 'toast_approved_prefix')}
                >
                  {busyId === m.id ? '…' : t('btn_approve')}
                </button>
                {/* Rejecting an application. Without it the queue has no exit
                    other than promotion, so a junk signup stays forever. */}
                <button
                  className="toggle inactive"
                  disabled={busyId === m.id}
                  onClick={() => decide(m, suspendMerchant, 'toast_suspended_prefix')}
                >
                  {busyId === m.id ? '…' : t('btn_suspend')}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">{t('admin_nothing_pending')}</div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   All salons
   ============================================================ */
function AllSalons() {
  const { t } = useI18n();
  const { toast } = useApp();
  const run = useAdminAction();
  const [busyId, setBusyId] = useState(null);

  const merchants = useAdminData(() => listAllMerchants(), []);

  async function decide(m, fn, toastKey) {
    setBusyId(m.id);
    const result = await run(() => fn(m.id));
    setBusyId(null);
    if (result) toast(t(toastKey) + m.businessName);
  }

  return (
    <>
      <div className="block-head" style={{ textAlign: 'left', margin: '36px 0 16px' }}>
        <T as="h2" className="block-title" style={{ fontSize: '22px' }} k="admin_all_title" />
      </div>
      <div id="adminAll">
        {!merchants ? null : merchants.length ? (
          merchants.map((m) => {
            const status = m.status;
            const active = status === 'ACTIVE';
            // PENDING says "Approve", SUSPENDED/CANCELLED say "Reactivate" —
            // same endpoint, different intent. PAST_DUE is Stripe's word for
            // "the card failed", so the only useful lever is suspending them.
            const promoteLabel =
              status === 'PENDING' ? t('btn_approve') : t('btn_reactivate');

            return (
              <div className="list-card" key={m.id}>
                <div>
                  <div className="lc-name">
                    {m.businessName}{' '}
                    <span className={'tag ' + statusTagClass(status)}>
                      {statusLabel(status, t)}
                    </span>
                  </div>
                  <div className="lc-meta">
                    {m.email +
                      ' · ' +
                      (m.foundingMember
                        ? t('badge_founding_50_member')
                        : t('badge_standard')) +
                      (m.emailVerifiedAt ? '' : ' · email unverified')}
                  </div>
                </div>
                <div className="lc-actions">
                  {active || status === 'PAST_DUE' ? (
                    <button
                      className="toggle inactive"
                      disabled={busyId === m.id}
                      onClick={() => decide(m, suspendMerchant, 'toast_suspended_prefix')}
                    >
                      {busyId === m.id ? '…' : t('btn_suspend')}
                    </button>
                  ) : (
                    <button
                      className="toggle active"
                      disabled={busyId === m.id}
                      onClick={() => decide(m, approveMerchant, 'toast_approved_prefix')}
                    >
                      {busyId === m.id ? '…' : promoteLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">{t('admin_no_salons')}</div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Shell
   ============================================================ */
export default function Admin({ active }) {
  const { currentAdmin, signOutAdmin } = useApp();

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-admin">
      {!currentAdmin ? (
        <AdminSignIn />
      ) : (
        <>
          <div className="portal-head">
            <T as="h2" k="admin_title" />
            <button className="navbtn ghost" onClick={signOutAdmin}>
              {currentAdmin.email ? 'Sign out ' + currentAdmin.email : 'Sign out'}
            </button>
          </div>

          <AdminStats />
          <PendingQueue />
          <AllSalons />
          <AdminTeamPanel />
        </>
      )}
    </section>
  );
}
