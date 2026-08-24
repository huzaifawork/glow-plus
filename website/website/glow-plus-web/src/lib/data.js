import { storage } from './storage.js';

/**
 * The prototype's data layer, ported function-for-function. Only the transport
 * underneath (storage.js) changed; every signature and every caller is the same.
 *
 * ⚠️ **Almost nothing imports this any more.** T36 (consumer), T37 (portal)
 * and T38 (admin) each moved their view onto the real API, and T38 was the
 * last caller of `saveMerchants` — so every getter/setter below is now dead
 * code except `getMerchants`, still read by `Marketing.jsx`'s founding-spots
 * counter [F42], and the two language helpers, which are a genuine
 * per-browser preference and belong in localStorage.
 *
 * **Delete the rest when [F42] is closed**, not before: doing it now would
 * leave that one counter importing a file kept alive for it alone, and the
 * change is worth making once rather than twice.
 */
async function loadJSON(key, fallback) {
  try {
    const res = await storage.get(key, true);
    return res ? JSON.parse(res.value) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function saveJSON(key, value) {
  try {
    await storage.set(key, JSON.stringify(value), true);
  } catch (e) {
    console.error('storage set failed', key, e);
  }
}

export async function getMerchants() { return loadJSON('merchants', []); }
export async function saveMerchants(list) { return saveJSON('merchants', list); }
export async function getConsumers() { return loadJSON('consumers', []); }
export async function saveConsumers(list) { return saveJSON('consumers', list); }
export async function getStyles(merchantId) { return loadJSON('styles:' + merchantId, []); }
export async function saveStyles(merchantId, list) { return saveJSON('styles:' + merchantId, list); }
export async function getRules(merchantId) { return loadJSON('rules:' + merchantId, []); }
export async function saveRules(merchantId, list) { return saveJSON('rules:' + merchantId, list); }
export async function getVisits(merchantId) { return loadJSON('visits:' + merchantId, []); }
export async function saveVisits(merchantId, list) { return saveJSON('visits:' + merchantId, list); }

export async function getPreferredLanguage() {
  const res = await storage.get('preferredLanguage', false);
  return res ? res.value : null;
}

export async function setPreferredLanguage(lang) {
  return storage.set('preferredLanguage', lang, false);
}
