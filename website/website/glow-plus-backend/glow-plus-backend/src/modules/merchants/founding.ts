/**
 * The founding-member offer, in one place  (T43)
 *
 * "The first 50 salons & spas get their first month free." Two places act on
 * that number and they used to disagree about what it *counts*:
 *
 *   - `onboarding.service.ts` decides the badge from `merchant.count() < 50`
 *     — i.e. **every** merchant row, whatever its status.
 *   - the website's founding-spots counter counted merchants carrying the
 *     badge, which is a different set the moment a merchant is deleted, and
 *     was reading them out of `localStorage` anyway [F42].
 *
 * The signup gate is the one that actually costs money, so it is the
 * definition: a spot is taken when a merchant row exists. Exporting the cap
 * means `GET /merchants/founding-spots` can never quote a number the next
 * signup will contradict.
 */
export const FOUNDING_MEMBER_CAP = 50;

export type FoundingSpots = {
  /** How many founding spots the offer has in total. */
  cap: number;
  /** Spots claimed so far, never above `cap`. */
  taken: number;
  /** Spots still available, never below 0. */
  left: number;
};
