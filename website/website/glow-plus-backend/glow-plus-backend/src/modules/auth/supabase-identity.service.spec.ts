/**
 * Tests for the one thing standing between a forged token and a Glow+ session.
 *
 * `POST /auth/google` trusts an email address without ever seeing a password.
 * Everything that makes that safe is in this service, so each rule gets a test
 * that fails loudly if it is ever relaxed:
 *
 *   · the token is verified by SUPABASE, not by us reading its claims;
 *   · the identity must have come through GOOGLE, not another provider on the
 *     same Supabase project;
 *   · the address must be verified;
 *   · "we could not check" is a 503, never a 401.
 */
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { SupabaseIdentityService } from './supabase-identity.service';

const GOOGLE_USER = {
  id: 'sb-uuid-1',
  email: 'Customer@Example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ provider: 'google' }],
  user_metadata: { full_name: 'Muhammad Usman', email_verified: true },
};

function respondWith(body: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as any);
}

describe('SupabaseIdentityService', () => {
  let service: SupabaseIdentityService;
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    service = new SupabaseIdentityService();
    // Silence the deliberate error logs of the failure-path tests.
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    jest.restoreAllMocks();
  });

  it('asks Supabase, with the token as the bearer and the anon key as the apikey', async () => {
    const fetchMock = respondWith(GOOGLE_USER);
    global.fetch = fetchMock;

    const identity = await service.verify('supabase-access-token');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/auth/v1/user');
    expect(init.headers.Authorization).toBe('Bearer supabase-access-token');
    expect(init.headers.apikey).toBe('anon-key');

    expect(identity).toEqual({
      subject: 'sb-uuid-1',
      // Lower-cased: `User.email` is unique and case-sensitive in Postgres, so
      // Customer@ and customer@ signing in on different days must not become
      // two accounts.
      email: 'customer@example.com',
      name: 'Muhammad Usman',
    });
  });

  it('refuses an identity that did not come from Google', async () => {
    global.fetch = respondWith({
      ...GOOGLE_USER,
      app_metadata: { provider: 'email', providers: ['email'] },
      identities: [{ provider: 'email' }],
    });

    // The attack this stops: signing up in the same Supabase project with
    // email/password as someone else's Gmail address, then presenting that
    // token here to claim their Glow+ account.
    await expect(service.verify('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an unverified address', async () => {
    global.fetch = respondWith({
      ...GOOGLE_USER,
      confirmed_at: null,
      email_confirmed_at: null,
      user_metadata: { full_name: 'Muhammad Usman', email_verified: false },
    });

    await expect(service.verify('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an identity with no email address', async () => {
    global.fetch = respondWith({ ...GOOGLE_USER, email: undefined });

    await expect(service.verify('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('turns a rejected token into 401', async () => {
    global.fetch = respondWith({ message: 'invalid claim' }, 401);

    await expect(service.verify('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('turns a Supabase OUTAGE into 503, not 401', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    // The distinction is the point: 401 tells the app the sign-in failed and
    // sends the user round the Google consent screen again for nothing. 503
    // tells them to try again in a moment.
    await expect(service.verify('token')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('turns a Supabase 500 into 503 as well', async () => {
    global.fetch = respondWith({}, 500);

    await expect(service.verify('token')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('answers 503 with actionable wording when the deployment has no Supabase project', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    global.fetch = jest.fn();

    expect(service.isConfigured()).toBe(false);
    await expect(service.verify('token')).rejects.toThrow(/SUPABASE_URL/);
    // And it never made the call — an unconfigured server must not fetch
    // `undefined/auth/v1/user`.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back through the name fields Google may or may not send', async () => {
    global.fetch = respondWith({
      ...GOOGLE_USER,
      user_metadata: { given_name: 'Muhammad', family_name: 'Usman', email_verified: true },
    });

    expect((await service.verify('token')).name).toBe('Muhammad Usman');
  });

  it('reports no name rather than an empty one', async () => {
    global.fetch = respondWith({ ...GOOGLE_USER, user_metadata: { email_verified: true } });

    expect((await service.verify('token')).name).toBeNull();
  });
});
