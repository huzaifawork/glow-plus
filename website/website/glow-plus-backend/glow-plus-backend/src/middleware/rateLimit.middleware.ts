import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Basic sliding-window limiter keyed by a caller-provided key extractor
 * (e.g. request body email, or req.ip). Good enough for a single-instance
 * deployment; swap for a Redis-backed limiter once you're running more
 * than one API instance.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly max = 5,
    private readonly keyOf: (req: Request) => string = (req) => req.ip ?? 'unknown',
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const key = this.keyOf(req);
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);

    if (recent.length >= this.max) {
      throw new HttpException('Too many requests — please wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }

    recent.push(now);
    this.hits.set(key, recent);
    next();
  }
}
