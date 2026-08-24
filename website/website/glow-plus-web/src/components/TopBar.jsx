import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useNav } from '../lib/useNav.js';
import T from './T.jsx';

/**
 * The shared top bar.
 *
 * ── Why there is a hamburger here (T39b) ───────────────────────────────────
 *
 * T39 contained the nav — before it, `.topbar`'s fixed `height:52px` let the
 * wrapped rows spill over the promo bar above and the page heading below. But
 * containing it cost height: seven controls at a 44px tap target cannot fit one
 * row at 390px, so the header became 103px of a 844px viewport, permanently,
 * and the wrap point landed wherever the width happened to run out. Correct,
 * but it read as a bug rather than as a design.
 *
 * Below 700px the nav therefore collapses behind a toggle and the bar goes back
 * to its designed 52px. **Above 700px nothing changes at all** — the desktop
 * header is a single clean row and is deliberately left alone.
 *
 * The panel closes on selection, on Escape, and on a click outside it. All
 * three matter: without the first, tapping "Home" leaves the panel covering the
 * page you just navigated to; without the last, the only way out of an
 * accidentally-opened menu is the toggle itself.
 */
export default function TopBar() {
  const { lang, setLanguage, LANG_NAMES, t } = useI18n();
  const { goHome, enterConsumerFlow, enterBusinessFlow, enterAdmin } = useNav();
  const { currentConsumer, currentMerchant, signOutConsumer, signOutMerchant } = useApp();
  const [open, setOpen] = useState(false);
  const barRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  /** Wraps a nav action so the panel never outlives the view it navigated from. */
  const go = useCallback((fn) => () => { close(); fn(); }, [close]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onPointer = (e) => { if (barRef.current && !barRef.current.contains(e.target)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  return (
    <div className="topbar" ref={barRef}>
      <a
        href="#"
        className="brand"
        onClick={(e) => {
          e.preventDefault();
          close();
          goHome();
        }}
      >
        Glow<span className="plus">+</span>
      </a>

      {/* Hidden above 700px — see the media query in global.css. */}
      <button
        type="button"
        className="navtoggle"
        id="navToggle"
        aria-label={t('nav_menu')}
        aria-expanded={open}
        aria-controls="topnav"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>
      </button>

      <div className={'topnav' + (open ? ' open' : '')} id="topnav">
        <select
          id="langSwitcher"
          className="navbtn ghost"
          value={lang}
          onChange={(e) => {
            setLanguage(e.target.value);
            close();
          }}
        >
          {Object.keys(LANG_NAMES).map((code) => (
            <option key={code} value={code}>
              {LANG_NAMES[code]}
            </option>
          ))}
        </select>
        <T as="button" className="navbtn ghost" onClick={go(goHome)} k="nav_home" />
        <T as="button" className="navbtn" id="navConsumer" onClick={go(enterConsumerFlow)} k="nav_rewards" />
        <T as="button" className="navbtn ghost" id="navAdmin" onClick={go(enterAdmin)} k="nav_admin" />
        <T as="button" className="navbtn primary" id="navBusiness" onClick={go(enterBusinessFlow)} k="nav_business" />
        {currentConsumer || currentMerchant ? (
          <T
            as="button"
            className="navbtn ghost"
            onClick={go(currentMerchant ? signOutMerchant : signOutConsumer)}
            k="auth_logout"
          />
        ) : null}
      </div>
    </div>
  );
}
