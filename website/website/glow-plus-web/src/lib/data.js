import { storage } from './storage.js';

/**
 * The language preference, and nothing else.
 *
 * This file used to be the prototype's whole data layer — every merchant,
 * style, rule and visit, read out of `localStorage` [F9]. T36 (consumer),
 * T37 (portal) and T38 (admin) moved each view onto the real API, and
 * **T43 removed the last reader**: `Marketing.jsx`'s founding-spots counter
 * now asks `GET /merchants/founding-spots` instead of counting badges in this
 * browser [F42]. The dead getters/setters went with it, exactly as the note
 * that stood here said they should once that happened.
 *
 * What is left is the one thing that genuinely belongs in `localStorage`: a
 * per-browser display preference, which has no account to hang off and must
 * survive a reload for a signed-out visitor.
 */
export async function getPreferredLanguage() {
  const res = await storage.get('preferredLanguage', false);
  return res ? res.value : null;
}

export async function setPreferredLanguage(lang) {
  return storage.set('preferredLanguage', lang, false);
}
