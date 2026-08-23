import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { sign } from '../../middleware/jwt.util';
import { SignupDto, LoginDto } from './dto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async signupConsumer(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name, phone: dto.phone },
    });

    await this.emailVerification.sendVerificationEmail(user.id, 'CONSUMER', user.email);

    return { id: user.id, email: user.email, name: user.name };
  }

  async loginConsumer(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = sign({ sub: user.id, role: 'consumer' });
    return { token, user: { id: user.id, name: user.name, emailVerified: !!user.emailVerifiedAt } };
  }

  async verifyEmail(token: string) {
    return this.emailVerification.verifyEmail(token);
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true }; // don't leak account existence
    if (user.emailVerifiedAt) return { ok: true };

    await this.emailVerification.sendVerificationEmail(user.id, 'CONSUMER', user.email);
    return { ok: true };
  }
}
