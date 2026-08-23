import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The fields of a Merchant that may leave the server  (T17)
 *
 * Returning a Prisma record straight out of a handler returns EVERY column,
 * and Merchant holds two that must never reach a client:
 *
 *   - `passwordHash` — a bcrypt hash. Verified live: `GET /merchants/me`
 *     returned it, and so did `GET /admin/merchants/pending`, which has no
 *     guard [F7] — so ANY logged-in consumer could harvest the password hash
 *     of every pending merchant and attack it offline at their leisure.
 *   - `stripeCustomerId` — lets anyone who obtains it correlate a merchant
 *     with billing records; it is an internal identifier, not user data.
 *
 * An explicit allow-list is used rather than `omit`/delete so that a column
 * added to the schema later is excluded BY DEFAULT and has to be opted in.
 * That is the difference between a leak that cannot happen and one that
 * happens the next time someone adds a field.
 */
export const MERCHANT_PUBLIC_SELECT = {
  id: true,
  businessName: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  foundingMember: true,
  createdAt: true,
  subscription: true,
} satisfies Prisma.MerchantSelect;

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: MERCHANT_PUBLIC_SELECT,
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  /** Used by the admin merchant-approval queue. */
  async listByStatus(status?: string) {
    return this.prisma.merchant.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      select: MERCHANT_PUBLIC_SELECT,
    });
  }

  async approve(merchantId: string) {
    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: { status: 'ACTIVE' },
      select: MERCHANT_PUBLIC_SELECT,
    });
  }

  async suspend(merchantId: string) {
    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: { status: 'SUSPENDED' },
      select: MERCHANT_PUBLIC_SELECT,
    });
  }
}
