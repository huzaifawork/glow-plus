import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { subscription: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  /** Used by the admin merchant-approval queue. */
  async listByStatus(status?: string) {
    return this.prisma.merchant.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { subscription: true },
    });
  }

  async approve(merchantId: string) {
    return this.prisma.merchant.update({ where: { id: merchantId }, data: { status: 'ACTIVE' } });
  }

  async suspend(merchantId: string) {
    return this.prisma.merchant.update({ where: { id: merchantId }, data: { status: 'SUSPENDED' } });
  }
}
