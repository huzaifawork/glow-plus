import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { sign } from '../../middleware/jwt.util';
import { AdminLoginDto } from './login.dto';

/**
 * Admin accounts are not self-service (see schema.prisma) — there is no
 * signup here, only login. Same shape as MerchantAuthService/AuthService.
 */
@Injectable()
export class AdminAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (!admin || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = sign({ sub: admin.id, role: 'admin' });
    return { token, admin: { id: admin.id, email: admin.email } };
  }
}
