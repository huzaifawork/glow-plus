import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sendEmail } from '../notifications/email.provider';

type AccountType = 'CONSUMER' | 'MERCHANT';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const SALT_ROUNDS = 12;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — shorter than email verification, this resets a live credential

@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Looks up the email in both the User and Merchant tables (forgot-password
   * doesn't know which kind of account it is for) and issues a token for each
   * match — the same email could plausibly own both a consumer and a merchant
   * account. Always returns { ok: true } regardless of whether anything
   * matched, so the endpoint can't be used to enumerate accounts.
   */
  async forgotPassword(email: string) {
    const [user, merchant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.merchant.findUnique({ where: { email } }),
    ]);

    if (user) await this.issueToken(user.id, 'CONSUMER', user.email);
    if (merchant) await this.issueToken(merchant.id, 'MERCHANT', merchant.email);

    return { ok: true };
  }

  private async issueToken(accountId: string, accountType: AccountType, email: string) {
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);

    await this.prisma.passwordReset.create({
      data: {
        accountId,
        accountType,
        email,
        token: hashedToken,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;
    await sendEmail({ to: email, template: 'reset-password', data: { resetUrl } });
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const hashedToken = this.hashToken(rawToken);
    const record = await this.prisma.passwordReset.findUnique({ where: { token: hashedToken } });

    if (!record) throw new BadRequestException('Invalid or already-used token');
    if (record.usedAt) throw new BadRequestException('Invalid or already-used token');
    if (record.expiresAt < new Date()) throw new BadRequestException('Token expired');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const queries: Prisma.PrismaPromise<any>[] = [
      this.prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      ...this.updatePasswordQuery(record.accountId, record.accountType as AccountType, passwordHash),
    ];

    await this.prisma.$transaction(queries);

    return { ok: true };
  }

  private updatePasswordQuery(accountId: string, accountType: AccountType, passwordHash: string): Prisma.PrismaPromise<any>[] {
    switch (accountType) {
      case 'CONSUMER':
        return [this.prisma.user.update({ where: { id: accountId }, data: { passwordHash } })];
      case 'MERCHANT':
        return [this.prisma.merchant.update({ where: { id: accountId }, data: { passwordHash } })];
    }
  }
}
