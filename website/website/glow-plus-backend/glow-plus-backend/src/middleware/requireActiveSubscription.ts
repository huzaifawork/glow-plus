import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedRequest } from './auth.middleware';

/**
 * Blocks merchant-portal write actions once a subscription is SUSPENDED or
 * CANCELLED. PAST_DUE merchants are allowed through as read-only — the
 * route handlers themselves check `req.readOnly` before mutating anything.
 */
@Injectable()
export class RequireActiveSubscriptionMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: AuthedRequest & { readOnly?: boolean }, res: Response, next: NextFunction) {
    if (!req.merchantId) {
      throw new ForbiddenException('No merchant context on this request');
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: req.merchantId },
      select: { status: true },
    });

    if (!merchant) {
      throw new ForbiddenException('Unknown merchant');
    }

    if (merchant.status === 'SUSPENDED' || merchant.status === 'CANCELLED') {
      throw new ForbiddenException('Subscription inactive. Please update billing to continue.');
    }

    if (merchant.status === 'PAST_DUE') {
      req.readOnly = true; // handlers must check this before writes
    }

    next();
  }
}
