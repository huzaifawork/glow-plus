/**
 * The offline evaluation backend  (R5.1)
 *
 * *"The app must be usable for evaluation and demonstration purposes without
 * requiring a live backend connection."*
 *
 * This is a small in-memory implementation of the same endpoints
 * `client.js` calls, returning the same shapes, so **every screen behaves
 * identically with demo mode on or off**. It is not a set of fixtures the UI
 * special-cases: nothing outside this file knows demo mode exists except the
 * one `if` in `client.js` that chooses between the two.
 *
 * Two rules kept it honest:
 *
 *  1. **Every field the real API returns is present here, spelled the same.**
 *     When the demo payload and the real one diverge, the demo stops proving
 *     anything about the app.
 *  2. **State mutates.** Booking really adds a row that My Bookings then
 *     shows; cancelling really changes its status; availability really loses
 *     the slot you just took. A demo mode that resets on every read cannot
 *     demonstrate the flows R3.4/R4.3 are about.
 *
 * The salons carry real coordinates (downtown Toronto, the platform's default
 * `SALON_TIMEZONE`) so distance sorting — R3.6-R3.8 — is exercisable on a
 * simulator with a mock location, and one salon deliberately has **no**
 * coordinates so R3.9's "handle that gracefully" is exercisable too.
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** `YYYY-MM-DD` for a Date, in local time — matching the app's own date helper. */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SALONS = [
  {
    id: 'demo-m1',
    businessName: 'Bloom Hair Studio',
    foundingMember: true,
    seats: 3,
    logoUrl: null,
    addressLine: '218 Queen St W',
    city: 'Toronto',
    region: 'ON',
    postalCode: 'M5V 1Z4',
    latitude: 43.6503,
    longitude: -79.3925,
    styleCount: 3,
    styleTypes: ['HAIR'],
  },
  {
    id: 'demo-m2',
    businessName: 'Polished Nail Bar',
    foundingMember: false,
    seats: 2,
    logoUrl: null,
    addressLine: '1140 Yonge St',
    city: 'Toronto',
    region: 'ON',
    postalCode: 'M4W 2L8',
    latitude: 43.6817,
    longitude: -79.3907,
    styleCount: 2,
    styleTypes: ['NAIL'],
  },
  {
    id: 'demo-m3',
    businessName: 'Stillwater Spa',
    foundingMember: false,
    seats: 4,
    logoUrl: null,
    addressLine: '55 Mill St',
    city: 'Toronto',
    region: 'ON',
    postalCode: 'M5A 3C4',
    latitude: 43.6503,
    longitude: -79.3592,
    styleCount: 2,
    styleTypes: ['SPA', 'OTHER'],
  },
  {
    // R3.9 / the spec's own dependency note — a salon with NO registered
    // location has to be a state the app handles, so demo mode contains one.
    // It is absent from distance-sorted results and present everywhere else.
    id: 'demo-m4',
    businessName: 'The Corner Chair',
    foundingMember: false,
    seats: 1,
    logoUrl: null,
    addressLine: null,
    city: 'Hamilton',
    region: 'ON',
    postalCode: null,
    latitude: null,
    longitude: null,
    styleCount: 1,
    styleTypes: ['HAIR'],
  },
];

const STYLES = {
  'demo-m1': [
    { id: 'demo-s1', merchantId: 'demo-m1', name: 'Silk Press', type: 'HAIR', pointsPerVisit: 40, durationMinutes: 60, active: true },
    { id: 'demo-s2', merchantId: 'demo-m1', name: 'Balayage', type: 'HAIR', pointsPerVisit: 60, durationMinutes: 120, active: true },
    { id: 'demo-s3', merchantId: 'demo-m1', name: 'Trim & Style', type: 'HAIR', pointsPerVisit: 20, durationMinutes: 30, active: true },
  ],
  'demo-m2': [
    { id: 'demo-s4', merchantId: 'demo-m2', name: 'French Tip Gel', type: 'NAIL', pointsPerVisit: 35, durationMinutes: 45, active: true },
    { id: 'demo-s5', merchantId: 'demo-m2', name: 'Classic Manicure', type: 'NAIL', pointsPerVisit: 20, durationMinutes: 30, active: true },
  ],
  'demo-m3': [
    { id: 'demo-s6', merchantId: 'demo-m3', name: 'Deep Tissue Massage', type: 'SPA', pointsPerVisit: 70, durationMinutes: 60, active: true },
    { id: 'demo-s7', merchantId: 'demo-m3', name: 'Hot Stone Ritual', type: 'OTHER', pointsPerVisit: 90, durationMinutes: 90, active: true },
  ],
  'demo-m4': [
    { id: 'demo-s8', merchantId: 'demo-m4', name: "Gentleman's Cut", type: 'HAIR', pointsPerVisit: 25, durationMinutes: 30, active: true },
  ],
};

/** 0 = Sunday. Stillwater is shut on Mondays, so "Closed" is demonstrable. */
const HOURS = {
  'demo-m1': { 0: null, 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '20:00'], 4: ['09:00', '20:00'], 5: ['09:00', '18:00'], 6: ['10:00', '16:00'] },
  'demo-m2': { 0: null, 1: ['10:00', '19:00'], 2: ['10:00', '19:00'], 3: ['10:00', '19:00'], 4: ['10:00', '19:00'], 5: ['10:00', '19:00'], 6: ['10:00', '17:00'] },
  'demo-m3': { 0: ['11:00', '17:00'], 1: null, 2: ['10:00', '20:00'], 3: ['10:00', '20:00'], 4: ['10:00', '20:00'], 5: ['10:00', '20:00'], 6: ['10:00', '18:00'] },
  'demo-m4': { 0: null, 1: null, 2: ['09:00', '17:00'], 3: ['09:00', '17:00'], 4: ['09:00', '17:00'], 5: ['09:00', '17:00'], 6: ['09:00', '14:00'] },
};

const USER = {
  id: 'demo-user',
  name: 'Joseph Ilunga',
  email: 'demo@glowplusmember.com',
  emailVerified: true,
  createdAt: new Date(Date.now() - 240 * DAY).toISOString(),
};

/** Mutable — the whole point. See rule 2 in the header. */
let bookings = [
  {
    id: 'demo-b1',
    merchantId: 'demo-m1',
    merchant: { businessName: 'Bloom Hair Studio', logoUrl: null },
    styleId: 'demo-s1',
    style: { id: 'demo-s1', name: 'Silk Press', type: 'HAIR', durationMinutes: 60, pointsPerVisit: 40 },
    startTime: new Date(Date.now() + 2 * DAY).toISOString(),
    endTime: new Date(Date.now() + 2 * DAY + 60 * MINUTE).toISOString(),
    status: 'CONFIRMED',
    notes: null,
  },
  {
    id: 'demo-b2',
    merchantId: 'demo-m2',
    merchant: { businessName: 'Polished Nail Bar', logoUrl: null },
    styleId: 'demo-s4',
    style: { id: 'demo-s4', name: 'French Tip Gel', type: 'NAIL', durationMinutes: 45, pointsPerVisit: 35 },
    startTime: new Date(Date.now() + 5 * DAY).toISOString(),
    endTime: new Date(Date.now() + 5 * DAY + 45 * MINUTE).toISOString(),
    status: 'PENDING',
    notes: 'Running 5 min late, sorry!',
  },
  {
    id: 'demo-b3',
    merchantId: 'demo-m1',
    merchant: { businessName: 'Bloom Hair Studio', logoUrl: null },
    styleId: 'demo-s2',
    style: { id: 'demo-s2', name: 'Balayage', type: 'HAIR', durationMinutes: 120, pointsPerVisit: 60 },
    startTime: new Date(Date.now() - 14 * DAY).toISOString(),
    endTime: new Date(Date.now() - 14 * DAY + 120 * MINUTE).toISOString(),
    status: 'COMPLETED',
    notes: null,
  },
];

let bookingCounter = bookings.length;

const REWARDS = {
  totalPoints: 340,
  merchants: [
    {
      merchantId: 'demo-m1',
      businessName: 'Bloom Hair Studio',
      logoUrl: null,
      points: 200,
      rewards: [
        {
          ruleId: 'demo-r1',
          name: '20% off your next visit',
          triggerType: 'VISIT_COUNT',
          triggerValue: 5,
          progress: 4,
          remaining: 1,
          rewardType: 'PERCENT_OFF',
          rewardValue: 20,
          oneTime: false,
          eligible: false,
        },
        {
          ruleId: 'demo-r2',
          name: 'Free deep-conditioning treatment',
          triggerType: 'POINTS',
          triggerValue: 300,
          progress: 200,
          remaining: 100,
          rewardType: 'FREE_SERVICE',
          rewardValue: 1,
          freeServiceName: 'Deep Conditioning',
          oneTime: true,
          eligible: false,
        },
      ],
      recentVisits: [
        { id: 'demo-v1', styleName: 'Silk Press', styleType: 'HAIR', pointsEarned: 40, visitDate: new Date(Date.now() - 12 * DAY).toISOString(), expired: false },
        { id: 'demo-v2', styleName: 'Balayage', styleType: 'HAIR', pointsEarned: 60, visitDate: new Date(Date.now() - 45 * DAY).toISOString(), expired: false },
        { id: 'demo-v3', styleName: 'Silk Press', styleType: 'HAIR', pointsEarned: 40, visitDate: new Date(Date.now() - 78 * DAY).toISOString(), expired: false },
        { id: 'demo-v4', styleName: 'Trim & Style', styleType: 'HAIR', pointsEarned: 20, visitDate: new Date(Date.now() - 110 * DAY).toISOString(), expired: false },
      ],
    },
    {
      merchantId: 'demo-m2',
      businessName: 'Polished Nail Bar',
      logoUrl: null,
      points: 140,
      rewards: [
        {
          ruleId: 'demo-r3',
          name: 'Free gel manicure',
          triggerType: 'VISIT_COUNT',
          triggerValue: 6,
          progress: 5,
          remaining: 1,
          rewardType: 'FREE_SERVICE',
          rewardValue: 1,
          freeServiceName: 'Classic Manicure',
          oneTime: false,
          // Deliberately redeemable, so the "ready to claim" treatment on the
          // Rewards screen is visible in a demo without waiting for a visit.
          eligible: true,
        },
      ],
      recentVisits: [
        { id: 'demo-v5', styleName: 'French Tip Gel', styleType: 'NAIL', pointsEarned: 35, visitDate: new Date(Date.now() - 20 * DAY).toISOString(), expired: false },
        { id: 'demo-v6', styleName: 'Classic Manicure', styleType: 'NAIL', pointsEarned: 20, visitDate: new Date(Date.now() - 50 * DAY).toISOString(), expired: false },
      ],
    },
  ],
};

/**
 * A believable amount of latency.
 *
 * Not decoration: a demo that resolves synchronously never renders a loading
 * state, so every skeleton and spinner in the app goes unexercised by the
 * exact review R5.1 exists to support. 260 ms is roughly what the deployed API
 * returns in from a phone on wifi.
 */
function latency(value, ms = 260) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function hoursFor(merchantId, date) {
  return HOURS[merchantId]?.[date.getDay()] ?? null;
}

function slotsFor(merchantId, styleId, dateStr) {
  const style = (STYLES[merchantId] ?? []).find((s) => s.id === styleId);
  if (!style) return [];

  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const hours = hoursFor(merchantId, date);
  if (!hours) return [];

  const salon = SALONS.find((s) => s.id === merchantId);
  const seats = salon?.seats ?? 1;
  const [openH, openM] = hours[0].split(':').map(Number);
  const [closeH, closeM] = hours[1].split(':').map(Number);

  const open = new Date(y, m - 1, d, openH, openM).getTime();
  const close = new Date(y, m - 1, d, closeH, closeM).getTime();
  const durationMs = style.durationMinutes * MINUTE;
  const step = 15 * MINUTE;
  const now = Date.now();

  const taken = bookings.filter(
    (b) => b.merchantId === merchantId && (b.status === 'PENDING' || b.status === 'CONFIRMED'),
  );

  const out = [];
  for (let t = Math.max(open, Math.ceil(now / step) * step); t + durationMs <= close; t += step) {
    const start = t;
    const end = t + durationMs;
    const overlapping = taken.filter(
      (b) => start < new Date(b.endTime).getTime() && end > new Date(b.startTime).getTime(),
    ).length;
    if (overlapping < seats) {
      out.push({
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        seatsAvailable: seats - overlapping,
        seatsTotal: seats,
      });
    }
  }
  return out;
}

/**
 * The demo implementation of `GET /merchants/:id/capacity?date=`.
 *
 * Mirrors `AvailabilityService.getCapacity` exactly, including the precedence
 * between the four states — because the point of R3.5's "computed centrally"
 * is that every surface agrees, and a demo that disagreed with the server
 * would teach a reviewer the wrong thing about the feature.
 */
function capacityFor(merchantId, dateStr) {
  const salon = SALONS.find((s) => s.id === merchantId);
  const styles = STYLES[merchantId] ?? [];
  const today = dateKey(new Date());
  const date = dateStr || today;
  const [y, m, d] = date.split('-').map(Number);
  const dayDate = new Date(y, m - 1, d);
  const hours = hoursFor(merchantId, dayDate);
  const openOnDate = Boolean(hours);

  const shortest = [...styles].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  const slots = shortest ? slotsFor(merchantId, shortest.id, date) : [];

  const state = !shortest
    ? 'NOT_BOOKABLE'
    : !openOnDate
      ? 'CLOSED'
      : slots.length === 0
        ? 'FULLY_BOOKED'
        : 'AVAILABLE';

  const isToday = date === today;
  const now = new Date();
  const openNow =
    isToday &&
    openOnDate &&
    now >= new Date(y, m - 1, d, ...hours[0].split(':').map(Number)) &&
    now < new Date(y, m - 1, d, ...hours[1].split(':').map(Number));

  const inUseNow = isToday
    ? bookings.filter(
        (b) =>
          b.merchantId === merchantId &&
          (b.status === 'PENDING' || b.status === 'CONFIRMED') &&
          new Date(b.startTime) <= now &&
          new Date(b.endTime) > now,
      ).length
    : 0;

  const seats = salon?.seats ?? 1;
  return {
    seats,
    inUseNow,
    freeNow: Math.max(0, seats - inUseNow),
    openNow,
    fullyBookedToday: state === 'FULLY_BOOKED',
    nextFreeAt: slots.length ? slots[0].startTime : null,
    date,
    isToday,
    openOnDate,
    spotsLeft: slots.length,
    state,
  };
}

/**
 * The demo backend, keyed the same way `client.js` names its operations.
 *
 * Exposed as one object rather than loose exports so the `if (demoMode)` in
 * the client is a single dispatch and cannot accidentally cover some calls and
 * not others.
 */
export const demoApi = {
  isDemoId: (id) => typeof id === 'string' && id.startsWith('demo-'),

  async login(email) {
    return latency({
      token: 'demo-access-token',
      refreshToken: 'demo-refresh-token',
      expiresIn: 900,
      user: { ...USER, email: email || USER.email },
    });
  },

  async signup({ name, email }) {
    return latency({ id: USER.id, name: name || USER.name, email: email || USER.email });
  },

  async forgotPassword() {
    return latency({ ok: true });
  },

  async profile() {
    return latency(USER, 150);
  },

  async rewards() {
    return latency(REWARDS);
  },

  async salons({ q, city } = {}) {
    let items = SALONS;
    if (city) items = items.filter((s) => (s.city ?? '').toLowerCase() === city.toLowerCase());
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter(
        (s) =>
          s.businessName.toLowerCase().includes(needle) ||
          (s.city ?? '').toLowerCase().includes(needle),
      );
    }
    return latency({ items, total: items.length });
  },

  async styles(merchantId) {
    return latency(STYLES[merchantId] ?? []);
  },

  async capacity(merchantId, date) {
    return latency(capacityFor(merchantId, date), 180);
  },

  async availability(merchantId, styleId, date) {
    return latency(slotsFor(merchantId, styleId, date));
  },

  async createBooking({ merchantId, styleId, startTime, notes }) {
    const salon = SALONS.find((s) => s.id === merchantId);
    const style = (STYLES[merchantId] ?? []).find((s) => s.id === styleId);
    const start = new Date(startTime);
    const booking = {
      id: `demo-b${++bookingCounter}`,
      merchantId,
      merchant: { businessName: salon?.businessName ?? 'Salon', logoUrl: salon?.logoUrl ?? null },
      styleId,
      style: style ?? { name: 'Appointment', durationMinutes: 30 },
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + (style?.durationMinutes ?? 30) * MINUTE).toISOString(),
      status: 'PENDING',
      notes: notes ?? null,
    };
    bookings = [booking, ...bookings];
    return latency(booking);
  },

  async myBookings() {
    const sorted = [...bookings].sort(
      (a, b) => new Date(b.startTime) - new Date(a.startTime),
    );
    return latency({ items: sorted, total: sorted.length });
  },

  async cancelBooking(bookingId) {
    bookings = bookings.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELLED' } : b));
    return latency(bookings.find((b) => b.id === bookingId));
  },

  async registerDevice() {
    return latency({ ok: true }, 60);
  },

  async unregisterDevice() {
    return latency({ ok: true }, 60);
  },
};
