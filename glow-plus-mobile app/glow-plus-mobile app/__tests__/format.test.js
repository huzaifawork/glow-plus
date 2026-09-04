/**
 * The words the app puts on screen  (R3.5, R4.2, R4.3, R2.3)
 *
 * Two groups, and the first is the important one.
 *
 * **The availability label (R3.5).** The requirement names the four states in
 * as many words and says they *"must be computed centrally ... rather than
 * calculated independently inside the app"*. These tests are what proves the
 * app is only WORDING the server's answer: every case below drives
 * `availabilityLabel` from a `state` and nothing else, and there is no input
 * here — no seat count, no opening hours — that could let the app reach a
 * different conclusion from the website.
 *
 * **The reward maths (R2.3).** `progress % triggerValue`, matching the
 * platform's own, so a repeatable reward at 7 of 5 visits reads as two-fifths
 * toward the next one rather than 140% of the last.
 */
import {
  availabilityLabel,
  canCancel,
  describeProgress,
  describeRemaining,
  describeReward,
  formatPoints,
  hasAvailability,
  initialsOf,
  progressRatio,
  statusInfo,
} from '../src/utils/format';

describe('availabilityLabel — the four states R3.5 names', () => {
  it('says "N spots left" with the right plural', () => {
    expect(availabilityLabel({ state: 'AVAILABLE', spotsLeft: 3 }).label).toBe('3 spots left today');
    expect(availabilityLabel({ state: 'AVAILABLE', spotsLeft: 1 }).label).toBe('1 spot left today');
  });

  it('says "Fully booked today"', () => {
    expect(availabilityLabel({ state: 'FULLY_BOOKED', spotsLeft: 0 }).label).toBe(
      'Fully booked today',
    );
  });

  it('says "Closed today"', () => {
    expect(availabilityLabel({ state: 'CLOSED', spotsLeft: 0 }).label).toBe('Closed today');
  });

  it('has an appropriate not-yet-bookable state', () => {
    // Worded as a fact about the salon rather than an error: they have not put
    // a menu up yet.
    expect(availabilityLabel({ state: 'NOT_BOOKABLE', spotsLeft: 0 }).label).toBe(
      'Not bookable yet',
    );
  });

  it('swaps "today" for "that day" when the user has scrolled the date forward', () => {
    // *"...must update whenever the user changes the selected date."* Saying
    // "fully booked today" on a card showing next Tuesday is simply false.
    expect(availabilityLabel({ state: 'FULLY_BOOKED' }, { isToday: false }).label).toBe(
      'Fully booked that day',
    );
    expect(availabilityLabel({ state: 'AVAILABLE', spotsLeft: 2 }, { isToday: false }).label).toBe(
      '2 spots left that day',
    );
  });

  it('shows a pending state rather than guessing before the answer arrives', () => {
    // A confident wrong answer that corrects itself is worse than a visibly
    // pending one — the user may already have decided.
    const pending = availabilityLabel(null);
    expect(pending.pending).toBe(true);
    expect(pending.label).toBe('Checking…');
  });

  it('warns when a salon is nearly full, but never contradicts the state', () => {
    expect(availabilityLabel({ state: 'AVAILABLE', spotsLeft: 1 }).tone).toBe('warning');
    expect(availabilityLabel({ state: 'AVAILABLE', spotsLeft: 8 }).tone).toBe('success');
  });

  it('is driven ONLY by `state` — seats and opening hours cannot change it', () => {
    // This is R3.5's "computed centrally" requirement expressed as a test: a
    // capacity object whose other fields all say "busy and shut" still reads
    // as available, because the SERVER said AVAILABLE. If a future edit starts
    // inferring the label locally, this test fails.
    const contradictory = {
      state: 'AVAILABLE',
      spotsLeft: 4,
      seats: 1,
      inUseNow: 99,
      freeNow: 0,
      openNow: false,
      openOnDate: false,
      fullyBookedToday: true,
    };
    expect(availabilityLabel(contradictory).label).toBe('4 spots left today');
  });
});

describe('hasAvailability — the R3.8 filter', () => {
  it('is true only for AVAILABLE', () => {
    expect(hasAvailability({ state: 'AVAILABLE' })).toBe(true);
    for (const state of ['FULLY_BOOKED', 'CLOSED', 'NOT_BOOKABLE']) {
      expect(hasAvailability({ state })).toBe(false);
    }
    expect(hasAvailability(null)).toBe(false);
    expect(hasAvailability(undefined)).toBe(false);
  });
});

describe('statusInfo — R4.2', () => {
  it('covers every status the platform can return', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) {
      const info = statusInfo(status);
      expect(info.label).toBeTruthy();
      expect(info.short).toBeTruthy();
      expect(info.tone).toBeTruthy();
    }
  });

  it('words statuses from the customer’s side of the counter', () => {
    // The enum is written from the salon's side. A person reading their own
    // history needs "Missed", not an internal term; and "pending" alone does
    // not tell a first-time user that somebody still has to say yes.
    expect(statusInfo('NO_SHOW').label).toBe('Missed');
    expect(statusInfo('PENDING').label).toBe('Awaiting confirmation');
  });

  it('degrades to the raw value rather than crashing on an unknown status', () => {
    // A status added to the platform later must not blank the card.
    expect(statusInfo('SOMETHING_NEW').label).toBe('SOMETHING_NEW');
    expect(statusInfo(undefined).label).toBe('Unknown');
  });
});

describe('canCancel — R4.3', () => {
  it('allows only pending and confirmed', () => {
    // *"The user must be able to cancel a booking that is still pending or
    // confirmed."* Offering Cancel on anything else is a button that produces
    // a 400, which teaches the user the app is unreliable.
    expect(canCancel('PENDING')).toBe(true);
    expect(canCancel('CONFIRMED')).toBe(true);
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW', undefined]) {
      expect(canCancel(status)).toBe(false);
    }
  });
});

describe('reward progress — R2.3', () => {
  const visitRule = { triggerType: 'VISIT_COUNT', triggerValue: 5, progress: 3, remaining: 2 };

  it('reports partial progress toward the NEXT reward, not past the last one', () => {
    // 7 of 5 visits on a repeatable rule is two-fifths of the way to the next
    // one. `progress / triggerValue` would say 140%.
    const past = { ...visitRule, progress: 7 };
    expect(progressRatio(past)).toBeCloseTo(2 / 5, 6);
    expect(describeProgress(past)).toBe('2 of 5 visits');
  });

  it('shows a FULL bar for a reward that is ready to claim', () => {
    // 7 % 5 = 2, but the customer has one waiting. An empty-looking bar on the
    // exact visit that earned the reward is the worst possible moment for it.
    const ready = { ...visitRule, progress: 5, eligible: true };
    expect(progressRatio(ready)).toBe(1);
    expect(describeProgress(ready)).toBe('5 of 5 visits');
    expect(describeRemaining(ready)).toBe('Ready to claim');
  });

  it('stays within 0..1 for any input', () => {
    expect(progressRatio({ triggerValue: 0, progress: 3 })).toBe(0);
    expect(progressRatio(null)).toBe(0);
    expect(progressRatio({ ...visitRule, progress: 0 })).toBe(0);
  });

  it('uses the right unit and plural for points rules', () => {
    const points = { triggerType: 'POINTS', triggerValue: 300, progress: 200, remaining: 100 };
    expect(describeProgress(points)).toBe('200 of 300 points');
    expect(describeRemaining(points)).toBe('100 more points');
    expect(describeRemaining({ ...visitRule, remaining: 1 })).toBe('1 more visit');
  });
});

describe('describeReward', () => {
  it('names a free SERVICE, not a number', () => {
    // [F62] on the platform — a FREE_SERVICE rule's value is a style id, so
    // rendering `rewardValue` would print "Free 1".
    expect(
      describeReward({ rewardType: 'FREE_SERVICE', rewardValue: 1, freeServiceName: 'Silk Press' }),
    ).toBe('Free Silk Press');
  });

  it('falls back when the free service has been deleted', () => {
    expect(describeReward({ rewardType: 'FREE_SERVICE', rewardValue: 1 })).toBe('Free service');
  });

  it('formats percentage and amount rewards', () => {
    expect(describeReward({ rewardType: 'PERCENT_OFF', rewardValue: 20 })).toBe('20% off');
    expect(describeReward({ rewardType: 'AMOUNT_OFF', rewardValue: 15 })).toBe('$15 off');
  });
});

describe('initialsOf — the R3.12 placeholder', () => {
  it('takes the first and last initials of a multi-word name', () => {
    expect(initialsOf('Bloom Hair Studio')).toBe('BS');
  });

  it('handles a single word and an empty name without crashing', () => {
    expect(initialsOf('Polished')).toBe('PO');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('formatPoints', () => {
  it('separates thousands so a big total reads as a number', () => {
    expect(formatPoints(12450)).toMatch(/12[,\s]450/);
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(null)).toBe('0');
  });
});
