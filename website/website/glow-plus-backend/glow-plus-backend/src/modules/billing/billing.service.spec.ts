/**
 * Tests for readPeriod()  (T17)
 *
 * This exists because of a bug that cost real money-path functionality and
 * was completely silent. Stripe moved `current_period_start` / `_end` off the
 * Subscription object onto its items. The handler read only the top-level
 * fields, got `undefined`, and `new Date(undefined * 1000)` is `Invalid Date`
 * — which Prisma rejects. The webhook then returned 400 to Stripe and logged
 * nothing, because the controller caught its own error.
 *
 * Both shapes are covered below, in both directions, so this cannot silently
 * regress the next time Stripe's account API version moves.
 */
import { readPeriod } from './billing.service';
import Stripe from 'stripe';

const START = 1787520478;
const END = 1788125278;

function sub(fields: Record<string, unknown>): Stripe.Subscription {
  return { id: 'sub_test', ...fields } as unknown as Stripe.Subscription;
}

describe('readPeriod', () => {
  it('reads the period from the subscription ITEM (2025-03-31.basil and 2026-07-29.dahlia)', () => {
    // Verified live: both the pinned client and the webhook payload return
    // the period only here, with the top-level fields absent.
    const period = readPeriod(sub({ items: { data: [{ current_period_start: START, current_period_end: END }] } }));

    expect(period.start).toEqual(new Date(START * 1000));
    expect(period.end).toEqual(new Date(END * 1000));
  });

  it('falls back to the TOP-LEVEL fields when there is no item period (older versions)', () => {
    const period = readPeriod(sub({ current_period_start: START, current_period_end: END, items: { data: [{}] } }));

    expect(period.start).toEqual(new Date(START * 1000));
    expect(period.end).toEqual(new Date(END * 1000));
  });

  it('prefers the item period when both are present', () => {
    const period = readPeriod(
      sub({
        current_period_start: 1, current_period_end: 2,
        items: { data: [{ current_period_start: START, current_period_end: END }] },
      }),
    );

    expect(period.start).toEqual(new Date(START * 1000));
  });

  it('handles a subscription with no items array at all', () => {
    const period = readPeriod(sub({ current_period_start: START, current_period_end: END }));

    expect(period.start).toEqual(new Date(START * 1000));
  });

  it('THROWS rather than producing an Invalid Date when the period is missing everywhere', () => {
    // The whole point. Previously this produced `Invalid Date`, which Prisma
    // rejected with a message pointing nowhere near the real cause.
    expect(() => readPeriod(sub({ items: { data: [{}] } }))).toThrow(/no billing period/);
  });

  it('never returns an Invalid Date for any shape it accepts', () => {
    for (const shape of [
      { items: { data: [{ current_period_start: START, current_period_end: END }] } },
      { current_period_start: START, current_period_end: END },
    ]) {
      const p = readPeriod(sub(shape));
      expect(Number.isNaN(p.start.getTime())).toBe(false);
      expect(Number.isNaN(p.end.getTime())).toBe(false);
    }
  });
});
