/* [F68] — wrapped in I18nProvider.
 *
 * This is a standalone Vite entry point, not part of the SPA, and it never
 * mounted the provider — so `document.documentElement.dir` was never set and
 * the page stayed **left-to-right in Arabic** while the SPA mirrored
 * correctly. Proved across 176 real-Chrome combinations in J8: every one of
 * these pages reported `html lang="en"` and no `dir` attribute in all eight
 * languages.
 *
 * That matters most precisely here: these pages are reached from a
 * transactional EMAIL, which is the one context where the visitor's language
 * preference cannot be carried across in the link — it has to be read from
 * the browser or from what they picked earlier on the site, and only the
 * provider does that.
 */
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../i18n/I18nContext.jsx';
import AcceptInvitePage from './AcceptInvitePage.jsx';
import '../booking/booking.css';
import './staff.css';

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <AcceptInvitePage />
  </I18nProvider>
);
