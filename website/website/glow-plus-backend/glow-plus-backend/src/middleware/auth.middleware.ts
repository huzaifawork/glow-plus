import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from './jwt.util';

export type AccountRole = 'consumer' | 'merchant_staff' | 'merchant_owner' | 'admin';

export interface AuthedRequest extends Request {
  accountId?: string;
  accountRole?: AccountRole;
  merchantId?: string; // present for merchant_staff / merchant_owner
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
