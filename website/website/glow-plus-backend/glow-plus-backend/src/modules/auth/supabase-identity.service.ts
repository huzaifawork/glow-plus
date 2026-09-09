import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Who Supabase says the holder of this token is.
 *
 * ── Why Supabase is in the loop at all ─────────────────────────────────────
 * Glow+ already uses Supabase as its Postgres host (see `prisma/schema.prisma`),
 * and "Sign in with Google" is the one part of Google's OAuth dance nobody
 * should hand-roll: the consent screen, the client secret, the code exchange
 * and the ID-token signature check are all things Supabase Auth already does
 * and keeps current. The mobile app talks to Supabase, Supabase talks to
 * Google, and this service is the single place that decides whether the
 * resulting token means anything.
 *
 * ── Why `GET /auth/v1/user` and not local JWT verification ─────────────────
 * The obvious alternative is to verify the JWT's signature here with the
 * project's JWT secret. It was rejected for two reasons:
 *
 *   1. **Revocation.** A locally-verified JWT stays "valid" for its full life
 *      even after the Supabase session is signed out or the user is deleted.
 *      Asking Supabase makes the check live — this is the one moment in a
 *      sign-in where being a few hundred milliseconds slower buys correctness.
 *   2. **Key rotation.** Supabase is moving projects from a single shared
 *      HS256 secret to rotatable asymmetric keys. Code that pins the secret
 *      breaks silently on the day a project is migrated; code that asks
 *      Supabase does not.
 *
 * ── Configuration is OPTIONAL ──────────────────────────────────────────────
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` are deliberately absent from
 * `env.validation.ts`'s required lists. Every existing deployment predates
 * this feature, and adding a required variable would turn a missing dashboard
 * entry into a refused boot — email/password login, bookings and rewards all
 * going down for a feature none of them use. Unconfigured, this one endpoint
 * answers 503 with a sentence naming what to set; nothing else changes.
 */

/** The slice of GoTrue's user object this service actually reads. */
export interface SupabaseIdentity {
  /** The Supabase user id (a UUID). Logged, never used as the Glow+ id. */
  subject: string;
  email: string;
  /** Best available display name, or null when Google sent none. */
  name: string | null;
}

/** How long to wait on Supabase before giving the caller a sentence. */
const TIMEOUT_MS = 10_000;

@Injectable()
export class SupabaseIdentityService {
  private readonly logger = new Logger(SupabaseIdentityService.name);

  /** True when the deployment has been given a Supabase project to ask. */
  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.anonKey());
  }

  private baseUrl(): string {
    return (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  }

  private anonKey(): string {
    // The ANON key, not the service-role key. This call is made on behalf of
    // the user whose token is in the Authorization header, so it needs no
    // privilege of its own — and a service-role key on a route reachable by
    // anyone is a key one bug away from being the whole database.
    return (process.env.SUPABASE_ANON_KEY ?? '').trim();
  }

  /**
   * Exchange a Supabase access token for the verified identity behind it.
   *
   * Throws `UnauthorizedException` when the token is not good, and
   * `ServiceUnavailableException` when we could not find out. The difference
   * matters: the first means "sign in again", the second means "try again in
   * a minute", and a client shown the wrong one takes the wrong action.
   */
  async verify(accessToken: string): Promise<SupabaseIdentity> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
      );
    }

    const user = await this.fetchUser(accessToken);

    // ── The provider check ────────────────────────────────────────────────
    // This is the ONE route that trusts an email address without ever seeing
    // a password, and that trust rests entirely on Google having verified the
    // address. A Supabase project may have other providers enabled —
    // email/password among them — and a token minted through one of those
    // carries a SELF-ASSERTED address, which must never be allowed to claim
    // an existing Glow+ account.
    const providers = new Set<string>(
      [
        user.app_metadata?.provider,
        ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata!.providers! : []),
        ...(Array.isArray(user.identities) ? user.identities.map((i) => i?.provider) : []),
      ].filter((p): p is string => typeof p === 'string'),
    );
    if (!providers.has('google')) {
      throw new UnauthorizedException('This sign-in did not come from Google.');
    }

    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!email) {
      throw new UnauthorizedException(
        'Your Google account did not share an email address with Glow+, so we cannot sign you in.',
      );
    }

    // Belt and braces on top of the provider check. Google only ever hands
    // over a verified address, and Supabase stamps `email_confirmed_at` when
    // it accepts one — an unstamped address here means something upstream is
    // wrong, and the safe reading of that is "no".
    const verified =
      Boolean(user.email_confirmed_at) ||
      Boolean(user.confirmed_at) ||
      user.user_metadata?.email_verified === true;
    if (!verified) {
      throw new UnauthorizedException('Google has not verified this email address.');
    }

    return { subject: String(user.id ?? ''), email, name: pickName(user) };
  }

  /** The network half, kept separate so the rules above read as rules. */
  private async fetchUser(accessToken: string): Promise<GoTrueUser> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/auth/v1/user`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: this.anonKey(),
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });
    } catch (err) {
      // Could not ask. NOT an authentication failure — see the doc comment.
      this.logger.error(
        'Could not reach Supabase to verify a Google sign-in',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException(
        'We could not reach the sign-in service. Please try again in a moment.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Your Google sign-in has expired. Please try again.');
    }
    if (!res.ok) {
      this.logger.error(`Supabase answered ${res.status} verifying a Google sign-in`);
      throw new ServiceUnavailableException(
        'We could not reach the sign-in service. Please try again in a moment.',
      );
    }

    try {
      return (await res.json()) as GoTrueUser;
    } catch {
      throw new ServiceUnavailableException(
        'We could not reach the sign-in service. Please try again in a moment.',
      );
    }
  }
}

/**
 * A display name, from whichever field Google happened to populate.
 *
 * `User.name` is NOT NULL in the schema, so the caller must always end up with
 * something printable. Returning null here means "Google sent none" and lets
 * `AuthService` decide the fallback, rather than inventing one in two places.
 */
function pickName(user: GoTrueUser): string | null {
  const candidates = [
    user.user_metadata?.full_name,
    user.user_metadata?.name,
    [user.user_metadata?.given_name, user.user_metadata?.family_name].filter(Boolean).join(' '),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

/** Only the fields read above; GoTrue sends a great deal more. */
interface GoTrueUser {
  id?: string;
  email?: string;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
  identities?: Array<{ provider?: string }>;
  user_metadata?: {
    full_name?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email_verified?: boolean;
  };
}
