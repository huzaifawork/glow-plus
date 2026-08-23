import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { I18N, LANG_NAMES } from './translations.js';
import { getPreferredLanguage, setPreferredLanguage } from '../lib/data.js';

const I18nContext = createContext(null);

/**
 * Mirrors the prototype's initLanguage(): a stored preference wins, otherwise
 * fall back to the browser's language, otherwise English.
 *
 * (In the prototype the navigator fallback lived in a catch block that only ran
 * because `window.storage` threw — which, in a real browser, was always. Keeping
 * it as an explicit fallback preserves the behaviour users actually got.)
 */
function resolveInitialLang(stored) {
  if (stored && I18N[stored]) return stored;
  const nav = (navigator.language || 'en').slice(0, 2);
  if (I18N[nav]) return nav;
  return 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored = null;
      try {
        stored = await getPreferredLanguage();
      } catch (e) {
        /* fall through to navigator detection */
      }
      if (!cancelled) setLang(resolveInitialLang(stored));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The tail of applyStaticTranslations() — this is what flips Arabic to RTL.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const t = useCallback(
    (key, params) => {
      const dict = I18N[lang] || I18N.en;
      let str =
        dict && dict[key] !== undefined
          ? dict[key]
          : I18N.en[key] !== undefined
          ? I18N.en[key]
          : key;
      if (params) {
        Object.keys(params).forEach((p) => {
          str = str.replace('{' + p + '}', params[p]);
        });
      }
      return str;
    },
    [lang]
  );

  const setLanguage = useCallback(async (next) => {
    const value = I18N[next] ? next : 'en';
    setLang(value);
    try {
      await setPreferredLanguage(value);
    } catch (e) {
      /* preference just won't persist */
    }
  }, []);

  return (
    <I18nContext.Provider value={{ lang, setLanguage, t, LANG_NAMES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
