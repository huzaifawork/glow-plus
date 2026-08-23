/**
 * ============================================================================
 * STORAGE ADAPTER — the one seam where Phase 5/6 swaps in the real API.
 * ============================================================================
 *
 * The prototype persisted through `window.storage`, a Claude-artifact API that
 * does not exist in a real browser. Every read was wrapped in try/catch and
 * returned a fallback, so in an actual browser the site accepted input, saved
 * nothing, and showed empty lists — silently.
 *
 * This adapter keeps that exact async contract (`get(key) -> {value} | null`,
 * `set(key, value)`) so every caller in lib/data.js ports over unchanged, but
 * backs it with localStorage so the site actually persists.
 *
 * To move onto the Glow+ backend, replace the two methods here with API calls.
 * Nothing else in the app needs to change.
 */

const PREFIX = 'glowplus:';

export const storage = {
  async get(key) {
    try {
      const value = window.localStorage.getItem(PREFIX + key);
      return value === null ? null : { value };
    } catch (e) {
      // Private-mode / disabled storage: behave like "nothing stored".
      return null;
    }
  },

  async set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch (e) {
      console.error('storage set failed', key, e);
    }
  },
};
