/**
 * The offline demo backend  (R5.1)
 *
 * *"The app must be usable for evaluation and demonstration purposes without
 * requiring a live backend connection."*
 *
 * A demo mode is only worth anything if it behaves like the real thing, so
 * these tests check the two properties that make it so:
 *
 *  1. **Every field the real API returns is present, spelled the same.** A
 *     screen that works in demo mode and crashes against the live API has
 *     proved nothing.
 *  2. **State really mutates.** Booking adds a row that My Bookings shows;
 *     cancelling changes its status; the slot you took disappears from
 *     availability. A demo that resets on every read cannot demonstrate
 *     R3.4 or R4.3 at all.
 */
import { demoApi } from '../src/api/demo';

describe('the demo dataset mirrors the real API’s shapes', () => {
  it('returns salons with every field the directory card reads', async () => {
    const { items, total } = await demoApi.salons();
    expect(items.length).toBeGreaterThan(0);
    expect(total).toBe(items.length);

    for (const salon of items) {
      // The exact set `SalonCard`, `SalonLogo` and `utils/distance` consume.
      expect(salon).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          businessName: expect.any(String),
          seats: expect.any(Number),
          styleCount: expect.any(Number),
          styleTypes: expect.any(Array),
        }),
      );
      expect(salon).toHaveProperty('logoUrl');
      expect(salon).toHaveProperty('city');
      expect(salon).toHaveProperty('latitude');
      expect(salon).toHaveProperty('longitude');
    }
  });

  it('includes a salon with NO coordinates, so R3.9 is exercisable', async () => {
    // The spec's dependency note requires the app to handle a salon that has
    // not registered a location. A demo where every salon has one would never
    // show that path to a reviewer.
    const { items } = await demoApi.salons();
    expect(items.some((s) => s.latitude == null && s.longitude == null)).toBe(true);
    expect(items.some((s) => s.latitude != null)).toBe(true);
  });

  it('returns rewards in the exact shape GET /me/rewards produces', async () => {
    const rewards = await demoApi.rewards();
    expect(rewards.totalPoints).toBe(
      rewards.merchants.reduce((sum, m) => sum + m.points, 0),
    );

    for (const block of rewards.merchants) {
      expect(block).toEqual(
        expect.objectContaining({
          merchantId: expect.any(String),
          businessName: expect.any(String),
          points: expect.any(Number),
          rewards: expect.any(Array),
          recentVisits: expect.any(Array),
        }),
      );
      for (const reward of block.rewards) {
        expect(reward).toEqual(
          expect.objectContaining({
            ruleId: expect.any(String),
            name: expect.any(String),
            triggerType: expect.any(String),
            triggerValue: expect.any(Number),
            progress: expect.any(Number),
            remaining: expect.any(Number),
            rewardType: expect.any(String),
            eligible: expect.any(Boolean),
          }),
        );
      }
      for (const visit of block.recentVisits) {
        expect(visit).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            styleName: expect.any(String),
            styleType: expect.any(String),
            pointsEarned: expect.any(Number),
            visitDate: expect.any(String),
          }),
        );
      }
    }
  });

  it('has at least one claimable reward, so that treatment is visible in a demo', async () => {
    const rewards = await demoApi.rewards();
    const anyEligible = rewards.merchants.some((m) => m.rewards.some((r) => r.eligible));
    expect(anyEligible).toBe(true);
  });
});

describe('capacity mirrors the server’s state machine  (R3.5)', () => {
  it('answers with every field AvailabilityPill and the filters read', async () => {
    const cap = await demoApi.capacity('demo-m1');
    expect(cap).toEqual(
      expect.objectContaining({
        state: expect.stringMatching(/^(AVAILABLE|FULLY_BOOKED|CLOSED|NOT_BOOKABLE)$/),
        spotsLeft: expect.any(Number),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        isToday: expect.any(Boolean),
        openOnDate: expect.any(Boolean),
        seats: expect.any(Number),
      }),
    );
  });

  it('reports CLOSED on a day the salon does not trade, and never "fully booked"', async () => {
    // Stillwater Spa is shut on Mondays in the demo data. 2026-09-07 is a
    // Monday. "Fully booked" would tell a customer to try elsewhere today when
    // the truth is that this salon does not open at all.
    const cap = await demoApi.capacity('demo-m3', '2026-09-07');
    expect(cap.state).toBe('CLOSED');
    expect(cap.openOnDate).toBe(false);
    expect(cap.fullyBookedToday).toBe(false);
    expect(cap.spotsLeft).toBe(0);
  });

  it('answers for the date it was asked about', async () => {
    const cap = await demoApi.capacity('demo-m1', '2026-09-09');
    expect(cap.date).toBe('2026-09-09');
    expect(cap.isToday).toBe(false);
    // "Open right now" is a question about today only.
    expect(cap.openNow).toBe(false);
    expect(cap.inUseNow).toBe(0);
  });
});

describe('booking really mutates state  (R3.4, R4.1, R4.3)', () => {
  it('adds the new booking to My Bookings, as PENDING', async () => {
    const before = await demoApi.myBookings();

    const slots = await demoApi.availability('demo-m1', 'demo-s3', '2026-12-15');
    expect(slots.length).toBeGreaterThan(0);

    const created = await demoApi.createBooking({
      merchantId: 'demo-m1',
      styleId: 'demo-s3',
      startTime: slots[0].startTime,
      notes: 'from a test',
    });

    expect(created.status).toBe('PENDING');
    expect(created.merchant.businessName).toBe('Bloom Hair Studio');
    expect(created.endTime).toBeTruthy();

    const after = await demoApi.myBookings();
    expect(after.items).toHaveLength(before.items.length + 1);
    expect(after.items.some((b) => b.id === created.id)).toBe(true);
  });

  it('cancelling changes the status, and does not remove the row', async () => {
    // R4.3, and R4.1's "past bookings": a cancelled appointment stays in the
    // list with its status, it does not vanish.
    const { items } = await demoApi.myBookings();
    const target = items.find((b) => b.status === 'PENDING' || b.status === 'CONFIRMED');
    expect(target).toBeDefined();

    await demoApi.cancelBooking(target.id);

    const after = await demoApi.myBookings();
    expect(after.items).toHaveLength(items.length);
    expect(after.items.find((b) => b.id === target.id).status).toBe('CANCELLED');
  });

  it('never offers a slot in the past', async () => {
    // The real availability route refuses these, so a demo that offered them
    // would teach a reviewer the wrong thing about the booking flow.
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    const slots = await demoApi.availability('demo-m1', 'demo-s3', key);
    for (const slot of slots) {
      expect(new Date(slot.startTime).getTime()).toBeGreaterThanOrEqual(Date.now() - 60_000);
    }
  });

  it('returns no slots at all on a closed day', async () => {
    expect(await demoApi.availability('demo-m3', 'demo-s6', '2026-09-07')).toEqual([]);
  });

  it('reports seats on every slot, like the capacity-aware real route does', async () => {
    const slots = await demoApi.availability('demo-m1', 'demo-s3', '2026-12-16');
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.seatsTotal).toBeGreaterThanOrEqual(1);
      expect(slot.seatsAvailable).toBeGreaterThan(0);
      expect(slot.seatsAvailable).toBeLessThanOrEqual(slot.seatsTotal);
    }
  });
});

describe('search and filter behave like the server’s  (R3.10)', () => {
  it('matches the salon name, case-insensitively', async () => {
    const { items } = await demoApi.salons({ q: 'bloom' });
    expect(items).toHaveLength(1);
    expect(items[0].businessName).toBe('Bloom Hair Studio');
  });

  it('matches the CITY too, from the same box', async () => {
    // The backend's `?q=` is an OR over name and city; a demo that only
    // searched names would misrepresent the feature.
    const { items } = await demoApi.salons({ q: 'hamilton' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((s) => (s.city ?? '').toLowerCase().includes('hamilton'))).toBe(true);
  });

  it('filters by an exact city', async () => {
    const { items } = await demoApi.salons({ city: 'Toronto' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((s) => s.city === 'Toronto')).toBe(true);
  });

  it('returns an empty list rather than everything for a search that matches nothing', async () => {
    const { items } = await demoApi.salons({ q: 'zzzzzz' });
    expect(items).toEqual([]);
  });
});

describe('auth in demo mode  (R5.1)', () => {
  it('issues a session pair, so the app’s refresh path is exercised', async () => {
    const session = await demoApi.login('someone@example.com');
    expect(session.token).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user.emailVerified).toBe(true);
  });

  it('signs in whatever email was typed, so a demo needs no seeded account', async () => {
    const session = await demoApi.login('reviewer@example.com');
    expect(session.user.email).toBe('reviewer@example.com');
  });
});
