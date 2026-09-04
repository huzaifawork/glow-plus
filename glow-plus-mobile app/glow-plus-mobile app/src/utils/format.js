/**
 * Turning platform data into words.
 *
 * Every string a user reads that is derived from an enum, a number or a status
 * is built here rather than inline in a component, for one reason: the same
 * value appears on more than one screen, and a booking that is "Awaiting
 * confirmation" on one and "Pending" on another is two different products.
 */
import { colors } from '../theme';

/* --------------------------------------------------------------------------
   Booking status  (R4.2 — "pending, confirmed, completed, cancelled, no-show")
   -------------------------------------------------------------------------- */

/**
 * Customer-facing copy for each status, plus the colour it is shown in.
 *
 * The labels are written from the CUSTOMER's side of the counter, which is not
 * the same as the enum's. `NO_SHOW` is the clearest case: the database records
 * that the salon marked a missed appointment; a person reading their own
 * history needs "Missed", not an internal term. `PENDING` becomes "Awaiting
 * confirmation" because "pending" does not tell a first-time user that
 * somebody still has to say yes.
 */
export const BOOKING_STATUS = {
  PENDING: {
    label: 'Awaiting confirmation',
    short: 'Pending',
    tone: 'warning',
    hint: 'The salon has your request and will confirm shortly.',
  },
  CONFIRMED: {
    label: 'Confirmed',
    short: 'Confirmed',
    tone: 'success',
    hint: "You're booked in. See you there.",
  },
  COMPLETED: {
    label: 'Completed',
    short: 'Completed',
    tone: 'info',
    hint: 'Points from this visit have been added to your balance.',
  },
  CANCELLED: {
    label: 'Cancelled',
    short: 'Cancelled',
    tone: 'neutral',
    hint: 'This appointment was cancelled.',
  },
  NO_SHOW: {
    label: 'Missed',
    short: 'Missed',
    tone: 'danger',
    hint: 'The salon marked this appointment as missed.',
  },
};

export function statusInfo(status) {
  return (
    BOOKING_STATUS[status] ?? {
      label: status ?? 'Unknown',
      short: status ?? 'Unknown',
      tone: 'neutral',
      hint: '',
    }
  );
}

/** Tone name → the pair of colours a pill uses. One lookup, so tones stay consistent. */
export const TONES = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  brand: { bg: colors.brandSoft, fg: colors.brandDeep },
  neutral: { bg: colors.surfaceSunken, fg: colors.inkSoft },
};

export function toneColors(tone) {
  return TONES[tone] ?? TONES.neutral;
}

/**
 * R4.3 — only a pending or confirmed booking may be cancelled.
 *
 * A predicate rather than a check written into the button, because both the
 * booking card and the confirmation sheet need it, and a screen that offered
 * Cancel on a completed booking would be asking the server for a 400.
 */
export function canCancel(status) {
  return status === 'PENDING' || status === 'CONFIRMED';
}

/* --------------------------------------------------------------------------
   Availability  (R3.5 — the four states, and their exact wording)
   -------------------------------------------------------------------------- */

/**
 * The sentence for a salon's availability on the selected date.
 *
 * ⚠️ **This function does not DECIDE the state — it only words it.** The
 * decision is `capacity.state`, computed by the backend, because R3.5 requires
 * it to be *"computed centrally ... rather than calculated independently
 * inside the app"*. Everything here is a lookup keyed on the server's answer,
 * and there is deliberately no branch on `seats`, `openNow` or the booking
 * list. If a future edit starts inferring the state here, that requirement is
 * being broken.
 *
 * The four labels are the ones R3.5 detail names: *"'Fully booked today,' 'N
 * spots left today,' 'Closed today,' or an appropriate not-yet-bookable
 * state"* — with "today" swapped for "that day" when the user has scrolled the
 * date strip forward, since "fully booked today" on a card showing next
 * Tuesday would be a lie.
 */
export function availabilityLabel(capacity, { isToday = true } = {}) {
  if (!capacity) return { label: 'Checking…', tone: 'neutral', pending: true };

  const when = isToday ? 'today' : 'that day';

  switch (capacity.state) {
    case 'AVAILABLE': {
      const n = capacity.spotsLeft;
      return {
        label: n === 1 ? `1 spot left ${when}` : `${n} spots left ${when}`,
        tone: n <= 2 ? 'warning' : 'success',
      };
    }
    case 'FULLY_BOOKED':
      return { label: `Fully booked ${when}`, tone: 'danger' };
    case 'CLOSED':
      return { label: `Closed ${when}`, tone: 'neutral' };
    case 'NOT_BOOKABLE':
      // The "appropriate not-yet-bookable state". Worded as a fact about the
      // salon rather than an error, because it is one: they have not put a
      // menu up yet.
      return { label: 'Not bookable yet', tone: 'neutral' };
    default:
      return { label: 'Availability unknown', tone: 'neutral' };
  }
}

/** R3.8 — "a nearby salon that is not fully booked". This is the "can take me" half. */
export function hasAvailability(capacity) {
  return capacity?.state === 'AVAILABLE';
}

/* --------------------------------------------------------------------------
   Rewards
   -------------------------------------------------------------------------- */

/** "20% off" / "Free Classic Manicure" / "$15 off" — what the customer actually gets. */
export function describeReward(reward) {
  switch (reward.rewardType) {
    case 'PERCENT_OFF':
      return `${reward.rewardValue}% off`;
    case 'AMOUNT_OFF':
      return `$${reward.rewardValue} off`;
    case 'FREE_SERVICE':
      // [F62] on the platform — a FREE_SERVICE rule's value is a STYLE, not a
      // number, and `freeServiceName` is the field that carries it. Without
      // the fallback a salon whose free service was deleted would read
      // "Free 1".
      return reward.freeServiceName ? `Free ${reward.freeServiceName}` : 'Free service';
    default:
      return 'Reward';
  }
}

/** "3 of 5 visits" / "200 of 300 points" — R2.3's "fill indicator" in words. */
export function describeProgress(reward) {
  const unit = reward.triggerType === 'VISIT_COUNT' ? 'visit' : 'point';
  const done = reward.progress % reward.triggerValue;
  const shown = reward.eligible ? reward.triggerValue : done;
  return `${shown} of ${reward.triggerValue} ${unit}${reward.triggerValue === 1 ? '' : 's'}`;
}

/**
 * How far along, 0..1 — the number the progress bar draws.
 *
 * `progress % triggerValue` and not `progress / triggerValue`, matching the
 * platform's own maths: a repeatable reward at 7 of 5 visits is two-fifths of
 * the way to the NEXT one, not 140% of the way to the last.
 *
 * Clamped, because an eligible reward should read as a full bar rather than as
 * an empty one on the exact visit that earned it (7 % 5 = 2, but the customer
 * has one waiting).
 */
export function progressRatio(reward) {
  if (!reward?.triggerValue) return 0;
  if (reward.eligible) return 1;
  const done = reward.progress % reward.triggerValue;
  return Math.max(0, Math.min(1, done / reward.triggerValue));
}

/** "1 more visit" / "100 more points" — the call to action under the bar. */
export function describeRemaining(reward) {
  if (reward.eligible) return 'Ready to claim';
  const unit = reward.triggerType === 'VISIT_COUNT' ? 'visit' : 'point';
  const n = reward.remaining;
  return `${n} more ${unit}${n === 1 ? '' : 's'}`;
}

/* --------------------------------------------------------------------------
   Misc
   -------------------------------------------------------------------------- */

/** Thousands separators on a points total, so "12450" reads as a number. */
export function formatPoints(points) {
  return new Intl.NumberFormat('en-CA').format(points ?? 0);
}

/** "BH" for "Bloom Hair Studio" — the placeholder monogram R3.12 asks for. */
export function initialsOf(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** "218 Queen St W, Toronto" — skipping the parts a salon has not filled in. */
export function formatAddress(salon) {
  return [salon?.addressLine, salon?.city, salon?.region].filter(Boolean).join(', ');
}

/** `n === 1 ? one : many`, so plural bugs are one function rather than forty ternaries. */
export function plural(n, one, many) {
  return n === 1 ? one : many;
}
