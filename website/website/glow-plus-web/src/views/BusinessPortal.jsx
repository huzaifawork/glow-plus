import { useCallback, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import {
  ApiError,
  createRewardRule,
  createStyle,
  getMerchantProfile,
  listMerchantVisits,
  listRewardRules,
  listStyles,
  logVisit,
  setRewardRuleActive,
  setStyleActive,
} from '../lib/api.js';
import { formatDay } from '../lib/helpers.js';
import T from '../components/T.jsx';

/**
 * The merchant portal, against the real API  (T37)
 *
 * Until now every panel here read `data.js` → `localStorage` [F9]: a salon
 * could add a style, log a visit and watch a reward "unlock", and none of it
 * left the browser. T35 made the merchant *session* real; this makes the
 * portal's contents real, the same move T36 made for the consumer side.
 *
 * ── What had to be built first ─────────────────────────────────────────────
 *
 * Styles, visits, staff and billing all had endpoints already. **Reward rules
 * had none at all** — `reward-rules.module.ts` declared no controller and the
 * service had exactly one method, `evaluate()`. So T37 built the reward-rules
 * HTTP layer before this file could be wired to anything. Writes there are
 * owner-only; the SPA only ever signs in owners, so the portal does not render
 * a staff-mode form, but the server refuses regardless of what the UI shows.
 *
 * ── Three divergences from the prototype, resolved in the backend's favour ──
 *
 * 1. **A visit names its client by EMAIL, not phone.** The mockup asked for
 *    "Client phone" and keyed its fake consumers on it. The API identifies
 *    people by email everywhere — it is what the consumer login and the RN app
 *    use — and `POST /visits` creates a lightweight account for a walk-in who
 *    has never signed up. Following the mockup here would mean the merchant
 *    logging visits against people the rest of the platform cannot find.
 * 2. **A reward rule's scope is a STYLE, not a style category.** The mockup
 *    offered "Hair only / Nail only / Spa only"; `RewardRule.styleScopeId` has
 *    always been a foreign key to one Style row. The dropdown now lists the
 *    salon's actual styles.
 * 3. **A flat discount is stored in CENTS.** The prototype rendered
 *    `'$' + rewardValue`, which turns the seeded 2000 into "$2000 off" instead
 *    of "$20 off". Fixed here the same way T36 fixed it on the consumer side.
 */

/* ============================================================
   Shared plumbing — the same seam T36 established
   ============================================================ */

/**
 * One place that decides what a failed request looks like.
 *
 * A 401 means `lib/api.js` has already discarded the rejected token, so the
 * portal is holding a session that no longer exists; dropping the local
 * identity too is what stops it rendering a signed-in shell whose every
 * request fails silently. Guarded on `currentMerchant` for the reason T36
 * found the hard way: every view stays mounted (`.view.active` toggles
 * visibility, not existence), so an ungated sign-out here would navigate a
 * visitor who is merely *looking at the landing page* to the business login.
 */
function useApiError() {
  const { toast, signOutMerchant, currentMerchant } = useApp();
  return useCallback(
    (err) => {
      toast(err instanceof ApiError ? err.message : String(err));
      if (err instanceof ApiError && err.status === 401 && currentMerchant) signOutMerchant();
    },
    [toast, signOutMerchant, currentMerchant],
  );
}

/**
 * `useAsyncData` with the rejection handled, and gated on a real session.
 *
 * The gate is not decoration. These panels are mounted from first paint, so
 * without it an anonymous visitor on the marketing page fires `GET /styles`,
 * `GET /reward-rules` and `GET /visits` and collects three guaranteed 401s
 * before they have clicked anything — exactly the defect T36 found and fixed
 * on the consumer dashboard.
 *
 * Returning `null` while signed out also reproduces a real distinction the
 * prototype had: "no merchant yet" rendered empty containers, while "merchant
 * with zero styles" rendered the "No styles yet" empty-state card.
 */
function usePortalData(loader, deps) {
  const { currentMerchant, dataVersion } = useApp();
  const onError = useApiError();
  return useAsyncData(
    async () => {
      if (!currentMerchant) return null;
      try {
        return await loader();
      } catch (err) {
        onError(err);
        return null;
      }
    },
    [...deps, currentMerchant, dataVersion],
    null,
  );
}

/** Runs a write, reports its error, and refreshes every panel on success. */
function usePortalAction() {
  const { bumpData } = useApp();
  const onError = useApiError();
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
   Shared label helpers
   ============================================================ */

/**
 * `rewardValue` is CENTS for a flat discount and a percentage for the other.
 * Kept identical to ConsumerDashboard's copy on purpose — the two screens
 * describe the same rule, and a salon reading "$20 off" while the customer
 * reads "$2000 off" is worse than either being wrong alone.
 */
function rewardLabel(r) {
  if (r.rewardType === 'PERCENT_OFF') return r.rewardValue + '% off';
  if (r.rewardType === 'FLAT_DISCOUNT') {
    return '$' + (r.rewardValue / 100).toFixed(2).replace(/\.00$/, '') + ' off';
  }
  return 'Free service';
}

function unitLabel(r) {
  return r.triggerType === 'VISIT_COUNT' ? 'visits' : 'points';
}

function scopeLabel(r) {
  return r.styleScope ? r.styleScope.name + ' only' : 'any style';
}

/* ============================================================
   Portal stats
   ============================================================ */
function PortalStats() {
  const { t } = useI18n();

  const stats = usePortalData(async () => {
    const [rules, visits] = await Promise.all([listRewardRules(), listMerchantVisits()]);
    return {
      visits: visits.length,
      points: visits.reduce((s, v) => s + v.pointsEarned, 0),
      // Real visits carry a real user row, so "unique clients" is now a count
      // of actual accounts rather than of distinct phone strings typed into a
      // form — the prototype's version counted typos as separate people.
      clients: new Set(visits.map((v) => v.userId)).size,
      activeRules: rules.filter((r) => r.active !== false).length,
    };
  }, []);

  const rows = stats
    ? [
        [t('stat_visits_logged'), stats.visits],
        [t('stat_points_issued'), stats.points],
        [t('stat_unique_clients'), stats.clients],
        [t('stat_active_rules'), stats.activeRules],
      ]
    : [];

  return (
    <div className="stat-row" id="portalStats">
      {rows.map(([lbl, num]) => (
        <div className="stat-box" key={lbl}>
          <div className="num">{num}</div>
          <div className="lbl">{lbl}</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Styles tab
   ============================================================ */
function StylesPanel({ active }) {
  const { t } = useI18n();
  const { toast } = useApp();
  const run = usePortalAction();
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const typeRef = useRef(null);
  const pointsRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const styles = usePortalData(() => listStyles(), []);

  async function submitStyle(ev) {
    ev.preventDefault();
    const name = nameRef.current.value.trim();
    const type = typeRef.current.value;
    const pointsPerVisit = parseInt(pointsRef.current.value, 10);
    if (!name || !pointsPerVisit) return;

    setBusy(true);
    const created = await run(() => createStyle({ name, type, pointsPerVisit }));
    setBusy(false);
    if (!created) return;

    formRef.current.reset();
    pointsRef.current.value = 40;
    toast(t('toast_style_added_prefix') + name);
  }

  function toggleStyle(s) {
    run(() => setStyleActive(s.id, s.active === false));
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-styles">
      <div className="panel-grid">
        <div className="panel-form">
          <T as="h4" k="styles_form_title" />
          <T as="div" className="hint" k="styles_form_hint" />
          <form id="styleForm" ref={formRef} onSubmit={submitStyle}>
            <T as="label" htmlFor="sName" k="label_style_name" />
            <input type="text" id="sName" ref={nameRef} placeholder="Balayage" required />
            <div className="row2">
              <div>
                <T as="label" htmlFor="sType" k="label_type" />
                <select id="sType" ref={typeRef} defaultValue="HAIR">
                  <option value="HAIR">{t('cat_hair')}</option>
                  <option value="NAIL">{t('cat_nail_opt')}</option>
                  <option value="SPA">{t('cat_spa')}</option>
                </select>
              </div>
              <div>
                <T as="label" htmlFor="sPoints" k="label_points_per_visit" />
                <input type="number" id="sPoints" ref={pointsRef} min="1" defaultValue="40" required />
              </div>
            </div>
            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Saving…' : t('styles_submit')}
            </button>
          </form>
        </div>
        <div id="stylesList">
          {styles === null ? null : !styles.length ? (
            <div className="empty">No styles yet — add your first one on the left.</div>
          ) : (
            styles.map((s) => (
              <div className="list-card" key={s.id}>
                <div>
                  <div className="lc-name">
                    {s.name} <span className={'tag ' + s.type}>{s.type.toLowerCase()}</span>
                  </div>
                  <div className="lc-meta">{s.pointsPerVisit} pts / visit</div>
                </div>
                <button
                  className={'toggle ' + (s.active !== false ? 'active' : 'inactive')}
                  onClick={() => toggleStyle(s)}
                >
                  {s.active !== false ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Reward rules tab
   ============================================================ */
function RulesPanel({ active }) {
  const { t } = useI18n();
  const { toast } = useApp();
  const run = usePortalAction();
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const triggerRef = useRef(null);
  const valueRef = useRef(null);
  const scopeRef = useRef(null);
  const rewardTypeRef = useRef(null);
  const rewardValueRef = useRef(null);
  const freeStyleRef = useRef(null);
  const [rewardType, setRewardType] = useState('PERCENT_OFF');
  const [busy, setBusy] = useState(false);

  const rules = usePortalData(() => listRewardRules(), []);
  // The scope dropdown lists real styles because `styleScopeId` is a foreign
  // key to one — see the divergence note at the top of this file.
  const styles = usePortalData(() => listStyles(), []);
  const activeStyles = styles ? styles.filter((s) => s.active !== false) : [];

  async function submitRule(ev) {
    ev.preventDefault();
    const name = nameRef.current.value.trim();
    const triggerValue = parseInt(valueRef.current.value, 10);
    if (!name || !triggerValue) return;

    const rule = {
      name,
      triggerType: triggerRef.current.value,
      triggerValue,
      styleScopeId: scopeRef.current.value || undefined,
      rewardType,
      oneTime: false,
    };

    if (rewardType === 'FREE_SERVICE') {
      if (!freeStyleRef.current || !freeStyleRef.current.value) {
        toast('Pick which service is free.');
        return;
      }
      rule.freeServiceStyleId = freeStyleRef.current.value;
    } else {
      const raw = parseInt(rewardValueRef.current.value, 10);
      if (!raw) return;
      // A merchant types dollars; the column holds cents. Doing the conversion
      // here rather than asking the user for "2000" is the whole reason the
      // seeded rule reads sensibly on both dashboards.
      rule.rewardValue = rewardType === 'FLAT_DISCOUNT' ? Math.round(raw * 100) : raw;
    }

    setBusy(true);
    const created = await run(() => createRewardRule(rule));
    setBusy(false);
    if (!created) return;

    formRef.current.reset();
    valueRef.current.value = 5;
    setRewardType('PERCENT_OFF');
    toast(t('toast_rule_added_prefix') + name);
  }

  function toggleRule(r) {
    run(() => setRewardRuleActive(r.id, r.active === false));
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-rules">
      <div className="panel-grid">
        <div className="panel-form">
          <T as="h4" k="rules_form_title" />
          <T as="div" className="hint" k="rules_form_hint" />
          <form id="ruleForm" ref={formRef} onSubmit={submitRule}>
            <T as="label" htmlFor="rName" k="label_rule_name" />
            <input type="text" id="rName" ref={nameRef} placeholder="Loyal Client Discount" required />
            <div className="row2">
              <div>
                <T as="label" htmlFor="rTrigger" k="label_trigger" />
                <select id="rTrigger" ref={triggerRef} defaultValue="VISIT_COUNT">
                  <option value="VISIT_COUNT">{t('opt_every_n_visits')}</option>
                  <option value="POINTS_THRESHOLD">{t('opt_every_n_points')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="rValue">N</label>
                <input type="number" id="rValue" ref={valueRef} min="1" defaultValue="5" required />
              </div>
            </div>
            <T as="label" htmlFor="rScope" k="label_applies_to" />
            <select id="rScope" ref={scopeRef} defaultValue="">
              <option value="">{t('opt_any_style')}</option>
              {activeStyles.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name + ' only'}
                </option>
              ))}
            </select>
            <div className="row2">
              <div>
                <T as="label" htmlFor="rRewardType" k="label_reward" />
                <select
                  id="rRewardType"
                  ref={rewardTypeRef}
                  value={rewardType}
                  onChange={(e) => setRewardType(e.target.value)}
                >
                  <option value="PERCENT_OFF">{t('opt_percent_off')}</option>
                  <option value="FLAT_DISCOUNT">{t('opt_flat_off')}</option>
                  <option value="FREE_SERVICE">{t('opt_free_service')}</option>
                </select>
              </div>
              <div>
                {/* A free service is named by style, not by a number — the
                    prototype asked for a value here in all three cases, which
                    is meaningless for the third. */}
                {rewardType === 'FREE_SERVICE' ? (
                  <>
                    <label htmlFor="rFreeStyle">Which service</label>
                    <select id="rFreeStyle" ref={freeStyleRef} required>
                      {activeStyles.length ? (
                        activeStyles.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.name}
                          </option>
                        ))
                      ) : (
                        <option value="">{t('opt_add_style_first')}</option>
                      )}
                    </select>
                  </>
                ) : (
                  <>
                    <T as="label" htmlFor="rRewardValue" k="label_value" />
                    <input
                      type="number"
                      id="rRewardValue"
                      ref={rewardValueRef}
                      min="1"
                      max={rewardType === 'PERCENT_OFF' ? '100' : undefined}
                      placeholder={rewardType === 'PERCENT_OFF' ? '20' : '20'}
                      required
                    />
                    <div className="hint">
                      {rewardType === 'PERCENT_OFF' ? 'percent off' : 'dollars off'}
                    </div>
                  </>
                )}
              </div>
            </div>
            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Saving…' : t('rules_submit')}
            </button>
          </form>
        </div>
        <div id="rulesList">
          {rules === null ? null : !rules.length ? (
            <div className="empty">No reward rules yet — add one on the left.</div>
          ) : (
            rules.map((r) => (
              <div className="list-card" key={r.id}>
                <div>
                  <div className="lc-name">{r.name}</div>
                  <div className="lc-meta">
                    {'every ' +
                      r.triggerValue +
                      ' ' +
                      unitLabel(r) +
                      ' (' +
                      scopeLabel(r) +
                      ') → ' +
                      rewardLabel(r)}
                  </div>
                </div>
                <button
                  className={'toggle ' + (r.active !== false ? 'active' : 'inactive')}
                  onClick={() => toggleRule(r)}
                >
                  {r.active !== false ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Ledger data — shared by the ledger tab and the "last logged"
   preview beside the log-visit form
   ============================================================ */
function useLedger() {
  // `GET /visits` already returns newest-first with the style and the client's
  // name/email included, so the prototype's client-side sort and its
  // phone→name lookup table both go away.
  return usePortalData(() => listMerchantVisits(), []);
}

function clientLabel(v) {
  return (v.user && (v.user.name || v.user.email)) || 'Client';
}

/* ============================================================
   Log-visit tab
   ============================================================ */
function LogVisitPanel({ active }) {
  const { t } = useI18n();
  const { toast } = useApp();
  const run = usePortalAction();
  const formRef = useRef(null);
  const emailRef = useRef(null);
  const nameRef = useRef(null);
  const styleRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const styles = usePortalData(() => listStyles(), []);
  const activeStyles = styles ? styles.filter((s) => s.active !== false) : null;
  const visits = useLedger();

  async function submitVisit(ev) {
    ev.preventDefault();
    const clientEmail = emailRef.current.value.trim();
    const clientName = nameRef.current.value.trim();
    const styleId = styleRef.current.value;
    if (!clientEmail || !styleId) {
      toast(t('toast_add_style_first'));
      return;
    }

    setBusy(true);
    const res = await run(() => logVisit({ clientEmail, clientName, styleId }));
    setBusy(false);
    if (!res) return;

    formRef.current.reset();

    // The server decides what unlocked — it re-derives progress from real
    // Visit rows, including T25's expired-points exclusion. The prototype did
    // this modulo arithmetic in the browser against invented data, which is
    // precisely the number a salon must not be guessing at.
    const style = (styles || []).find((s) => s.id === styleId);
    const pts = style ? style.pointsPerVisit : res.visit ? res.visit.pointsEarned : 0;

    if (res.unlocked && res.unlocked.length) {
      toast(
        t('toast_visit_logged_unlocked_prefix') +
          pts +
          t('toast_visit_logged_unlocked_mid') +
          res.unlocked.map((r) => r.name).join(', '),
        4500,
      );
    } else {
      toast(
        t('toast_visit_logged_prefix') + pts + t('toast_visit_logged_suffix') + (clientName || clientEmail),
      );
    }
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-logvisit">
      <div className="panel-grid">
        <div className="panel-form">
          <T as="h4" k="logvisit_title" />
          <T as="div" className="hint" k="logvisit_hint" />
          <form id="visitForm" ref={formRef} onSubmit={submitVisit}>
            {/* Email, not phone — see the divergence note at the top. A client
                who has never signed up gets a lightweight account created for
                them server-side, so the visit attaches to a real person the
                consumer app can later log into. */}
            <label htmlFor="vEmail">Client email</label>
            <input type="email" id="vEmail" ref={emailRef} placeholder="client@example.com" required />
            <T as="label" htmlFor="vName" k="label_client_name" />
            <input type="text" id="vName" ref={nameRef} placeholder={t('ph_new_client_name')} />
            <T as="label" htmlFor="vStyle" k="label_style_service" />
            <select id="vStyle" ref={styleRef} required>
              {activeStyles === null ? null : activeStyles.length ? (
                activeStyles.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name + ' — ' + s.pointsPerVisit + ' pts (' + s.type.toLowerCase() + ')'}
                  </option>
                ))
              ) : (
                <option value="">{t('opt_add_style_first')}</option>
              )}
            </select>
            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Logging…' : t('logvisit_submit')}
            </button>
          </form>
        </div>
        <div>
          <T as="div" className="hint" style={{ marginBottom: '10px' }} k="logvisit_add_style_first" />
          <div id="recentVisitsPreview">
            {visits && visits.length ? (
              <>
                <div className="hint" style={{ marginBottom: '8px' }}>
                  {t('last_logged')}
                </div>
                {visits.slice(0, 4).map((v) => (
                  <div className="list-card" key={v.id}>
                    <div>
                      <div className="lc-name">{clientLabel(v)}</div>
                      <div className="lc-meta">
                        {(v.style ? v.style.name : '') + ' · ' + formatDay(v.visitDate)}
                      </div>
                    </div>
                    <div className="merchant-points">+{v.pointsEarned}</div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Ledger tab
   ============================================================ */
function LedgerPanel({ active }) {
  const visits = useLedger();
  const rows = visits || [];

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-ledger">
      {/* T36's `.table-scroll` — a four-column table is wider than a phone, and
          without this the whole page scrolls sideways instead of the table. */}
      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <T as="th" k="th_date" />
              <T as="th" k="th_client" />
              <T as="th" k="th_style" />
              <T as="th" k="th_points" />
            </tr>
          </thead>
          <tbody id="ledgerBody">
            {rows.map((v) => (
              <tr key={v.id}>
                <td>{formatDay(v.visitDate)}</td>
                <td>{clientLabel(v)}</td>
                <td>
                  {v.style ? v.style.name : ''}{' '}
                  {v.style ? (
                    <span className={'tag ' + v.style.type}>{v.style.type.toLowerCase()}</span>
                  ) : null}
                </td>
                {/* T25 — an expired visit stays in history but no longer counts
                    toward a reward, so it is shown struck through rather than
                    hidden, matching the consumer's own visit history. */}
                <td className="pts" style={v.expired ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>
                  +{v.pointsEarned}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <T
        as="div"
        id="ledgerEmpty"
        className="empty"
        style={{ display: visits && !rows.length ? 'block' : 'none', marginTop: '16px' }}
        k="ledger_empty"
      />
    </div>
  );
}

/* ============================================================
   Profile tab

   Read-only, deliberately. No PATCH /merchants/me exists, and adding one is a
   product decision rather than an oversight: `businessName` is what the public
   salon directory lists under an admin's approval, `email` is the login
   identity, and `status` is the admin's to set. None of the three is safely
   self-serve without a moderation story, and the prototype's own portal had no
   profile editor at all. Recorded in TASKS.md under T37 so the client can ask
   for editing knowingly.
   ============================================================ */
function ProfilePanel({ active }) {
  const profile = usePortalData(() => getMerchantProfile(), []);

  if (!profile) {
    return <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-profile" />;
  }

  const sub = profile.subscription;
  const rows = [
    ['Business name', profile.businessName],
    ['Sign-in email', profile.email],
    ['Account status', profile.status],
    ['Email verified', profile.emailVerifiedAt ? formatDay(profile.emailVerifiedAt) : 'Not yet'],
    ['Member since', formatDay(profile.createdAt)],
    ['Plan', sub ? `${sub.plan} — $${(sub.priceCents / 100).toFixed(2)}` : 'No subscription yet'],
    ['Billing status', sub ? sub.status : '—'],
    ['Renews', sub ? formatDay(sub.currentPeriodEnd) : '—'],
  ];
  if (profile.foundingMember) rows.push(['Founding member', 'Yes — thank you']);

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-profile">
      <div id="profileList">
        {rows.map(([label, value]) => (
          <div className="list-card" key={label}>
            <div>
              <div className="lc-name">{label}</div>
              <div className="lc-meta">{String(value)}</div>
            </div>
          </div>
        ))}
        <div className="hint" style={{ marginTop: '12px' }}>
          To change your business details, contact Glow+ support. Your sign-in email and account
          status are managed for you.
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Team & Billing tabs — hand off, don't duplicate

   Both already exist as fully tested pages: /team (T24) and /business/billing
   (T17). The portal shares the billing page's token key (`glowplus:token`), so
   that handoff carries the session with it and needs no second sign-in. The
   team page holds its own key on purpose, because it can also hold a *staff*
   token — so it asks to sign in, which is correct rather than a rough edge.
   ============================================================ */
function LinkOutPanel({ id, active, title, blurb, href, cta, note }) {
  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id={id}>
      <div className="panel-form" style={{ maxWidth: '520px' }}>
        <h4>{title}</h4>
        <div className="hint">{blurb}</div>
        <a className="btn btn-primary auth-submit" href={href} style={{ display: 'inline-block', textAlign: 'center' }}>
          {cta}
        </a>
        {note ? (
          <div className="hint" style={{ marginTop: '10px' }}>
            {note}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ============================================================
   Portal shell
   ============================================================ */
export default function BusinessPortal({ active }) {
  const { currentMerchant, signOutMerchant } = useApp();
  const { t } = useI18n();
  const [tab, setTab] = useState('logvisit');

  const status = currentMerchant ? currentMerchant.status || 'ACTIVE' : 'ACTIVE';

  let bannerMsg = null;
  if (currentMerchant && status !== 'ACTIVE') {
    bannerMsg =
      status === 'PENDING'
        ? t('pending_banner_base') +
          (currentMerchant.foundingMember
            ? ' ' + t('pending_banner_founding')
            : ' ' + t('pending_banner_standard'))
        : t('suspended_banner');
  }

  const tabs = [
    ['logvisit', t('tab_logvisit')],
    ['styles', t('tab_styles')],
    ['rules', t('tab_rules')],
    ['ledger', t('tab_ledger')],
    ['profile', 'Profile'],
    ['team', 'Team'],
    ['billing', 'Billing'],
  ];

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-business-portal">
      <div className="portal-head">
        <h2 id="portalBizName">{currentMerchant ? currentMerchant.businessName : ' '}</h2>
        <T as="button" className="navbtn ghost" onClick={signOutMerchant} k="switch_salon" />
      </div>

      {bannerMsg ? (
        <div className="pending-banner" id="pendingBanner">
          {bannerMsg}
        </div>
      ) : null}

      <PortalStats />

      <div className="portal-tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={'ptab' + (tab === id ? ' active' : '')}
            data-tab={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <LogVisitPanel active={tab === 'logvisit'} />
      <StylesPanel active={tab === 'styles'} />
      <RulesPanel active={tab === 'rules'} />
      <LedgerPanel active={tab === 'ledger'} />
      <ProfilePanel active={tab === 'profile'} />
      <LinkOutPanel
        id="ptab-team"
        active={tab === 'team'}
        title="Your team"
        blurb="Invite receptionists and stylists, set who is an owner, and remove people who have left. Staff can log visits and see your reward rules; only an owner can change them or touch billing."
        href="/team"
        cta="Open team management"
        note="The team page asks you to sign in separately — it also accepts staff logins, which have fewer rights than this owner session."
      />
      <LinkOutPanel
        id="ptab-billing"
        active={tab === 'billing'}
        title="Billing & subscription"
        blurb="See your plan and renewal date, cancel at the end of the period, or resume a cancelled subscription."
        href="/business/billing"
        cta="Open billing"
      />
    </section>
  );
}
