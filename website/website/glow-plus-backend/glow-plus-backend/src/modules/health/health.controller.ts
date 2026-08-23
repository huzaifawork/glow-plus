import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

const startedAt = Date.now();

/**
 * Deploy/uptime checks. Both routes are public — they are excluded from
 * AuthMiddleware in app.module.ts, otherwise a probe with no bearer token
 * gets a 401 and every deploy check reads as "down".
 *
 * Two routes on purpose:
 *   GET /health       liveness  — process is up. No DB, no I/O, always cheap.
 *                               This is the one a platform health check polls.
 *   GET /health/ready readiness — the API can actually serve traffic, i.e.
 *                               Prisma can reach Postgres. Returns 503 when it
 *                               cannot, so a broken DATABASE_URL fails the
 *                               deploy instead of surfacing later as 500s.
 *
 * Keeping them apart matters on Vercel (Phase 8): a frequently-polled liveness
 * probe that opened a DB connection every time would burn the connection
 * budget that T55's pooling exists to protect.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const startedCheck = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: { status: 'up', latencyMs: Date.now() - startedCheck },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      // Deliberately not thrown as an exception: the body carries the reason,
      // and a readiness probe wants a machine-readable 503, not a stack trace.
      // Prisma error codes (P1001 "can't reach database") are safe to expose;
      // the message can contain the host, so it is not echoed back.
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'UNKNOWN';
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        database: { status: 'down', code },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
