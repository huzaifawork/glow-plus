import { useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import { getConsumers, saveConsumers } from '../lib/data.js';
import { normPhone } from '../lib/helpers.js';
import T from '../components/T.jsx';

export default function ConsumerAuth({ active }) {
  const { showView, setCurrentConsumer, dataVersion, bumpData } = useApp();

  const nameRef = useRef(null);
  const phoneRef = useRef(null);

  // Port of enterConsumerFlow()'s quick-pick population.
  const consumers = useAsyncData(() => getConsumers(), [dataVersion], []);
  const quickPicks = consumers.slice(-6).reverse();

  async function quickLoginConsumer(phone) {
    const list = await getConsumers();
    const c = list.find((x) => x.phone === phone);
    if (c) {
      setCurrentConsumer(c);
      showView('view-consumer-dashboard');
    }
  }

  async function submitConsumerAuth(ev) {
    ev.preventDefault();
    const name = nameRef.current.value.trim();
    const phone = normPhone(phoneRef.current.value);
    if (!name || !phone) return false;

    const list = await getConsumers();
    let existing = list.find((c) => c.phone === phone);
    if (existing) {
      existing.name = name;
    } else {
      existing = { phone, name, createdAt: Date.now() };
      list.push(existing);
    }
    await saveConsumers(list);
    bumpData();
    setCurrentConsumer(existing);
    showView('view-consumer-dashboard');
    return false;
  }

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-consumer-auth">
      <div className="auth-shell">
        <T as="h2" k="consumer_auth_title" />
        <T as="div" className="sub" k="consumer_auth_sub" />
        <form id="consumerForm" onSubmit={submitConsumerAuth}>
          <T as="label" htmlFor="cName" k="label_your_name" />
          <input type="text" id="cName" ref={nameRef} placeholder="Joseph Ilunga" required />
          <T as="label" htmlFor="cPhone" k="label_phone" />
          <input type="tel" id="cPhone" ref={phoneRef} placeholder="431 338 3939" required />
          <T as="button" className="btn btn-primary auth-submit" type="submit" k="consumer_auth_submit" />
        </form>
        <div id="consumerQuickWrap" style={{ display: quickPicks.length ? 'block' : 'none' }}>
          <T as="div" className="switch-role" style={{ marginTop: '22px' }} k="quickpick_existing_card" />
          <div className="quickpick" id="consumerQuick">
            {quickPicks.map((c) => (
              <button type="button" key={c.phone} onClick={() => quickLoginConsumer(c.phone)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        {/* NOTE: the original markup nested a "Go to business login" anchor inside
            this element, but applyStaticTranslations() overwrote the element's
            innerHTML with the plain-text translation, so the link never survived
            to the rendered page. Reproduced as-is; see MIGRATION.md. */}
        <T as="div" className="switch-role" k="consumer_auth_switch" />
      </div>
    </section>
  );
}
