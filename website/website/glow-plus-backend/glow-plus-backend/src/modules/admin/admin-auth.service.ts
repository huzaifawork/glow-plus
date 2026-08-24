import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminLoginDto } from './login.dto';
import { RefreshTokenService } from '../auth/refresh-token.service';

/**
 * Admin accounts are not self-service (see schema.prisma) — there is no
 * signup here, only login. Same shape as MerchantAuthService/AuthService.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (!admin || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // T47 — additive beside `token`.
    const session = await this.refreshTokens.issueSession(admin.id, 'ADMIN', { role: 'admin' });
    return { ...session, admin: { id: admin.id, email: admin.email } };
  }
}
