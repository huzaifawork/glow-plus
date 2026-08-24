/**
 * Input-validation tests  (T31)
 *
 * These run the REAL global ValidationPipe over the REAL DTO classes, the
 * same way `security.spec.ts` runs real helmet and asserts on emitted
 * headers: what matters is what the pipe does to a payload, not that the
 * decorators are present in the source.
 *
 * The cases are the ones reproduced live against the running API before the
 * fix, so a regression fails here rather than silently reopening the hole.
 */
import { ValidationPipe, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { MerchantSignupDto } from '../modules/merchants/signup.dto';
import { SignupDto, LoginDto } from '../modules/auth/dto';
import { AvailabilityQueryDto, CreateBookingDto } from '../modules/bookings/dto';
import { AdminMerchantsQueryDto, MERCHANT_STATUSES } from '../modules/admin/merchants-query.dto';
import { MAX_NAME, MAX_NOTES, MAX_PASSWORD } from './limits';

// Must match main.ts exactly, or this tests a pipe the app does not use.
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const meta = (metatype: new (...args: never[]) => unknown): ArgumentMetadata => ({
  type: 'body',
  metatype,
  data: '',
});

const run = (dto: new (...args: never[]) => unknown, value: unknown) =>
  pipe.transform(value, meta(dto));

/**
 * ValidationPipe throws a BadRequestException whose `.message` is just
 * "Bad Request Exception" — the per-field messages live in `getResponse()`,
 * which is also where the API's error filter reads them from. So assert
 * against that, not against `.message`.
 */
const expectRejected = async (dto: new (...args: never[]) => unknown, value: unknown, matching?: RegExp) => {
  await expect(run(dto, value)).rejects.toBeInstanceOf(BadRequestException);

  if (!matching) return;

  const err = await run(dto, value).catch((e: BadRequestException) => e);
  const body = (err as BadRequestException).getResponse() as { message?: unknown };
  const messages = Array.isArray(body.message) ? body.message.map(String) : [String(body.message)];

  expect(messages.join(' | ')).toMatch(matching);
};

describe('MerchantSignupDto (T31)', () => {
  const valid = { businessName: 'Glow Salon', email: 'salon@example.com', password: 'Password123!' };

  it('accepts a well-formed signup', async () => {
    await expect(run(MerchantSignupDto, valid)).resolves.toMatchObject(valid);
  });

  /**
   * The route bound `MerchantSignupInput` — an INTERFACE, erased at runtime —
   * so ValidationPipe had no metatype and validated nothing. This exact
   * payload created a merchant account in Postgres whose empty password
   * satisfied `bcrypt.compare('', hash)`.
   */
  it('refuses an empty password (created a real account before T31)', async () => {
    await expectRejected(MerchantSignupDto, { ...valid, password: '' }, /password/i);
  });

  it('refuses a password shorter than the consumer rule', async () => {
    await expectRejected(MerchantSignupDto, { ...valid, password: 'short' }, /password/i);
  });

  it('refuses an address that is not an email (reached Stripe before T31)', async () => {
    await expectRejected(MerchantSignupDto, { ...valid, email: 'definitely-not-an-email' }, /email/i);
  });

  it('refuses a missing businessName (was a bare 500 from Prisma)', async () => {
    await expectRejected(MerchantSignupDto, { businessName: undefined, email: valid.email, password: valid.password });
  });

  it('refuses non-string credentials (bcrypt threw "Illegal arguments")', async () => {
    await expectRejected(MerchantSignupDto, { businessName: 12345, email: valid.email, password: 99999 });
  });

  it('strips unknown fields instead of passing them through', async () => {
    const out = (await run(MerchantSignupDto, {
      ...valid,
      status: 'ACTIVE',
      foundingMember: true,
      id: 'attacker-chosen-id',
    })) as Record<string, unknown>;

    expect(out).toEqual(valid);
    expect(out.status).toBeUndefined();
    expect(out.id).toBeUndefined();
  });
});

describe('length limits (T31)', () => {
  it('refuses a 100,000-character name — it was written to Postgres before', async () => {
    await expectRejected(
      SignupDto,
      { email: 'a@example.com', password: 'Password123!', name: 'A'.repeat(100_000) },
      /name/i,
    );
  });

  it(`accepts a name at exactly the ${MAX_NAME}-character limit`, async () => {
    await expect(
      run(SignupDto, { email: 'a@example.com', password: 'Password123!', name: 'A'.repeat(MAX_NAME) }),
    ).resolves.toBeDefined();
  });

  it('refuses booking notes over the limit', async () => {
    await expectRejected(
      CreateBookingDto,
      { merchantId: 'm1', styleId: 's1', startTime: '2026-09-01T10:00:00.000Z', notes: 'A'.repeat(MAX_NOTES + 1) },
      /notes/i,
    );
  });

  it('bounds password length on login (bcrypt ignores past 72 bytes anyway)', async () => {
    await expectRejected(LoginDto, { email: 'a@example.com', password: 'A'.repeat(MAX_PASSWORD + 1) }, /password/i);
  });

  it('does NOT impose a minimum password length on login', async () => {
    // A login must not disclose the password policy, and a short guess
    // should cost an ordinary 401 rather than a 400 explaining the rule.
    await expect(run(LoginDto, { email: 'a@example.com', password: 'x' })).resolves.toBeDefined();
  });
});

describe('AvailabilityQueryDto (T31)', () => {
  const valid = { merchantId: 'm_1', styleId: 's_1', date: '2026-09-01' };

  it('accepts a well-formed query', async () => {
    await expect(run(AvailabilityQueryDto, valid)).resolves.toMatchObject(valid);
  });

  /**
   * This class existed all along and the controller never used it — it bound
   * three loose `@Query('x') x: string` params instead. A missing id reached
   * `findUnique({ where: { id: undefined } })` and came back a bare 500.
   */
  it.each(['merchantId', 'styleId', 'date'])('refuses a missing %s (was a 500)', async (field) => {
    const payload: Record<string, unknown> = { ...valid };
    delete payload[field];
    await expectRejected(AvailabilityQueryDto, payload, new RegExp(field, 'i'));
  });

  it.each(['merchantId', 'styleId'])('refuses an empty %s', async (field) => {
    await expectRejected(AvailabilityQueryDto, { ...valid, [field]: '' }, new RegExp(field, 'i'));
  });

  it.each(['NOT-A-DATE', '2026/09/01', '01-09-2026', '2026-9-1'])(
    'refuses a date that is not YYYY-MM-DD (%s)',
    async (date) => {
      await expectRejected(AvailabilityQueryDto, { ...valid, date }, /date/i);
    },
  );
});

/**
 * `GET /admin/merchants?status=` (T38)
 *
 * The interesting case is the one this DTO exists to prevent: an unknown
 * status string reaching Prisma's enum filter, which is a
 * PrismaClientValidationError and therefore a bare **500** for what is
 * plainly a bad request — [F38]'s shape. The absent case is deliberately
 * allowed: for an admin, "no filter" means "the whole platform".
 */
describe('AdminMerchantsQueryDto (T38)', () => {
  it.each(MERCHANT_STATUSES)('accepts the real status %s', async (status) => {
    await expect(run(AdminMerchantsQueryDto, { status })).resolves.toMatchObject({ status });
  });

  it('accepts an absent status — an admin may ask for every merchant', async () => {
    await expect(run(AdminMerchantsQueryDto, {})).resolves.toEqual({});
  });

  it('refuses an unknown status (would have been a 500 from Prisma)', async () => {
    await expectRejected(AdminMerchantsQueryDto, { status: 'BOGUS' }, /status/i);
  });

  it('refuses a lowercase status — the enum is case-sensitive in Postgres', async () => {
    await expectRejected(AdminMerchantsQueryDto, { status: 'active' }, /status/i);
  });

  it('refuses an empty status rather than treating it as absent', async () => {
    await expectRejected(AdminMerchantsQueryDto, { status: '' }, /status/i);
  });

  /** whitelist:true must strip anything else, so a stray param cannot ride
   *  along into a future `where` clause. */
  it('strips unknown query params', async () => {
    await expect(run(AdminMerchantsQueryDto, { status: 'ACTIVE', merchantId: 'x' })).resolves.toEqual({
      status: 'ACTIVE',
    });
  });
});
