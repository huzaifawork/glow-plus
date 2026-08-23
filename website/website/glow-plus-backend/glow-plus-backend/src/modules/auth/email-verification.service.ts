import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sendEmail } from '../notifications/email.provider';

type AccountType = 'CONSUMER' | 'MERCHANT' | 'ADMIN';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  async sendVerificationEmail(accountId: string, accountType: AccountType, email: string) {
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);

    await this.prisma.emailVerification.create({
      data: {
        accountId,
        accountType,
        email,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const verifyUrl = `${APP_URL}/verify-email?token=${rawToken}`;
    await sendEmail({
      to: email,
      template: 'confirm-email',
      data: { verifyUrl },
    });
  }

  async verifyEmail(rawToken: string) {
    const hashedToken = this.hashToken(rawToken);
    const record = await this.prisma.emailVerification.findUnique({ where: { token: hashedToken } });

    if (!record) throw new BadRequestException('Invalid or already-used token');
    if (record.verifiedAt) throw new BadRequestException('Invalid or already-used token');
    if (record.expiresAt < new Date()) throw new BadRequestException('Token expired');

    const queries: Prisma.PrismaPromise<any>[] = [
      this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { verifiedAt: new Date() },
      }),
      ...this.markAccountVerifiedQueries(record.accountId, record.accountType as AccountType),
    ];

    await this.prisma.$transaction(queries);

    return { accountId: record.accountId, accountType: record.accountType };
  }

  private markAccountVerifiedQueries(accountId: string, accountType: AccountType): Prisma.PrismaPromise<any>[] {
    const now = new Date();
    switch (accountType) {
      case 'CONSUMER':
        return [this.prisma.user.update({ where: { id: accountId }, data: { emailVerifiedAt: now } })];
      case 'MERCHANT':
        return [this.prisma.merchant.update({ where: { id: accountId }, data: { emailVerifiedAt: now } })];
      default:
        return [];
    }
  }
}