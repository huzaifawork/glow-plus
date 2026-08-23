import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStyleDto, UpdateStyleDto } from './dto';

@Injectable()
export class StylesService {
  constructor(private readonly prisma: PrismaService) {}

  list(merchantId: string) {
    return this.prisma.style.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
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
