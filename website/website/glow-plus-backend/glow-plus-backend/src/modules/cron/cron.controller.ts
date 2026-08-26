import { Controller, Get, HttpCode, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from './cron.guard';
import { CronService, isCronSlot } from './cron.service';

/**
 * T54 — the routes Vercel Cron calls.
 *
 * ⚠️ **These are `GET` even though they mutate, and that is not an oversight.**
 * Vercel's scheduler issues a GET; a POST-only route would simply never be
 * invoked. The guard is what keeps that safe — an unauthenticated GET here
 * does nothing at all. They are excluded from `AuthMiddleware` in
 * `app.module.ts` because Vercel puts `CRON_SECRET` in the `Authorization`
 * header, which that middleware would otherwise try to parse as a JWT.
 *
 * The response body lists what ran, what was skipped and what failed, with
 * timings — Vercel's cron log shows the response, so that summary is the only
 * routine visibility anyone has into whether the batch is healthy.
 */
@Controller('cron')
@UseGuards(CronSecretGuard)
export class CronController {
  constructor(private readonly cron: CronService) {}

  @Get(':slot')
  // 200, not 202: the work is finished by the time this returns, and a
  // scheduler that sees "accepted" cannot tell a completed batch from a
  // dropped one.
  @HttpCode(200)
  async dispatch(@Param('slot') slot: string) {
    if (!isCronSlot(slot)) {
      // Named slots only. A typo in vercel.json is then a visible 404 in the
      // cron log rather than a silently no-op batch.
      throw new NotFoundException(`Unknown cron slot '${slot}'.`);
    }

    return this.cron.dispatch(slot);
  }
}
