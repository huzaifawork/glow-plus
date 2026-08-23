import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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
      },
    };
  }
}