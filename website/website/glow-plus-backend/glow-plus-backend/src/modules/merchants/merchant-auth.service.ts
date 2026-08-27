import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MerchantLoginDto } from './login.dto';
import { RefreshTokenService } from '../auth/refresh-token.service';

@Injectable()
export class MerchantAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(dto: MerchantLoginDto) {
    const merchant = await this.prisma.merchant.findUnique({ where: { email: dto.email } });
    if (!merchant || !(await bcrypt.compare(dto.password, merchant.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // T81 — an unverified address cannot sign in.
    //
    // Checked AFTER the password, never before: answering "verify your email"
    // to a wrong password would confirm that the address has an account here,
    // turning the login form into an account-existence oracle. The generic
    // "Invalid email or password" has to stay the only reply to bad
    // credentials.
    //
    // 403 rather than 401 on purpose. The credentials were RIGHT; the account
    // is simply not usable yet. A 401 would be indistinguishable from a bad
    // password to any client, and `lib/api.js` discards the session on 401 —
    // which is meaningless here, since no session was ever issued.
    //
    // Signup sends the link and POST /auth/resend-verification issues another,
    // so this is a door with a key, not a wall.
    if (!merchant.emailVerifiedAt) {
      throw new ForbiddenException(
        'Please verify your email address before signing in. We sent you a link when you signed up — check your inbox, or request a new one.',
      );
    }

    // T47 — additive beside `token`, which keeps its name and position.
    const session = await this.refreshTokens.issueSession(merchant.id, 'MERCHANT', {
      role: 'merchant_owner',
      merchantId: merchant.id,
    });

    return {
      ...session,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        status: merchant.status,
        emailVerified: !!merchant.emailVerifiedAt,
        // T43 [F44] — additive. The portal's "waiting for approval" banner has
        // two versions, and the founding one could never render: it tested
        // `currentMerchant.foundingBadge`, a name only the localStorage
        // prototype ever used, and login had no founding field under any name.
        // So the salons actually owed the extra free month were the ones told
        // about the standard trial.
        foundingMember: merchant.foundingMember,
      },
    };
  }
}