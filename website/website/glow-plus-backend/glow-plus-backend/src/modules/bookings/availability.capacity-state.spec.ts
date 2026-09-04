/**
 * Tests for the salon availability indicator  (M1 — mobile spec R3.5)
 *
 * R3.5 detail is unusually prescriptive, and these tests exist because of one
 * sentence in it:
 *
 *   *"This must be computed centrally (by the same logic used everywhere else
 *   in the platform) rather than calculated independently inside the app, so
 *   the app and any other Glow+ surface never disagree about whether a salon
 *   is full."*
 *
 * So the four states are a SERVER enum, and what is pinned here is the
 * **precedence between them** — which is the part a client would get subtly
 * different if it derived the label itself from `openNow`/`fullyBookedToday`.
 *
 * The other half of R3.5 is that the answer "must update whenever the user
 * changes the selected date", so `getCapacity` takes one. The date defaulting
 * to today is what keeps every pre-M1 caller (the website's salon cards)
 * behaving exactly as it did.
 */
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../../prisma/prisma.service';
import { salonDateFor } from '../../common/salon-time';

const MERCHANT = 'm_1';
const STYLE = 's_1';

/** Far enough ahead that no slot is ever "in the past". */
const FUTURE = '2099-01-05';

type Options = {
  open?: boolean;
  hasStyles?: boolean;
  slots?: number;
};

function makeService({ open = true, hasStyles = true, slots = 3 }: Options = {}) {
  const prisma = {
    merchant: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        subscription: { status: 'ACTIVE' },
        seats: 2,
      }),
    },
    style: {
      findFirst: jest.fn().mockResolvedValue(hasStyles ? { id: STYLE } : null),
      findUnique: jest.fn().mockResolvedValue({
        id: STYLE,
        merchantId: MERCHANT,
        active: true,
        durationMinutes: 30,
      }),
    },
    businessHours: {
      findUnique: jest
        .fn()
        .mockResolvedValue(open ? { closed: false, openTime: '09:00', closeTime: '17:00' } : { closed: true }),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  const service = new AvailabilityService(prisma as unknown as PrismaService);

  // The slot grid has its own tests (availability.capacity.spec.ts). What is
  // under test here is the state machine ON TOP of it, so the grid is stubbed
  // to a known length rather than reconstructed.
  jest.spyOn(service, 'getAvailableSlots').mockResolvedValue(
    Array.from({ length: slots }, (_, i) => ({
      startTime: `${FUTURE}T${String(9 + i).padStart(2, '0')}:00:00.000Z`,
      endTime: `${FUTURE}T${String(9 + i).padStart(2, '0')}:30:00.000Z`,
      seatsAvailable: 1,
      seatsTotal: 2,
    })),
  );

  return service;
}

describe('getCapacity — the four states R3.5 names', () => {
  it('AVAILABLE, with the count that fills in "N spots left today"', async () => {
    const cap = await makeService({ slots: 4 }).getCapacity(MERCHANT, FUTURE);
    expect(cap.state).toBe('AVAILABLE');
    expect(cap.spotsLeft).toBe(4);
    expect(cap.fullyBookedToday).toBe(false);
  });

  it('FULLY_BOOKED when the salon is open and nothing is left', async () => {
    const cap = await makeService({ slots: 0 }).getCapacity(MERCHANT, FUTURE);
    expect(cap.state).toBe('FULLY_BOOKED');
    expect(cap.spotsLeft).toBe(0);
    expect(cap.nextFreeAt).toBeNull();
  });

  it('CLOSED beats FULLY_BOOKED — a closed salon is not booked out', async () => {
    // The distinction the acceptance criteria call out by name. "Fully booked"
    // tells a customer to try another salon today; "closed" tells them to come
    // back tomorrow. A closed salon also has zero slots, so without the
    // precedence being decided HERE, every client would have to get this right
    // independently — and one of them would not.
    const cap = await makeService({ open: false, slots: 0 }).getCapacity(MERCHANT, FUTURE);
    expect(cap.state).toBe('CLOSED');
    expect(cap.fullyBookedToday).toBe(false);
    expect(cap.openOnDate).toBe(false);
  });

  it('NOT_BOOKABLE beats everything — a salon with no menu is not closed, it is not ready', async () => {
    const cap = await makeService({ hasStyles: false, slots: 0 }).getCapacity(MERCHANT, FUTURE);
    expect(cap.state).toBe('NOT_BOOKABLE');
    expect(cap.fullyBookedToday).toBe(false);
  });

  it('NOT_BOOKABLE still wins when the salon is also closed', async () => {
    // Pinning the ORDER of the two "nothing to show" cases, because they are
    // the pair most likely to be reordered by someone tidying the ternary.
    const cap = await makeService({ hasStyles: false, open: false }).getCapacity(MERCHANT, FUTURE);
    expect(cap.state).toBe('NOT_BOOKABLE');
  });
});

describe('getCapacity — the selected date (R3.5, "must update whenever the user changes it")', () => {
  it('answers for the date it was given, and says which one', async () => {
    const cap = await makeService().getCapacity(MERCHANT, FUTURE);
    expect(cap.date).toBe(FUTURE);
    expect(cap.isToday).toBe(false);
  });

  it('defaults to today, so every pre-M1 caller is unchanged', async () => {
    const cap = await makeService().getCapacity(MERCHANT);
    expect(cap.date).toBe(salonDateFor(new Date()));
    expect(cap.isToday).toBe(true);
  });

  it('never reports "open now" or busy chairs for a date that is not today', async () => {
    // Both are questions about the current instant. Carrying today's answer
    // onto next Tuesday would read as a forecast the platform is not making —
    // and "3 seats free" over a future date is exactly the sentence that would
    // send someone to a salon expecting to walk in.
    const service = makeService();
    const cap = await service.getCapacity(MERCHANT, FUTURE);
    expect(cap.openNow).toBe(false);
    expect(cap.inUseNow).toBe(0);
    expect((service as any).prisma.booking.count).not.toHaveBeenCalled();
  });

  it('refuses a date that is not a real day, rather than reaching the date maths', async () => {
    // `salonWallTimeToInstant` does `dateISO.split('-').map(Number)`; a
    // calendar-shaped non-date reaching it is a 500 for what is plainly a 400.
    await expect(makeService().getCapacity(MERCHANT, '2026-02-31')).rejects.toThrow(
      /YYYY-MM-DD/,
    );
  });

  it('never reports more free seats than the salon has', async () => {
    const cap = await makeService({ slots: 0 }).getCapacity(MERCHANT);
    expect(cap.freeNow).toBeLessThanOrEqual(cap.seats);
    expect(cap.freeNow).toBeGreaterThanOrEqual(0);
  });
});
