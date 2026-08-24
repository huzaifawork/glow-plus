import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { sign } from '../../middleware/jwt.util';
import { MerchantLoginDto } from './login.dto';

@Injectable()
export class MerchantAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: MerchantLoginDto) {
    const merchant = await this.prisma.merchant.findUnique({ where: { email: dto.email } });
    if (!merchant || !(await bcrypt.compare(dto.password, merchant.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = sign({ sub: merchant.id, role: 'merchant_owner', merchantId: merchant.id });

    return {
      token,
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