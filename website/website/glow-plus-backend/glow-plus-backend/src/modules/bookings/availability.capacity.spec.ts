/**
 * Tests for seat capacity  (T83)
 *
 * Availability treated every salon as a SINGLE resource — one appointment at a
 * time, however many chairs it had. The limitation was documented in
 * availability.service.ts and its effect was that a four-chair salon read as
 * fully booked the moment ONE client booked.
 *
 * Two things are worth pinning here, and they are the two that would quietly
 * break money:
 *
 *  - `seats` defaults to 1, which must reproduce the OLD behaviour exactly. A
 *    regression that made the default 2 would start double-booking every
 *    one-person salon on the platform.
 *  - the read path (the slot grid) and the write path (`isSlotStillAvailable`)
 *    must agree. If they drift, the grid offers a seat the POST then refuses —
 *    [F64] arriving from the other direction.
 */
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../../prisma/prisma.service';

const MERCHANT = 'm_1';
const STYLE = 's_1';

/** A Monday the salon opens 09:00–17:00, far enough ahead to never be "past". */
const DATE = '2099-01-05';

function at(hhmm: string) {
  // The service resolves wall time in the salon's zone; for overlap arithmetic
  // the tests only need instants that are consistent with each other.
  return new Date(`${DATE}T${hhmm}:00.000Z`);
}

function makeService(opts: { seats: number; bookings?: { startTime: Date; endTime: Date }[] }) {
  const bookings = opts.bookings ?? [];
  const prisma = {
    merchant: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        subscription: { status: 'ACTIVE' },
        seats: opts.seats,
      }),
    },
    style: {
      findUnique: jest.fn().mockResolvedValue({
        id: STYLE,
        merchantId: MERCHANT,
        active: true,
        durationMinutes: 60,
      }),
      findFirst: jest.fn().mockResolvedValue({ id: STYLE }),
    },
    businessHours: {
      findUnique: jest.fn().mockResolvedValue({ closed: false, openTime: '09:00', closeTime: '17:00' }),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue(bookings),
      count: jest.fn().mockImplementation(({ where }: any) => {
        const start = where.startTime?.lt ?? where.startTime?.lte;
        const end = where.endTime?.gt;
        return Promise.resolve(
          bookings.filter((b) => b.startTime < start && b.endTime > end).length,
        );
      }),
    },
  };
  return new AvailabilityService(prisma as unknown as PrismaService);
}

describe('AvailabilityService — seat capacity (T83)', () => {
  describe('the slot grid', () => {
    /**
     * Slot instants are derived from the service, never hand-written.
     *
     * Wall time is resolved in the SALON's timezone (common/salon-time.ts), so
     * a literal `10:00Z` in a test is 05:00 in Toronto — outside opening hours,
     * matching no slot, and quietly making an assertion pass for the wrong
     * reason. Asking the generator for a real slot and booking exactly that is
     * both timezone-proof and the same argument `assertBookable` makes about
     * not keeping a second copy of the rule.
     */
    async function aRealSlot() {
      const [slot] = await makeService({ seats: 1 }).getAvailableSlots(MERCHANT, STYLE, DATE);
      expect(slot).toBeDefined();
      return { start: new Date(slot.startTime), end: new Date(slot.endTime), iso: slot.startTime };
    }

    it('with seats = 1, one booking still blocks the slot — the pre-T83 behaviour, unchanged', async () => {
      const slot = await aRealSlot();
      const service = makeService({
        seats: 1,
        bookings: [{ startTime: slot.start, endTime: slot.end }],
      });
      const slots = await service.getAvailableSlots(MERCHANT, STYLE, DATE);
      expect(slots.some((s) => s.startTime === slot.iso)).toBe(false);
    });

    it('with seats = 3, one booking leaves the slot open with 2 seats left', async () => {
      const slot = await aRealSlot();
      const service = makeService({
        seats: 3,
        bookings: [{ startTime: slot.start, endTime: slot.end }],
      });
      const slots = await service.getAvailableSlots(MERCHANT, STYLE, DATE);
      const found = slots.find((s) => s.startTime === slot.iso);
      expect(found).toBeDefined();
      expect(found!.seatsAvailable).toBe(2);
      expect(found!.seatsTotal).toBe(3);
    });

    it('with seats = 3, three overlapping bookings close the slot', async () => {
      const slot = await aRealSlot();
      const booking = { startTime: slot.start, endTime: slot.end };
      const service = makeService({ seats: 3, bookings: [booking, booking, booking] });
      const slots = await service.getAvailableSlots(MERCHANT, STYLE, DATE);
      // Proven not to be a vacuous assertion: the same slot IS offered at 4 seats.
      expect(slots.some((s) => s.startTime === slot.iso)).toBe(false);
      const roomier = await makeService({ seats: 4, bookings: [booking, booking, booking] })
        .getAvailableSlots(MERCHANT, STYLE, DATE);
      expect(roomier.some((s) => s.startTime === slot.iso)).toBe(true);
    });

    it('reports full seats on an untouched day', async () => {
      const service = makeService({ seats: 4 });
      const slots = await service.getAvailableSlots(MERCHANT, STYLE, DATE);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => s.seatsAvailable === 4 && s.seatsTotal === 4)).toBe(true);
    });

    it('keeps startTime and endTime, so the Order 2 app is unaffected', async () => {
      const service = makeService({ seats: 2 });
      const [first] = await service.getAvailableSlots(MERCHANT, STYLE, DATE);
      expect(typeof first.startTime).toBe('string');
      expect(typeof first.endTime).toBe('string');
    });
  });

  describe('isSlotStillAvailable — must agree with the grid', () => {
    it('refuses a second booking when seats = 1', async () => {
      const service = makeService({
        seats: 1,
        bookings: [{ startTime: at('10:00'), endTime: at('11:00') }],
      });
      await expect(service.isSlotStillAvailable(MERCHANT, at('10:00'), at('11:00'))).resolves.toBe(false);
    });

    it('ALLOWS a second booking when seats = 2 — the grid offered it, so the POST must accept it', async () => {
      const service = makeService({
        seats: 2,
        bookings: [{ startTime: at('10:00'), endTime: at('11:00') }],
      });
      await expect(service.isSlotStillAvailable(MERCHANT, at('10:00'), at('11:00'))).resolves.toBe(true);
    });

    it('refuses the seat past capacity', async () => {
      const service = makeService({
        seats: 2,
        bookings: [
          { startTime: at('10:00'), endTime: at('11:00') },
          { startTime: at('10:00'), endTime: at('11:00') },
        ],
      });
      await expect(service.isSlotStillAvailable(MERCHANT, at('10:00'), at('11:00'))).resolves.toBe(false);
    });
  });

  describe('getCapacity', () => {
    it('reports the salon as fully booked when nothing is left for the shortest service', async () => {
      const service = makeService({ seats: 1 });
      jest.spyOn(service, 'getAvailableSlots').mockResolvedValue([]);
      const cap = await service.getCapacity(MERCHANT);
      expect(cap.fullyBookedToday).toBe(true);
      expect(cap.nextFreeAt).toBeNull();
    });

    it('is NOT "fully booked" when there is a free slot, and reports when it is', async () => {
      const service = makeService({ seats: 2 });
      jest
        .spyOn(service, 'getAvailableSlots')
        .mockResolvedValue([
          { startTime: at('14:00').toISOString(), endTime: at('15:00').toISOString(), seatsAvailable: 1, seatsTotal: 2 },
        ]);
      const cap = await service.getCapacity(MERCHANT);
      expect(cap.fullyBookedToday).toBe(false);
      expect(cap.nextFreeAt).toBe(at('14:00').toISOString());
      expect(cap.seats).toBe(2);
    });

    it('a salon with NO active services is not "fully booked" — it has nothing to book', async () => {
      const service = makeService({ seats: 2 });
      (service as any).prisma.style.findFirst.mockResolvedValue(null);
      const cap = await service.getCapacity(MERCHANT);
      expect(cap.fullyBookedToday).toBe(false);
    });

    it('never reports more free seats than the salon has', async () => {
      const service = makeService({ seats: 2 });
      jest.spyOn(service, 'getAvailableSlots').mockResolvedValue([]);
      const cap = await service.getCapacity(MERCHANT);
      expect(cap.freeNow).toBeLessThanOrEqual(cap.seats);
      expect(cap.freeNow).toBeGreaterThanOrEqual(0);
    });
  });
});
