/**
 * Tests for the global error envelope  (T16)
 *
 * The contract under test is narrow but load-bearing: for EVERY failure,
 * `statusCode` is a number, `message` is a string, and `error` is present.
 * Both halves of that were false before this filter — validation returned
 * `message` as an array, and any non-HttpException returned no `error` key
 * at all.
 *
 * The Prisma mappings below were each reproduced against the real database
 * before being written down: P2002 by racing four concurrent signups through
 * the check-then-create in auth.service.ts, and P1001 by stopping the
 * Postgres container.
 */
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status: number;
  body: { statusCode: number; message: unknown; error: unknown; details?: unknown };
}

function run(exception: unknown, url = '/test'): Captured {
  const captured = { status: 0, body: undefined as unknown } as { status: number; body: unknown };
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(payload: unknown) { captured.body = payload; return res; },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', originalUrl: url }),
    }),
  };

  new AllExceptionsFilter().catch(exception, host as never);
  return captured as Captured;
}

function prismaError(code: string, meta?: unknown) {
  return Object.assign(new Error(`Prisma failed with ${code}`), { code, meta, clientVersion: '5.19.0' });
}

describe('AllExceptionsFilter', () => {
  // The filter logs every exception by design; silence it so a passing run
  // isn't buried in expected stack traces.
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  describe('the envelope holds for every kind of failure', () => {
    const cases: Array<[string, unknown, number]> = [
      ['HttpException subclass', new UnauthorizedException('Missing bearer token'), 401],
      ['HttpException with a string body', new HttpException('Too many requests', 429), 429],
      ['validation failure (array message)', new BadRequestException(['a must be a string', 'b must be an int']), 400],
      ['mapped Prisma error', prismaError('P2025'), 404],
      ['unmapped Prisma error', prismaError('P9999'), 500],
      ['a plain Error', new Error('boom'), 500],
      ['a thrown string', 'boom', 500],
      ['null', null, 500],
    ];

    it.each(cases)('%s → statusCode:number, message:string, error:string', (_label, exception, expected) => {
      const { status, body } = run(exception);

      expect(status).toBe(expected);
      expect(body.statusCode).toBe(expected);
      expect(typeof body.message).toBe('string');
      expect(typeof body.error).toBe('string');
      expect(body.error).not.toBe('');
    });
  });

  describe('validation failures', () => {
    it('promotes the first message to a string and keeps the full list in details', () => {
      const { body } = run(new BadRequestException(['email must be an email', 'password is too short']));

      // The RN client renders body.message directly (client.js:25) — an array
      // there reached the user comma-joined by Error's stringification.
      expect(body.message).toBe('email must be an email');
      expect(body.details).toEqual(['email must be an email', 'password is too short']);
      expect(body.error).toBe('Bad Request');
    });

    it('omits details entirely when there is only a plain message', () => {
      const { body } = run(new ForbiddenException('Not your merchant'));

      expect(body.message).toBe('Not your merchant');
      expect(body).not.toHaveProperty('details');
    });
  });

  describe('Prisma mapping', () => {
    it('maps a unique-constraint violation to 409 and names the field', () => {
      const { status, body } = run(prismaError('P2002', { target: ['email'] }));

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.error).toBe('Conflict');
      expect(body.details).toEqual(['email is already taken']);
    });

    it('maps a missing record to 404', () => {
      expect(run(prismaError('P2025')).status).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps an unreachable database to 503, not 500 — it is transient and retryable', () => {
      const { status, body } = run(prismaError('P1001'));

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.message).toBe('The service is temporarily unavailable');
    });
  });

  describe('leakage', () => {
    it('never returns the message of an unexpected error', () => {
      // Real example: the Resend 403 body names the account owner's personal
      // email address. It belongs in the log, never in a response.
      const leaky = new Error(
        'Resend API error (403): You can only send testing emails to your own email address (owner@example.com)',
      );

      const { body } = run(leaky);

      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('owner@example.com');
    });

    it('never returns the message of an unmapped Prisma error', () => {
      // Prisma messages quote the failing query, table and column names.
      const { body } = run(prismaError('P9999'));

      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('Prisma');
    });
  });

  describe('logging', () => {
    it('logs 5xx at error level with the stack, and 4xx at warn without it', () => {
      // The suite-wide spies from beforeAll have already recorded the calls
      // made by every test above, so clear them before asserting on counts.
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      error.mockClear();
      warn.mockClear();

      run(new UnauthorizedException('nope'), '/visits');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('/visits -> 401'));
      expect(error).not.toHaveBeenCalled();

      run(new Error('boom'), '/visits');
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('/visits -> 500'),
        expect.stringContaining('Error: boom'),
      );
    });
  });
});
