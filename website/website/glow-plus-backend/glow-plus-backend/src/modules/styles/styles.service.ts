import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertMerchantVisible } from '../../common/merchant-visibility';
import { Prisma, StyleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStyleDto, UpdateStyleDto } from './dto';
import { DEFAULT_STYLE_PAGE, PublicStylesQueryDto } from './public-styles.dto';

/** One row of a salon's public menu (T44). */
export type PublicStyle = {
  id: string;
  name: string;
  type: StyleType;
  pointsPerVisit: number;
  durationMinutes: number;
};

/**
 * The fields of a Style that may leave the server on the PUBLIC route  (T44)
 *
 * An explicit allow-list, not `omit`, for the same reason as
 * MERCHANT_PUBLIC_SELECT: a column added to the schema later is excluded BY
 * DEFAULT and has to be opted in. Style holds nothing secret *today* — that
 * is exactly the state in which an `include` gets added without anyone
 * noticing, on a route that is served to the open internet with no token
 * [F31]. The five fields here are the five the RN app's DEMO_STYLES names
 * (`client.js:131-137`), so this is also the Order 2 contract.
 */
export const STYLE_PUBLIC_SELECT = {
  id: true,
  name: true,
  type: true,
  pointsPerVisit: true,
  durationMinutes: true,
} satisfies Prisma.StyleSelect;

@Injectable()
export class StylesService {
  constructor(private readonly prisma: PrismaService) {}

  list(merchantId: string) {
    return this.prisma.style.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * A salon's public menu  (T44 — replaces T18's stopgap in place)
   *
   * **The path stays `GET /styles/public/:merchantId`.** T43 had to *move*
   * the directory because the RN app calls `/merchants` and the stopgap sat
   * at `/merchants/public`; here `client.js:157` (`fetchSalonStyles`) already
   * calls this exact path, so the Order 2 contract is satisfied where it is.
   * Moving it to match the directory's shape would have been symmetry bought
   * with a breaking change to an app we are not allowed to edit.
   *
   * Not servable by the merchant-scoped `list()` above, which is why this
   * exists at all: that one trusts `req.merchantId`, has no concept of
   * "someone else's styles", and sits behind RequireActiveSubscriptionGuard —
   * a paywall on *merchant actions*, which would make a consumer's ability to
   * browse a menu depend on the salon's billing state at request time.
   *
   * Only **active** styles at an **ACTIVE** merchant, matching `listPublic()`
   * on the directory. The two have to agree: the directory's `styleCount`
   * counts `active: true` rows, so a different rule here would make a card
   * advertise "3 styles" and the menu behind it show two.
   *
   * **The body is a bare array even though it paginates**, exactly as T43's
   * directory is: `BookScreen.js:44` does `setStyleList(await
   * fetchSalonStyles(...))` and maps the result, so an `{ items, total }`
   * envelope would break Order 2 on the day it ships. The total rides on
   * `X-Total-Count` — see the controller.
   */
  async listPublicForMerchant(
    merchantId: string,
    query: PublicStylesQueryDto = {},
  ): Promise<{ items: PublicStyle[]; total: number }> {
    // Checked before the styles, not alongside them: a suspended or
    // not-yet-approved salon must 404 rather than return an empty menu, or
    // "this salon has no services yet" and "this salon is not open to
    // customers" become indistinguishable to the caller.
    //
    // T48 moved this rule into common/merchant-visibility.ts unchanged. It was
    // the only route enforcing it, and availability, booking and business
    // hours all needed the same answer [F47] — four copies of a visibility
    // rule is four chances for them to disagree about which salons exist.
    await assertMerchantVisible(this.prisma, merchantId);

    const where: Prisma.StyleWhereInput = { merchantId, active: true };

    // Counted with the same `where`, so `X-Total-Count` is the size of the
    // menu the caller is paging through — not the merchant's whole catalogue
    // including the styles they have retired.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.style.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: query.offset ?? 0,
        take: query.limit ?? DEFAULT_STYLE_PAGE,
        select: STYLE_PUBLIC_SELECT,
      }),
      this.prisma.style.count({ where }),
    ]);
    return { items, total };
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
