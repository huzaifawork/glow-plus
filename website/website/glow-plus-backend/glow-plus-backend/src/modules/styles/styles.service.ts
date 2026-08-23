import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStyleDto, UpdateStyleDto } from './dto';

@Injectable()
export class StylesService {
  constructor(private readonly prisma: PrismaService) {}

  list(merchantId: string) {
    return this.prisma.style.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Public style list for one merchant (T18, pulled forward from T44 — a
   * consumer picks a style before booking, and the merchant-scoped
   * `list()` above is unusable for that: it trusts `req.merchantId`, has no
   * concept of "someone else's styles", and would need to sit behind
   * RequireActiveSubscriptionMiddleware, which is for merchant actions, not
   * consumer browsing). Only active styles, at a merchant that's actually
   * live — matches the same ACTIVE-only rule as listPublic() above.
   */
  async listPublicForMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { status: true },
    });
    if (!merchant || merchant.status !== 'ACTIVE') {
      throw new NotFoundException('Merchant not found');
    }
    return this.prisma.style.findMany({
      where: { merchantId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, type: true, pointsPerVisit: true, durationMinutes: true },
    });
  }

  create(merchantId: string, dto: CreateStyleDto) {
    return this.prisma.style.create({
      data: { merchantId, name: dto.name, type: dto.type, pointsPerVisit: dto.pointsPerVisit },
    });
  }

  async update(merchantId: string, styleId: string, dto: UpdateStyleDto) {
    await this.assertOwnership(merchantId, styleId);
    return this.prisma.style.update({ where: { id: styleId }, data: dto });
  }

  async setActive(merchantId: string, styleId: string, active: boolean) {
    await this.assertOwnership(merchantId, styleId);
    return this.prisma.style.update({ where: { id: styleId }, data: { active } });
  }

  private async assertOwnership(merchantId: string, styleId: string) {
    const style = await this.prisma.style.findUnique({ where: { id: styleId } });
    if (!style) throw new NotFoundException('Style not found');
    if (style.merchantId !== merchantId) throw new ForbiddenException('Not your style');
    return style;
  }
}
