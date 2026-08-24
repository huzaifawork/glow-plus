import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountRole } from '../../middleware/auth.middleware';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  sign,
} from '../../middleware/jwt.util';

/**
 * Refresh tokens  (T47, closing [F12])
 *
 * Before this, a session WAS the access token: HS256, fixed 7 days, consulted
 * against no store, so it could not be revoked and a leak was good for a week.
 * The access token is now 15 minutes and this table is the long-lived half —
 * the only part of a session the server can actually end.
 *
 * Four properties, each of which has a test that fails if it is removed:
 *
 *   **Hashed at rest.** The client holds the raw value; the row holds its
 *   SHA-256. Same treatment as EmailVerification and PasswordReset — a dump of
 *   this table is not a set of working sessions.
 *
 *   **Single-use, with rotation.** Every refresh marks the presented row
 *   `usedAt` and mints a replacement in the same family. A refresh token is
 *   therefore only ever valid once, which is what makes replay *detectable*
 *   at all.
 *
 *   **Replay kills the family.** Presenting an already-used token means the
 *   value leaked and both the thief and the legitimate holder are now using
 *   it, and the server cannot tell which one is talking. So it revokes the
 *   entire lineage and logs everyone out (OAuth 2.0 Security BCP §4.14.2).
 *   Logging out the real user is the intended outcome, not collateral: the
 *   alternative is leaving the thief with a live session.
 *
 *   **Claims are re-derived, never replayed.** The row stores `accountId` and
 *   `accountType`, not `role`/`merchantId`, so every refresh re-reads the
 *   account. A staff member demoted from OWNER to STAFF loses the owner claims
 *   at their next refresh instead of holding them for up to 30 days. Storing
 *   the claims would have quietly undone T24's owner/staff split.
 *
 * ⚠ Rotation is deliberately STRICT — there is no "grace window" in which a
 * used token is silently accepted again. That window is the standard fix for
 * two browser tabs refreshing at the same moment, but it is also exactly the
 * window a thief replays in, and it would weaken the one property rotation
 * exists to provide. The multi-tab race is handled on the client instead
 * (`api.js`: a losing tab re-reads the token another tab just stored and
 * retries with it), which costs the server nothing.
 */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Mint a session. Called by all four login paths, and by `rotate` for the
   * replacement — a new `familyId` starts a lineage, a supplied one continues it.
   */
  async issue(accountId: string, accountType: AccountType, familyId: string = randomUUID()) {
    // 32 bytes from a CSPRNG. Opaque on purpose: a refresh token carries no
    // claims, so there is nothing in it to read, and nothing that could be
    // trusted without the database round trip that revocation needs anyway.
    const raw = randomBytes(32).toString('hex');

    await this.prisma.refreshToken.create({
      data: {
        token: this.hash(raw),
        accountId,
        accountType,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    return raw;
  }

  /**
   * The login response, in one place.
   *
   * `token` keeps its name and its position. `client.js:99` does
   * `await saveToken(result.token)` and the website's `api.js` reads
   * `data.token` per role — neither may be edited from the backend side, so
   * everything T47 adds is additive and sits beside it.
   */
  async issueSession(
    accountId: string,
    accountType: AccountType,
    claims: { role: AccountRole; merchantId?: string },
  ) {
    const refreshToken = await this.issue(accountId, accountType);
    return {
      token: sign({ sub: accountId, role: claims.role, merchantId: claims.merchantId }),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /** POST /auth/refresh — spend one refresh token, get a new pair. */
  async rotate(rawToken: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { token: this.hash(rawToken) } });

    // Unknown token. Deliberately the same message as every other failure
    // below: telling a caller *why* their token was refused distinguishes
    // "never existed" from "already spent", which is the difference between a
    // guess and a confirmed leak.
    if (!row) throw this.refuse();

    if (row.usedAt) {
      // Replay. The legitimate client rotated this token already, so whoever
      // is presenting it now obtained it some other way.
      await this.revokeFamily(row.familyId);
      throw this.refuse();
    }
    if (row.revokedAt) throw this.refuse();
    if (row.expiresAt.getTime() <= Date.now()) throw this.refuse();

    // A guarded update rather than a plain one: two requests can reach here
    // holding the same row, and exactly one must win. `updateMany` with the
    // null conditions in the WHERE makes the database do the arbitration, so
    // the loser is treated as the replay it is indistinguishable from.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(row.familyId);
      throw this.refuse();
    }

    const claims = await this.claimsFor(row.accountId, row.accountType);
    if (!claims) {
      // The account was deleted while the session was alive. There is nothing
      // to mint claims from, and the rest of the lineage is worthless too.
      await this.revokeFamily(row.familyId);
      throw this.refuse();
    }

    const refreshToken = await this.issue(row.accountId, row.accountType, row.familyId);

    return {
      token: sign({ sub: row.accountId, role: claims.role, merchantId: claims.merchantId }),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * POST /auth/logout — end the session server-side.
   *
   * Always `{ ok: true }`, even for a token that was never valid. Logout is
   * unauthenticated (the access token may already have expired, which is
   * precisely when a user reaches for it), so a truthful 404 here would turn
   * this into an oracle for whether a stolen refresh token is still live.
   */
  async revoke(rawToken: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { token: this.hash(rawToken) } });
    // The whole family, not just this row: "log me out" means the session, and
    // the session is the lineage.
    if (row) await this.revokeFamily(row.familyId);
    return { ok: true as const };
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private refuse() {
    return new UnauthorizedException('Invalid refresh token');
  }

  /**
   * Re-read the account and rebuild the access token's claims from it.
   *
   * Mirrors what each login path puts in the token, and mirrors what each
   * login path CHECKS — which is: does the account exist. Nothing here refuses
   * a SUSPENDED merchant, because `MerchantAuthService.login` does not either;
   * a refresh stricter than a login would sign a salon out mid-session for a
   * state they can immediately log back in under.
   */
  private async claimsFor(
    accountId: string,
    accountType: AccountType,
  ): Promise<{ role: AccountRole; merchantId?: string } | null> {
    switch (accountType) {
      case 'CONSUMER': {
        const user = await this.prisma.user.findUnique({
          where: { id: accountId },
          select: { id: true },
        });
        return user ? { role: 'consumer' } : null;
      }
      case 'MERCHANT': {
        const merchant = await this.prisma.merchant.findUnique({
          where: { id: accountId },
          select: { id: true },
        });
        return merchant ? { role: 'merchant_owner', merchantId: merchant.id } : null;
      }
      case 'ADMIN': {
        const admin = await this.prisma.admin.findUnique({
          where: { id: accountId },
          select: { id: true },
        });
        return admin ? { role: 'admin' } : null;
      }
      case 'STAFF': {
        const staff = await this.prisma.merchantStaff.findUnique({
          where: { id: accountId },
          select: { role: true, merchantId: true },
        });
        if (!staff) return null;
        // Re-derived, not remembered — this line is the demotion case.
        return {
          role: staff.role === 'OWNER' ? 'merchant_owner' : 'merchant_staff',
          merchantId: staff.merchantId,
        };
      }
      default:
        return null;
    }
  }
}
