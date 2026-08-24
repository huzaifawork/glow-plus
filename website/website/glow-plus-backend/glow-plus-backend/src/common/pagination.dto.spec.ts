/**
 * Tests for the shared pagination contract  (T50)
 *
 * What matters here is not that `limit` is a number — it is that **every list
 * route in the API answers the same shape**, because that shape is a contract
 * with two clients we cannot change from this side. A route that quietly
 * wrapped its body in `{ items, total }` would break `client.js` on the day
 * Order 2 ships, and it would do so while passing its own service tests.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DEFAULT_PAGE_SIZE, PaginationQueryDto } from './pagination.dto';
import { MerchantBookingsQueryDto } from '../modules/bookings/dto';

const check = (Dto: any, query: Record<string, unknown>) =>
  validateSync(plainToInstance(Dto, query, { enableImplicitConversion: false }), {
    whitelist: true,
  });

describe('PaginationQueryDto (T50)', () => {
  it('accepts an absent query — every route stays callable with no params', () => {
    expect(check(PaginationQueryDto, {})).toHaveLength(0);
  });

  it('coerces the numeric strings a query string actually delivers', () => {
    // `@Type(() => Number)` is load-bearing: without it `@IsInt()` is handed
    // '10' and refuses every request that uses the parameter at all.
    const dto = plainToInstance(PaginationQueryDto, { limit: '10', offset: '20' });

    expect(dto.limit).toBe(10);
    expect(dto.offset).toBe(20);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it.each([
    ['limit=abc', { limit: 'abc' }],
    ['limit=0', { limit: '0' }],
    ['limit above the ceiling', { limit: '201' }],
    ['offset=-1', { offset: '-1' }],
    ['a fractional limit', { limit: '1.5' }],
  ])('refuses %s', (_label, query) => {
    expect(check(PaginationQueryDto, query).length).toBeGreaterThan(0);
  });

  it('has a default page larger than anything the website renders', () => {
    // The point of T50 is the contract, not a UI feature — no view should need
    // a paginator it did not have yesterday.
    expect(DEFAULT_PAGE_SIZE).toBe(100);
  });
});

describe('MerchantBookingsQueryDto (T50) — the date filter is validated now', () => {
  it('paginates like every other list', () => {
    const dto = plainToInstance(MerchantBookingsQueryDto, { limit: '5' });

    expect(dto.limit).toBe(5);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts an ISO date window', () => {
    expect(check(MerchantBookingsQueryDto, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    })).toHaveLength(0);
  });

  it.each(['banana', '2026-13-45', ''])('refuses from=%s', (from) => {
    // These were loose `@Query('from')` params, which ValidationPipe does not
    // look at [F38]. `new Date('banana')` is an Invalid Date, and Prisma was
    // handed it — a 500 from the driver where a 400 belongs.
    expect(check(MerchantBookingsQueryDto, { from }).length).toBeGreaterThan(0);
  });
});

/**
 * The contract itself, asserted on the controllers.
 *
 * A per-route test can pass while two routes disagree, and disagreement is the
 * failure mode that reaches the clients. So this reads the source: every
 * paginated handler must set `X-Total-Count` and return the bare `items`.
 */
describe('every paginated list route answers the same shape (T50)', () => {
  const read = (rel: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync(require('path').join(__dirname, '..', rel), 'utf8');

  it.each([
    ['visits', 'modules/visits/visits.controller.ts', 2],
    ['bookings', 'modules/bookings/bookings.controller.ts', 2],
  ])('%s sets X-Total-Count on each of its %i list routes', (_label, file, count) => {
    const src = read(file);

    expect(src.match(/setHeader\('X-Total-Count'/g)).toHaveLength(count);
    expect(src.match(/return items;/g)).toHaveLength(count);
  });

  it.each([
    ['visits', 'modules/visits/visits.controller.ts'],
    ['bookings', 'modules/bookings/bookings.controller.ts'],
  ])('%s never returns an { items, total } envelope to the client', (_label, file) => {
    const src = read(file);

    // `client.js` maps these responses directly. The envelope stays inside the
    // service; the controller unwraps it.
    expect(src).not.toMatch(/return\s*\{\s*items\s*,\s*total\s*\}/);
  });

  it.each([
    ['visits', 'modules/visits/visits.controller.ts'],
    ['bookings', 'modules/bookings/bookings.controller.ts'],
  ])('%s does not set Access-Control-Expose-Headers per route [F46]', (_label, file) => {
    // It REPLACES rather than appends, and would take all nine rate-limit
    // headers down with it. The exposure lives once in config/security.ts.
    // Matched on the CALL, not the name — the doc comment beside each handler
    // mentions the header precisely in order to warn the next reader off it.
    expect(read(file)).not.toMatch(/setHeader\(\s*'Access-Control-Expose-Headers'/);
  });
});
