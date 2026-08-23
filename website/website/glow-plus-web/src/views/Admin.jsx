import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import { getMerchants, saveMerchants } from '../lib/data.js';
import T from '../components/T.jsx';

export default function Admin({ active }) {
  const { t } = useI18n();
  const { dataVersion, bumpData, toast } = useApp();

  const merchants = useAsyncData(() => getMerchants(), [dataVersion], []);

  // renderAdmin() only ran when enterAdmin() was called, so #adminStats,
  // #adminPending and #adminAll sat empty until the tab was first opened —
  // and stayed populated from then on. This mirrors that.
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    if (active) setRendered(true);
  }, [active]);

  const pending = merchants.filter((m) => (m.status || 'ACTIVE') === 'PENDING');
  const activeMerchants = merchants.filter((m) => (m.status || 'ACTIVE') === 'ACTIVE');
  const suspended = merchants.filter((m) => m.status === 'SUSPENDED');
  // simplified: everyone shown as monthly-equivalent
  const mrrCents = activeMerchants.length * 4999;

  async function setStatus(id, status, toastKey) {
    const list = await getMerchants();
    const m = list.find((x) => x.id === id);
    if (m) {
      m.status = status;
      await saveMerchants(list);
      bumpData();
      toast(t(toastKey) + m.businessName);
    }
  }

  const adminApprove = (id) => setStatus(id, 'ACTIVE', 'toast_approved_prefix');
  const adminSuspend = (id) => setStatus(id, 'SUSPENDED', 'toast_suspended_prefix');

  const stats = [
    [t('stat_active_salons'), activeMerchants.length],
    [t('admin_pending_title'), pending.length],
    [t('stat_suspended'), suspended.length],
    [t('stat_est_mrr'), '$' + (mrrCents / 100).toFixed(2)],
  ];

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-admin">
      <div className="portal-head">
        <T as="h2" k="admin_title" />
      </div>

      <div className="stat-row" id="adminStats">
        {(rendered ? stats : []).map(([lbl, num]) => (
          <div className="stat-box" key={lbl}>
            <div className="num">{num}</div>
            <div className="lbl">{lbl}</div>
          </div>
        ))}
      </div>

      <div className="block-head" style={{ textAlign: 'left', marginBottom: '16px' }}>
        <T as="h2" className="block-title" style={{ fontSize: '22px' }} k="admin_pending_title" />
      </div>
      <div id="adminPending">
        {!rendered ? null : pending.length ? (
          pending.map((m) => (
            <div className="list-card" key={m.id}>
              <div>
                <div className="lc-name">{m.businessName}</div>
                <div className="lc-meta">
                  {(m.foundingBadge ? t('badge_founding_50') + ' · ' : '') +
                    t('meta_applied') +
                    ' ' +
                    new Date(m.createdAt).toLocaleDateString() +
                    ' · ' +
                    t('meta_first_month_free')}
                </div>
              </div>
              <button className="toggle active" onClick={() => adminApprove(m.id)}>
                {t('btn_approve')}
              </button>
            </div>
          ))
        ) : (
          <div className="empty">{t('admin_nothing_pending')}</div>
        )}
      </div>

      <div className="block-head" style={{ textAlign: 'left', margin: '36px 0 16px' }}>
        <T as="h2" className="block-title" style={{ fontSize: '22px' }} k="admin_all_title" />
      </div>
      <div id="adminAll">
        {!rendered ? null : merchants.length ? (
          merchants.map((m) => {
            const status = m.status || 'ACTIVE';
            const statusLabel =
              status === 'ACTIVE'
                ? t('status_active')
                : status === 'PENDING'
                ? t('status_pending')
                : status === 'SUSPENDED'
                ? t('status_suspended')
                : status;
            // The tag class is reused purely for its colour here — SPA green for
            // active, NAIL gold for pending, HAIR pink for suspended.
            const tagClass =
              status === 'ACTIVE' ? 'SPA' : status === 'PENDING' ? 'NAIL' : 'HAIR';

            return (
              <div className="list-card" key={m.id}>
                <div>
                  <div className="lc-name">
                    {m.businessName}{' '}
                    <span className={'tag ' + tagClass}>{statusLabel}</span>
                  </div>
                  <div className="lc-meta">
                    {m.foundingBadge ? t('badge_founding_50_member') : t('badge_standard')}
                  </div>
                </div>
                {status === 'ACTIVE' ? (
                  <button className="toggle inactive" onClick={() => adminSuspend(m.id)}>
                    {t('btn_suspend')}
                  </button>
                ) : status === 'SUSPENDED' ? (
                  <button className="toggle active" onClick={() => adminApprove(m.id)}>
                    {t('btn_reactivate')}
                  </button>
                ) : (
                  <button className="toggle active" onClick={() => adminApprove(m.id)}>
                    {t('btn_approve')}
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="empty">{t('admin_no_salons')}</div>
        )}
      </div>
    </section>
  );
}
