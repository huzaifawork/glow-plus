import { useI18n } from '../i18n/I18nContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useNav } from '../lib/useNav.js';
import { useAsyncData } from '../lib/useAsyncData.js';
import { useState } from 'react';
import { listPublicMerchantsPage, getFoundingSpots } from '../lib/api.js';
import Punch from '../components/Punch.jsx';
import T from '../components/T.jsx';

/* ---------- live "find a salon" grid (port of renderSalonGrid) ----------
   T36 — the real public salon directory. This used to read `data.js`, i.e.
   this browser's own localStorage, so the landing page's "find a salon"
   section could only ever list salons *you* had invented on *this* machine
   [F9]. It reads the real directory instead: ACTIVE merchants only, enforced
   server-side.

   It is genuinely public — no bearer token — which it has to be: this section
   sits above the fold on the marketing page, long before anyone has an
   account. Loading it here is also what keeps T48 honest.

   T43 — **one request, not 1+N.** T36 had to call GET /styles/public/:id once
   per salon purely to render "3 styles on the menu" and the tag row, so a
   directory of 40 salons cost 41 round trips from the landing page, in
   series-ish bursts, before anything rendered. `GET /merchants` now carries
   `styleCount` and `styleTypes` itself. */
/* How many salons the directory shows before asking. Deliberately smaller than
   the API's own DEFAULT_MERCHANT_PAGE of 50: the point of the button is that
   the section above the fold stays a short, scannable list, not that it
   matches the server's page size. */
const SALON_PAGE = 12;

/**
 * A salon's logo in the public directory  (W4, and the app's R3.12)
 *
 * Mirrors the mobile app's `SalonLogo` component, including its fallback: when
 * a salon has no logo — or the image fails to load — it shows a tinted
 * monogram rather than a broken-image icon or a blank gap. The two surfaces
 * behave the same way for the same reason the URL comes from the same field
 * (W5): a customer who sees a salon on the website and then in the app should
 * not be shown two different things.
 *
 * `loading="lazy"` and a fixed box mean the logo never delays or shifts the
 * rest of the card — the website's equivalent of the app's R3.13.
 */
function SalonLogo({ name, logoUrl }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const box = {
    width: 40,
    height: 40,
    borderRadius: 10,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#fde7f1',
    color: '#b00c58',
    fontWeight: 700,
    fontSize: 13,
  };

  if (!logoUrl || failed) {
    return (
      <div style={box} aria-hidden="true">
        {initials}
      </div>
    );
  }

  return (
    <div style={box}>
      <img
        src={logoUrl}
        alt={name + ' logo'}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}

function SalonGrid() {
  const { t } = useI18n();
  const { dataVersion } = useApp();

  // Accumulated across pages rather than replaced, so "Show more" appends.
  const [extra, setExtra] = useState([]);
  const [total, setTotal] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const first = useAsyncData(
    async () => {
      try {
        const { items, total: count } = await listPublicMerchantsPage({ limit: SALON_PAGE });
        setExtra([]);
        setTotal(count);
        return items;
      } catch {
        // The empty state below reads "no salons live on Glow+ yet", which is
        // also the least misleading thing to say when the API is unreachable.
        setExtra([]);
        setTotal(null);
        return [];
      }
    },
    [dataVersion],
    null
  );

  const cards = first ? [...first, ...extra] : first;
  // `total` is null when the header was unreadable — in which case say nothing
  // rather than guess, since a wrong "Show more" is worse than none.
  const hasMore = Boolean(cards && total != null && cards.length < total);

  async function showMore() {
    setLoadingMore(true);
    try {
      const { items } = await listPublicMerchantsPage({
        limit: SALON_PAGE,
        offset: cards.length,
      });
      setExtra((current) => [...current, ...items]);
    } catch {
      /* leave the list as it is; the button stays for another try */
    } finally {
      setLoadingMore(false);
    }
  }

  if (!cards || !cards.length) {
    return (
      <div className="salon-grid" id="salonGrid">
        <div className="empty" style={{ gridColumn: '1/-1' }}>
          No salons live on Glow+ yet — <b>be the first to add yours.</b>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="salon-grid" id="salonGrid">
      {cards.map((c) => (
        <div className="salon-card" key={c.id}>
          {/* W4 — "The website's public salon directory ... must display each
              salon's logo, where one has been provided, next to that salon's
              name." Same `logoUrl` field the mobile app reads off the same
              `GET /merchants` response (W5), so the two surfaces cannot show
              different images for one salon. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SalonLogo name={c.businessName} logoUrl={c.logoUrl} />
            <h4 style={{ margin: 0 }}>{c.businessName}</h4>
          </div>
          <div className="meta" style={{ marginTop: 8 }}>
            {c.styleCount} style{c.styleCount === 1 ? '' : 's'} on the menu
            {c.city ? ' \u00b7 ' + c.city : ''}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {c.styleTypes.length ? (
              c.styleTypes.map((type) => (
                <span className={'tag ' + type} key={type}>
                  {type.toLowerCase()}
                </span>
              ))
            ) : (
              <span className="meta">Menu coming soon</span>
            )}
          </div>
        </div>
      ))}
    </div>
    {hasMore ? (
      <div className="salon-more">
        <button className="btn btn-secondary" type="button" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? t('salons_loading') : t('salons_show_more')}
        </button>
        <div className="hint">{t('salons_showing', { shown: cards.length, total })}</div>
      </div>
    ) : null}
    </>
  );
}

/* ---------- founding-spots counter (port of renderFoundingSpots) ----------
   T43 [F42] — this was the last thing in the SPA still reading localStorage.
   It counted `foundingBadge` in `data.js`, i.e. salons invented in *this*
   browser, so on any fresh browser it announced all 50 spots free — forever,
   however many salons had actually signed up. It now asks the API.

   The cap comes from the server too, not from a constant here: signup decides
   the badge from the same number (`FOUNDING_MEMBER_CAP`), and a marketing
   page that advertises a spot the signup route is about to refuse is worse
   than the bug this replaces. */
function FoundingSpots() {
  const { t } = useI18n();
  const { dataVersion } = useApp();

  const spots = useAsyncData(
    // The placeholder copy below is a better failure state than a wrong
    // number, so an unreachable API keeps "checking availability" rather than
    // claiming the offer is either open or gone.
    () => getFoundingSpots().catch(() => null),
    [dataVersion],
    null
  );

  // Until the count lands, the element keeps its data-i18n placeholder copy,
  // exactly as the original markup did.
  if (!spots) {
    return <T as="div" className="fsub" id="foundingSpotsLeft" k="founding_checking" />;
  }

  return (
    <div className="fsub" id="foundingSpotsLeft">
      {spots.left > 0
        ? spots.left + ' ' + t('founding_spots_left_suffix', { cap: spots.cap })
        : t('founding_spots_claimed')}
    </div>
  );
}

export default function Marketing({ active }) {
  const { enterConsumerFlow, enterBusinessFlow } = useNav();

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-marketing">
      <div className="hero">
        <T as="div" className="eyebrow" k="hero_eyebrow" />
        <T as="h1" className="headline" k="hero_headline" />
        <T as="p" className="sub" k="hero_sub" />
        <div className="cta-row">
          <T as="button" className="btn btn-primary" onClick={enterConsumerFlow} k="hero_cta_consumer" />
          <T as="button" className="btn btn-outline" onClick={enterBusinessFlow} k="hero_cta_business" />
        </div>

        <div className="hero-visual">
          <div className="hero-card">
            <T as="div" className="card-label" k="hero_card_label" />
            <div className="card-style-name">Silk Press</div>
            <Punch id="heroPunch" total={5} filled={4} />
            <T as="div" className="punch-note" k="hero_card_note" />
            <div className="hero-stats">
              <div className="stat">
                <div className="num">340</div>
                <T as="div" className="lbl" k="hero_stat_points" />
              </div>
              <div className="stat">
                <div className="num">3/6</div>
                <T as="div" className="lbl" k="hero_stat_manicures" />
              </div>
              <div className="stat">
                <div className="num">7</div>
                <T as="div" className="lbl" k="hero_stat_salons" />
              </div>
            </div>
          </div>
        </div>

        <div className="categories">
          <div className="pill hair"><span className="dotsw"></span><T as="span" k="cat_hair" /></div>
          <div className="pill nail"><span className="dotsw"></span><T as="span" k="cat_nail" /></div>
          <div className="pill spa"><span className="dotsw"></span><T as="span" k="cat_spa" /></div>
        </div>
      </div>

      <section className="block">
        <div className="block-inner">
          <div className="block-head">
            <T as="h2" className="block-title" k="how_title" />
            <T as="div" className="block-desc" k="how_desc" />
          </div>
          <div className="steps">
            <div className="step">
              <T as="div" className="idx" k="how_step1_idx" />
              <T as="h3" k="how_step1_title" />
              <T as="p" k="how_step1_body" />
            </div>
            <div className="step">
              <T as="div" className="idx" k="how_step2_idx" />
              <T as="h3" k="how_step2_title" />
              <T as="p" k="how_step2_body" />
            </div>
            <div className="step">
              <T as="div" className="idx" k="how_step3_idx" />
              <T as="h3" k="how_step3_title" />
              <T as="p" k="how_step3_body" />
            </div>
          </div>
        </div>
      </section>

      <section className="block surface">
        <div className="block-inner">
          <div className="block-head">
            <T as="h2" className="block-title" k="find_title" />
            <T as="div" className="block-desc" k="find_desc" />
          </div>
          <SalonGrid />
        </div>
      </section>

      <section className="block dark" id="pricingSection">
        <div className="block-inner">
          <div className="block-head">
            <T as="h2" className="block-title" k="pricing_title" />
            <T as="div" className="block-desc ink-soft-on-dark" k="pricing_desc" />
          </div>

          <div className="founding-banner">
            <div>
              <T as="div" className="ftitle" k="founding_title" />
              <T as="div" className="fsub" k="founding_sub" />
            </div>
            <FoundingSpots />
          </div>

          <div className="pricing-grid">
            <div className="price-card">
              <T as="h3" k="price_monthly_label" />
              <div className="price-amt">$49.99<T as="span" k="price_per_mo" /></div>
              <T as="div" className="price-note" k="price_monthly_note" />
              <ul className="price-feat">
                <T as="li" k="price_feat_styles" />
                <T as="li" k="price_feat_visits" />
                <T as="li" k="price_feat_trial" />
              </ul>
              <T as="button" className="btn btn-primary auth-submit" onClick={enterBusinessFlow} k="price_cta" />
            </div>
            <div className="price-card featured">
              <T as="div" className="price-badge" k="price_save_badge" />
              <T as="h3" k="price_annual_label" />
              <div className="price-amt">$479.99<T as="span" k="price_per_yr" /></div>
              <T as="div" className="price-note" k="price_annual_note" />
              <ul className="price-feat">
                <T as="li" k="price_feat_everything" />
                <T as="li" k="price_feat_free_months" />
                <T as="li" k="price_feat_trial" />
              </ul>
              <T as="button" className="btn btn-primary auth-submit" onClick={enterBusinessFlow} k="price_cta" />
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="block-inner">
          <div className="split">
            <div className="split-card">
              <T as="h3" k="split_consumer_title" />
              <T as="p" k="split_consumer_body" />
              <T as="button" className="btn btn-outline" onClick={enterConsumerFlow} k="split_consumer_cta" />
            </div>
            <div className="split-card">
              <T as="h3" k="split_owner_title" />
              <T as="p" k="split_owner_body" />
              <T as="button" className="btn btn-outline" onClick={enterBusinessFlow} k="split_owner_cta" />
            </div>
          </div>
        </div>
      </section>

      <footer>
        <T as="div" k="footer_copy" />
        <T as="div" k="footer_note" />
        {/* T66 — these are static pages in public/, not SPA views, so they are
            plain anchors. A privacy policy has to be reachable without running
            any JavaScript, and it must survive being linked to from an email
            or a Stripe checkout page. Deliberately not translated: [F68]'s
            reasoning applies doubly to legal text, where a machine translation
            is worse than English. */}
        <div style={{ marginTop: '10px' }}>
          <a href="/privacy.html">Privacy Policy</a>
          {' · '}
          <a href="/terms.html">Terms of Service</a>
        </div>
      </footer>
    </section>
  );
}
