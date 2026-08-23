import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import {
  getConsumers,
  getRules,
  getStyles,
  getVisits,
  saveConsumers,
  saveRules,
  saveStyles,
  saveVisits,
} from '../lib/data.js';
import { genId, normPhone } from '../lib/helpers.js';
import T from '../components/T.jsx';

/*
 * A note on the `merchantId == null` branches below.
 *
 * In the original document all four tab panels existed in the DOM from the
 * start, with their list containers (#stylesList, #rulesList, #ledgerBody,
 * #recentVisitsPreview) empty — the render*() functions only populated them
 * once a merchant had actually logged in. So "no merchant yet" and "merchant
 * with zero styles" produced *different* markup: empty vs. the "No styles yet"
 * empty-state card. Passing merchantId={null} reproduces the former.
 */

/* ============================================================
   Shared label helpers — lifted from the prototype's render code
   ============================================================ */
function rewardLabel(r) {
  return r.rewardType === 'PERCENT_OFF'
    ? r.rewardValue + '% off'
    : r.rewardType === 'FLAT_DISCOUNT'
    ? '$' + r.rewardValue + ' off'
    : r.rewardValue + ' free';
}

function unitLabel(r) {
  return r.triggerType === 'VISIT_COUNT' ? 'visits' : 'points';
}

/* ============================================================
   Portal stats (port of renderPortalStats)
   ============================================================ */
function PortalStats({ merchantId }) {
  const { t } = useI18n();
  const { dataVersion } = useApp();

  const stats = useAsyncData(
    async () => {
      if (!merchantId) return null;
      const [rules, visits] = await Promise.all([
        getRules(merchantId),
        getVisits(merchantId),
      ]);
      return {
        visits: visits.length,
        points: visits.reduce((s, v) => s + v.pointsEarned, 0),
        clients: new Set(visits.map((v) => v.consumerPhone)).size,
        activeRules: rules.filter((r) => r.active !== false).length,
      };
    },
    [dataVersion, merchantId],
    null
  );

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
function StylesPanel({ merchantId, active }) {
  const { t } = useI18n();
  const { dataVersion, bumpData, toast } = useApp();
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const typeRef = useRef(null);
  const pointsRef = useRef(null);

  const styles = useAsyncData(
    async () => (merchantId ? getStyles(merchantId) : null),
    [dataVersion, merchantId],
    null
  );

  async function submitStyle(ev) {
    ev.preventDefault();
    const name = nameRef.current.value.trim();
    const type = typeRef.current.value;
    const points = parseInt(pointsRef.current.value, 10);
    if (!name || !points) return false;

    const list = await getStyles(merchantId);
    list.push({ id: genId(), name, type, pointsPerVisit: points, active: true });
    await saveStyles(merchantId, list);

    formRef.current.reset();
    pointsRef.current.value = 40;
    bumpData();
    toast(t('toast_style_added_prefix') + name);
    return false;
  }

  async function toggleStyle(id) {
    const list = await getStyles(merchantId);
    const s = list.find((x) => x.id === id);
    if (s) {
      s.active = s.active === false ? true : false;
      await saveStyles(merchantId, list);
      bumpData();
    }
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
            <T as="button" className="btn btn-primary auth-submit" type="submit" k="styles_submit" />
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
                  onClick={() => toggleStyle(s.id)}
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
function RulesPanel({ merchantId, active }) {
  const { t } = useI18n();
  const { dataVersion, bumpData, toast } = useApp();
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const triggerRef = useRef(null);
  const valueRef = useRef(null);
  const scopeRef = useRef(null);
  const rewardTypeRef = useRef(null);
  const rewardValueRef = useRef(null);

  const rules = useAsyncData(
    async () => (merchantId ? getRules(merchantId) : null),
    [dataVersion, merchantId],
    null
  );

  async function submitRule(ev) {
    ev.preventDefault();
    const name = nameRef.current.value.trim();
    const triggerType = triggerRef.current.value;
    const triggerValue = parseInt(valueRef.current.value, 10);
    const styleScope = scopeRef.current.value || null;
    const rewardType = rewardTypeRef.current.value;
    const rewardValue = rewardValueRef.current.value.trim();
    if (!name || !triggerValue || !rewardValue) return false;

    const list = await getRules(merchantId);
    list.push({
      id: genId(),
      name,
      triggerType,
      triggerValue,
      styleScope,
      rewardType,
      rewardValue,
      active: true,
    });
    await saveRules(merchantId, list);

    formRef.current.reset();
    valueRef.current.value = 5;
    bumpData();
    toast(t('toast_rule_added_prefix') + name);
    return false;
  }

  async function toggleRule(id) {
    const list = await getRules(merchantId);
    const r = list.find((x) => x.id === id);
    if (r) {
      r.active = r.active === false ? true : false;
      await saveRules(merchantId, list);
      bumpData();
    }
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
              <option value="HAIR">{t('opt_hair_only')}</option>
              <option value="NAIL">{t('opt_nail_only')}</option>
              <option value="SPA">{t('opt_spa_only')}</option>
            </select>
            <div className="row2">
              <div>
                <T as="label" htmlFor="rRewardType" k="label_reward" />
                <select id="rRewardType" ref={rewardTypeRef} defaultValue="PERCENT_OFF">
                  <option value="PERCENT_OFF">{t('opt_percent_off')}</option>
                  <option value="FLAT_DISCOUNT">{t('opt_flat_off')}</option>
                  <option value="FREE_SERVICE">{t('opt_free_service')}</option>
                </select>
              </div>
              <div>
                <T as="label" htmlFor="rRewardValue" k="label_value" />
                <input type="text" id="rRewardValue" ref={rewardValueRef} placeholder="20" required />
              </div>
            </div>
            <T as="button" className="btn btn-primary auth-submit" type="submit" k="rules_submit" />
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
                      (r.styleScope ? r.styleScope + ' only' : 'any style') +
                      ') → ' +
                      rewardLabel(r)}
                  </div>
                </div>
                <button
                  className={'toggle ' + (r.active !== false ? 'active' : 'inactive')}
                  onClick={() => toggleRule(r.id)}
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
   preview that sits beside the log-visit form
   ============================================================ */
function useLedger(merchantId) {
  const { dataVersion } = useApp();
  return useAsyncData(
    async () => {
      if (!merchantId) return null;
      const visits = (await getVisits(merchantId)).slice().sort((a, b) => b.date - a.date);
      const consumers = await getConsumers();
      const nameByPhone = {};
      consumers.forEach((c) => {
        nameByPhone[c.phone] = c.name;
      });
      return { visits, nameByPhone };
    },
    [dataVersion, merchantId],
    null
  );
}

/* ============================================================
   Log-visit tab
   ============================================================ */
function LogVisitPanel({ merchantId, active }) {
  const { t } = useI18n();
  const { dataVersion, bumpData, toast } = useApp();
  const formRef = useRef(null);
  const phoneRef = useRef(null);
  const nameRef = useRef(null);
  const styleRef = useRef(null);

  const activeStyles = useAsyncData(
    async () =>
      merchantId ? (await getStyles(merchantId)).filter((s) => s.active !== false) : null,
    [dataVersion, merchantId],
    null
  );
  const ledger = useLedger(merchantId);

  async function submitVisit(ev) {
    ev.preventDefault();
    const phone = normPhone(phoneRef.current.value);
    const name = nameRef.current.value.trim();
    const styleId = styleRef.current.value;
    if (!phone || !name || !styleId) return false;

    const styles = await getStyles(merchantId);
    const style = styles.find((s) => s.id === styleId);
    if (!style) {
      toast(t('toast_add_style_first'));
      return false;
    }

    // upsert consumer
    const consumers = await getConsumers();
    let consumer = consumers.find((c) => c.phone === phone);
    if (!consumer) {
      consumer = { phone, name, createdAt: Date.now() };
      consumers.push(consumer);
    } else {
      consumer.name = name;
    }
    await saveConsumers(consumers);

    // record visit
    const list = await getVisits(merchantId);
    const visit = {
      id: genId(),
      consumerPhone: phone,
      styleId: style.id,
      styleName: style.name,
      styleType: style.type,
      pointsEarned: style.pointsPerVisit,
      date: Date.now(),
    };
    list.push(visit);
    await saveVisits(merchantId, list);

    // check reward triggers (modulo logic — repeats every Nth visit/points)
    const rules = (await getRules(merchantId)).filter((r) => r.active !== false);
    const clientVisits = list.filter((v) => v.consumerPhone === phone);
    const unlocked = [];
    for (const r of rules) {
      const scoped = r.styleScope
        ? clientVisits.filter((v) => v.styleType === r.styleScope)
        : clientVisits;
      const progress =
        r.triggerType === 'VISIT_COUNT'
          ? scoped.length
          : scoped.reduce((s, v) => s + v.pointsEarned, 0);
      if (progress > 0 && progress % r.triggerValue === 0) unlocked.push(r);
    }

    formRef.current.reset();
    bumpData();

    if (unlocked.length) {
      const rewardTxt = unlocked.map((r) => r.name).join(', ');
      toast(
        t('toast_visit_logged_unlocked_prefix') +
          style.pointsPerVisit +
          t('toast_visit_logged_unlocked_mid') +
          rewardTxt,
        4500
      );
    } else {
      toast(
        t('toast_visit_logged_prefix') +
          style.pointsPerVisit +
          t('toast_visit_logged_suffix') +
          name
      );
    }
    return false;
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-logvisit">
      <div className="panel-grid">
        <div className="panel-form">
          <T as="h4" k="logvisit_title" />
          <T as="div" className="hint" k="logvisit_hint" />
          <form id="visitForm" ref={formRef} onSubmit={submitVisit}>
            <T as="label" htmlFor="vPhone" k="label_client_phone" />
            <input type="tel" id="vPhone" ref={phoneRef} placeholder="431 338 3939" required />
            <T as="label" htmlFor="vName" k="label_client_name" />
            <input
              type="text"
              id="vName"
              ref={nameRef}
              placeholder={t('ph_new_client_name')}
              required
            />
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
            <T as="button" className="btn btn-primary auth-submit" type="submit" k="logvisit_submit" />
          </form>
        </div>
        <div>
          <T as="div" className="hint" style={{ marginBottom: '10px' }} k="logvisit_add_style_first" />
          <div id="recentVisitsPreview">
            {ledger && ledger.visits.length ? (
              <>
                <div className="hint" style={{ marginBottom: '8px' }}>
                  {t('last_logged')}
                </div>
                {ledger.visits.slice(0, 4).map((v) => (
                  <div className="list-card" key={v.id}>
                    <div>
                      <div className="lc-name">
                        {ledger.nameByPhone[v.consumerPhone] || v.consumerPhone}
                      </div>
                      <div className="lc-meta">
                        {v.styleName} · {new Date(v.date).toLocaleDateString()}
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
function LedgerPanel({ merchantId, active }) {
  const ledger = useLedger(merchantId);
  const visits = ledger ? ledger.visits : [];

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ptab-ledger">
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
          {visits.map((v) => (
            <tr key={v.id}>
              <td>{new Date(v.date).toLocaleDateString()}</td>
              <td>{ledger.nameByPhone[v.consumerPhone] || v.consumerPhone}</td>
              <td>
                {v.styleName} <span className={'tag ' + v.styleType}>{v.styleType.toLowerCase()}</span>
              </td>
              <td className="pts">+{v.pointsEarned}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <T
        as="div"
        id="ledgerEmpty"
        className="empty"
        style={{
          display: ledger && !visits.length ? 'block' : 'none',
          marginTop: '16px',
        }}
        k="ledger_empty"
      />
    </div>
  );
}

/* ============================================================
   Portal shell (port of renderBusinessPortal)
   ============================================================ */
export default function BusinessPortal({ active }) {
  const { currentMerchant, setCurrentMerchant, showView } = useApp();
  const { t } = useI18n();
  const [tab, setTab] = useState('logvisit');

  function logoutBusiness() {
    setCurrentMerchant(null);
    showView('view-business-auth');
  }

  const merchantId = currentMerchant ? currentMerchant.id : null;
  const status = currentMerchant ? currentMerchant.status || 'ACTIVE' : 'ACTIVE';

  let bannerMsg = null;
  if (currentMerchant && status !== 'ACTIVE') {
    bannerMsg =
      status === 'PENDING'
        ? t('pending_banner_base') +
          (currentMerchant.foundingBadge
            ? ' ' + t('pending_banner_founding')
            : ' ' + t('pending_banner_standard'))
        : t('suspended_banner');
  }

  const tabs = [
    ['logvisit', 'tab_logvisit'],
    ['styles', 'tab_styles'],
    ['rules', 'tab_rules'],
    ['ledger', 'tab_ledger'],
  ];

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-business-portal">
      <div className="portal-head">
        <h2 id="portalBizName">{currentMerchant ? currentMerchant.businessName : ' '}</h2>
        <T as="button" className="navbtn ghost" onClick={logoutBusiness} k="switch_salon" />
      </div>

      {bannerMsg ? (
        <div className="pending-banner" id="pendingBanner">
          {bannerMsg}
        </div>
      ) : null}

      <PortalStats merchantId={merchantId} />

      <div className="portal-tabs">
        {tabs.map(([id, key]) => (
          <T
            as="button"
            key={id}
            className={'ptab' + (tab === id ? ' active' : '')}
            data-tab={id}
            onClick={() => setTab(id)}
            k={key}
          />
        ))}
      </div>

      <LogVisitPanel merchantId={merchantId} active={tab === 'logvisit'} />
      <StylesPanel merchantId={merchantId} active={tab === 'styles'} />
      <RulesPanel merchantId={merchantId} active={tab === 'rules'} />
      <LedgerPanel merchantId={merchantId} active={tab === 'ledger'} />
    </section>
  );
}
