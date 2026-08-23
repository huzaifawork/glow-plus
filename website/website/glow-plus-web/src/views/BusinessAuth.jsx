import { useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import { getMerchants, saveMerchants } from '../lib/data.js';
import { FOUNDING_BADGE_CAP, genId } from '../lib/helpers.js';
import T from '../components/T.jsx';

export default function BusinessAuth({ active }) {
  const { showView, setCurrentMerchant, dataVersion, bumpData, toast } = useApp();
  const { t } = useI18n();
  const nameRef = useRef(null);

  const merchants = useAsyncData(() => getMerchants(), [dataVersion], []);
  const quickPicks = merchants.slice(-6).reverse();

  async function quickLoginBusiness(id) {
    const list = await getMerchants();
    const m = list.find((x) => x.id === id);
    if (m) {
      setCurrentMerchant(m);
      showView('view-business-portal');
    }
  }

  async function submitBusinessAuth(ev) {
    ev.preventDefault();
    const name = nameRef.current.value.trim();
    if (!name) return false;

    const list = await getMerchants();
    let existing = list.find(
      (m) => m.businessName.toLowerCase() === name.toLowerCase()
    );

    if (!existing) {
      const foundingCount = list.filter((m) => m.foundingBadge).length;
      // Everyone gets the free first month — the founding badge is just an
      // honest "you were early" honor for the first 50 and doesn't gate or
      // limit the actual benefit for anyone who signs up after them.
      const foundingBadge = foundingCount < FOUNDING_BADGE_CAP;
      existing = {
        id: genId(),
        businessName: name,
        status: 'PENDING',
        foundingBadge,
        freeFirstMonth: true,
        createdAt: Date.now(),
      };
      list.push(existing);
      await saveMerchants(list);
      bumpData();
      toast(foundingBadge ? t('toast_founding_welcome') : t('toast_standard_welcome'));
    }

    setCurrentMerchant(existing);
    showView('view-business-portal');
    return false;
  }

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-business-auth">
      <div className="auth-shell">
        <T as="h2" k="business_auth_title" />
        <T as="div" className="sub" k="business_auth_sub" />
        <form id="businessForm" onSubmit={submitBusinessAuth}>
          <T as="label" htmlFor="bName" k="label_business_name" />
          <input type="text" id="bName" ref={nameRef} placeholder="Bloom Hair Studio" required />
          <T as="button" className="btn btn-primary auth-submit" type="submit" k="business_auth_submit" />
        </form>
        <div id="businessQuickWrap" style={{ display: quickPicks.length ? 'block' : 'none' }}>
          <T as="div" className="switch-role" style={{ marginTop: '22px' }} k="quickpick_existing_salon" />
          <div className="quickpick" id="businessQuick">
            {quickPicks.map((m) => (
              <button type="button" key={m.id} onClick={() => quickLoginBusiness(m.id)}>
                {m.businessName}
              </button>
            ))}
          </div>
        </div>
        {/* Same pre-existing quirk as the consumer view: the inline
            "Go to customer login" anchor was overwritten by the translation. */}
        <T as="div" className="switch-role" k="business_auth_switch" />
      </div>
    </section>
  );
}
