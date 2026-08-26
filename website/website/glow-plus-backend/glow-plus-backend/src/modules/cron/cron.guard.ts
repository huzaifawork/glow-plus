import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * T54 — the only thing standing between the cron routes and the public
 * internet.
 *
 * These routes expire points, recalculate payouts and send email. They are
 * reachable by anyone who can guess a URL, so "is this Vercel Cron?" has to be
 * proven, not assumed. Vercel's contract: when a `CRON_SECRET` environment
 * variable is set on the project, its scheduler sends
 * `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 *
 * ⚠️ **That is the same header `AuthMiddleware` reads**, which is exactly why
 * `app.module.ts` must EXCLUDE the cron paths from it. Without the exclusion
 * the middleware sees a `Bearer` token, tries to verify it as a JWT, fails,
 * and 401s the request before this guard ever runs — so every scheduled job
 * silently stops, which is the same end state as T54 not existing.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  private readonly logger = new Logger(CronSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.CRON_SECRET;

    // Fail CLOSED. An unset secret must never mean "let everyone in" — that
    // is the failure mode where a missing env var quietly publishes the job
    // trigger. env.validation lists CRON_SECRET as production-required so this
    // should be unreachable in production; it is here because "should be" is
    // not a security control.
    if (!secret) {
      this.logger.error('CRON_SECRET is not set — refusing every cron request.');
      throw new UnauthorizedException('Cron is not configured.');
    }

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';

    // RFC 7235 §2.1 — the scheme is case-insensitive. Matched the same way
    // auth.middleware.ts matches it (T46); do not "tidy" either to
    // startsWith('Bearer ').
    const match = /^bearer\s+(.*)$/i.exec(header.trim());
    if (!match) {
      throw new UnauthorizedException('Cron is not configured.');
    }

    if (!safeEquals(match[1], secret)) {
      // Deliberately the SAME message and status as the two failures above.
      // A distinct "wrong secret" reply would confirm to a prober that the
      // route exists and is merely guarded, turning a 401 into a signal.
      throw new UnauthorizedException('Cron is not configured.');
    }

    return true;
  }
}

/**
 * Constant-time comparison of two strings of *any* length.
 *
 * `timingSafeEqual` throws unless both buffers are the same length, and
 * pre-checking the length leaks it. Hashing both to a fixed 32 bytes first
 * removes the length from the comparison entirely, so neither the value nor
 * its size is observable in the response time.
 */
function safeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
