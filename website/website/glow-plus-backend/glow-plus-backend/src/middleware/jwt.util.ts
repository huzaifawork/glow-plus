import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AccountRole } from './auth.middleware';

// Minimal, dependency-free JWT (HS256) so the sample stays readable.
// Swap for the `jsonwebtoken` package in a real deployment if you want
// standard claim handling, key rotation, etc.

export interface TokenPayload {
  sub: string;
  role: AccountRole;
  merchantId?: string;
  exp: number;
}

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sign(payload: Omit<TokenPayload, 'exp'>, expiresInSeconds = 60 * 60 * 24 * 7): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const signature = base64url(
    createHmac('sha256', SECRET).update(`${encodedHeader}.${encodedPayload}`).digest(),
  );

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verify(token: string): TokenPayload {
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new UnauthorizedException('Malformed token');
  }

  const expected = base64url(
    createHmac('sha256', SECRET).update(`${encodedHeader}.${encodedPayload}`).digest(),
  );
  if (signature !== expected) {
    throw new UnauthorizedException('Invalid token signature');
  }

  const payload: TokenPayload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedException('Token expired');
  }

  return payload;
}
