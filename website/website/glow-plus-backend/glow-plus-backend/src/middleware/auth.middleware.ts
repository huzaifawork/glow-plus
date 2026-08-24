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
    // T46 — the ONLY place a credential enters the API. There is deliberately
    // no cookie, no `?token=` query parameter and no second header: a React
    // Native client has no cookie jar, and a second channel is a second thing
    // to get wrong. `credentials` is false in the CORS config for the same
    // reason (config/security.ts).
    //
    // The scheme is matched case-INSENSITIVELY because RFC 7235 §2.1 says it
    // is ("the scheme name is case-insensitive"), and `startsWith('Bearer ')`
    // did not. A client or proxy that normalises the header — entirely within
    // spec — would have been 401'd by a backend we are not allowed to change
    // from the app side, which is the precise class of rework Phase 7 exists
    // to prevent. It widens nothing: the token itself is still verified.
    const match = /^Bearer +(.+)$/i.exec(req.headers.authorization ?? '');
    if (!match) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = match[1].trim();
    const payload = jwt.verify(token); // throws on invalid/expired token

    req.accountId = payload.sub;
    req.accountRole = payload.role;
    req.merchantId = payload.merchantId;

    next();
  }
}
