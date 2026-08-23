import { useI18n } from '../i18n/I18nContext.jsx';
import { useNav } from '../lib/useNav.js';
import T from './T.jsx';

export default function TopBar() {
  const { lang, setLanguage, LANG_NAMES } = useI18n();
  const { goHome, enterConsumerFlow, enterBusinessFlow, enterAdmin } = useNav();

  return (
    <div className="topbar">
      <a
        href="#"
        className="brand"
        onClick={(e) => {
          e.preventDefault();
          goHome();
        }}
      >
        Glow<span className="plus">+</span>
      </a>
      <div className="topnav">
        <select
          id="langSwitcher"
          className="navbtn ghost"
          style={{ padding: '8px 10px' }}
          value={lang}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {Object.keys(LANG_NAMES).map((code) => (
            <option key={code} value={code}>
              {LANG_NAMES[code]}
            </option>
          ))}
        </select>
        <T as="button" className="navbtn ghost" onClick={goHome} k="nav_home" />
        <T as="button" className="navbtn" id="navConsumer" onClick={enterConsumerFlow} k="nav_rewards" />
        <T as="button" className="navbtn ghost" id="navAdmin" onClick={enterAdmin} k="nav_admin" />
        <T as="button" className="navbtn primary" id="navBusiness" onClick={enterBusinessFlow} k="nav_business" />
      </div>
    </div>
  );
}
