import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from './jwt.util';

export type AccountRole = 'consumer' | 'merchant_staff' | 'merchant_owner' | 'admin';

export interface AuthedRequest extends Request {
  accountId?: string;
  accountRole?: AccountRole;
  merchantId?: string; // present for merchant_staff / merchant_owner
}

/**
 * A request that has already been through `RequireMerchantGuard` (T29).
 *
 * Controllers used to read `req.merchantId!`, and that `!` was a lie —
 * AuthMiddleware guarantees a *valid token*, never a *merchant* token, so a
 * consumer's `undefined` reached Prisma and the `where` filter was silently
 * dropped [F29]. Typing the guarded routes with this instead of asserting
 * makes the compiler, not a convention, the thing that keeps them apart:
 * remove the guard and the handler stops type-checking.
 */
export interface MerchantRequest extends AuthedRequest {
  accountId: string;
  merchantId: string;
  readOnly?: boolean; // set by RequireActiveSubscriptionGuard on PAST_DUE
}

/** A request that has already been through `RequireConsumerGuard` (T29). */
export interface ConsumerRequest extends AuthedRequest {
  accountId: string;
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: AuthedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token); // throws on invalid/expired token

    req.accountId = payload.sub;
    req.accountRole = payload.role;
    req.merchantId = payload.merchantId;

    next();
  }
}
