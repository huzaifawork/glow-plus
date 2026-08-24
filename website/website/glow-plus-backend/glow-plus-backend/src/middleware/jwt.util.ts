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

/**
 * No `?? 'dev-secret-change-me'` fallback here any more (T27).
 *
 * That default was [F20] with the safety off: if JWT_SECRET were ever unset,
 * the API would boot happily and sign every token — including `role:'admin'`
 * — with a constant string published in this repository. The same class of
 * mistake was already proven exploitable once, when JWT_SECRET held the
 * `.env.example` placeholder and a hand-forged admin token was accepted.
 *
 * config/env.validation.ts refuses to start without a real, >=32-char secret,
 * so reaching this line without one is impossible in the app. The throw
 * covers the remaining path — a script or test importing this module
 * directly — and fails loudly instead of silently signing with a known key.
 */
const SECRET = requireSecret();

function requireSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Tokens cannot be signed or verified without it.');
  }
  return secret;
}

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
