import { useI18n } from '../i18n/I18nContext.jsx';

/**
 * The React equivalent of the prototype's `data-i18n` attribute.
 *
 * applyStaticTranslations() did `el.innerHTML = t(key)` on every [data-i18n]
 * element, and a lot of the strings carry real markup (`<b>`, `<br>`, `<em>`),
 * so the innerHTML assignment is load-bearing rather than incidental. Setting
 * it on the element itself — not on an inserted wrapper — is what keeps the
 * rendered DOM byte-identical to the original.
 */
export default function T({ as: Tag = 'div', k, ...rest }) {
  const { t } = useI18n();
  return <Tag {...rest} dangerouslySetInnerHTML={{ __html: t(k) }} />;
}
