import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StyleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FOUNDING_MEMBER_CAP, FoundingSpots } from './founding';
import { DEFAULT_MERCHANT_PAGE, PublicMerchantsQueryDto } from './public-merchants-query.dto';
import { LISTABLE_MERCHANT_WHERE } from '../../common/salon-listable';

/** One row of the public salon directory (T43). */
export type PublicMerchant = {
  id: string;
  businessName: string;
  foundingMember: boolean;
  /** Active styles on this salon's menu. */
  styleCount: number;
  /** The distinct style types it offers, for the card's tag row. */
  styleTypes: StyleType[];
};

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
  // T83 — how many clients the salon can serve at once. Opted in explicitly,
  // as the comment above requires. Safe to publish: it is a fact about the
  // shop floor, not about a person, and the whole point is that customers can
  // see it. The salon's own portal reads it back from here to fill the field.
  seats: true,
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

  /**
   * Public salon directory  (T43 — replaces T18's `GET /merchants/public`)
   *
   * Only ACTIVE merchants are listed: a PENDING one hasn't been approved yet,
   * and a SUSPENDED/CANCELLED one shouldn't be taking new bookings. No auth
   * required — a consumer browses before signing up.
   *
   * **The route moved to `GET /merchants`** because that is the path the RN
   * app already calls (`client.js:152`, `fetchSalons`). T18 built the stopgap
   * at `/merchants/public` to unblock booking; leaving it there would have
   * meant Order 2 could not talk to this backend without a change on one side
   * or the other, which is the exact rework Phase 7 exists to prevent.
   *
   * **The body stays a bare array even though this now paginates.** The RN
   * app does `setSalons(await fetchSalons())` and maps over the result
   * (`BookScreen.js:29`), so wrapping the list in `{ items, total }` would
   * break Order 2 on the day it ships. The total travels in `X-Total-Count`
   * instead — see the controller.
   *
   * `styleCount`/`styleTypes` are additive, and they exist to kill an N+1:
   * the website's salon grid was calling `GET /styles/public/:id` once per
   * salon purely to render "3 styles on the menu" and a tag row, so a
   * 40-salon directory cost 41 requests. Two queries here, not one per
   * merchant — `groupBy` would return counts but not the distinct types, and
   * a Prisma `include` would ship every style field for the whole page.
   */
  async listPublic(query: PublicMerchantsQueryDto = {}): Promise<{
    items: PublicMerchant[];
    total: number;
  }> {
    const take = query.limit ?? DEFAULT_MERCHANT_PAGE;
    const skip = query.offset ?? 0;

    // A blank or whitespace-only `q` means "no filter", not "match the empty
    // string" — a search box that has been typed into and cleared must show
    // the directory again, not an accidental `contains: ''`.
    const q = query.q?.trim();
    const where: Prisma.MerchantWhereInput = {
      // [F74] — approval is only half of it. A salon that never subscribed used
      // to be listed forever for free; LISTABLE_MERCHANT_WHERE adds the
      // subscription half, and is shared with assertMerchantVisible so the
      // directory and the per-salon routes cannot disagree.
      ...LISTABLE_MERCHANT_WHERE,
      ...(q ? { businessName: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    // Counted with the same `where`, so `X-Total-Count` describes the filtered
    // directory rather than the whole platform. Paged inside a search
    // otherwise reports a total the caller can never page to.
    const [merchants, total] = await this.prisma.$transaction([
      this.prisma.merchant.findMany({
        where,
        orderBy: { businessName: 'asc' },
        skip,
        take,
        select: { id: true, businessName: true, foundingMember: true },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    if (!merchants.length) return { items: [], total };

    // Scoped to the ids on THIS page, not every ACTIVE merchant: the second
    // query has to stay proportional to the page, or pagination saves the
    // client work and costs the database the same.
    const styles = await this.prisma.style.findMany({
      where: { merchantId: { in: merchants.map((m) => m.id) }, active: true },
      // Ordered so the card's tag row is stable between requests. Without it
      // Postgres is free to return the rows in any order and the same salon
      // renders "nail spa hair" on one load and "hair nail spa" on the next.
      orderBy: { type: 'asc' },
      select: { merchantId: true, type: true },
    });

    const byMerchant = new Map<string, { count: number; types: Set<StyleType> }>();
    for (const style of styles) {
      let entry = byMerchant.get(style.merchantId);
      if (!entry) byMerchant.set(style.merchantId, (entry = { count: 0, types: new Set() }));
      entry.count += 1;
      entry.types.add(style.type);
    }

    return {
      items: merchants.map((m) => {
        const entry = byMerchant.get(m.id);
        return {
          ...m,
          styleCount: entry?.count ?? 0,
          styleTypes: entry ? [...entry.types] : [],
        };
      }),
      total,
    };
  }

  /**
   * Public founding-spots counter  (T43) [F42]
   *
   * The landing page's "N spots left" was the last thing in the SPA still
   * reading `localStorage`, so on any fresh browser it reported all 50 spots
   * free forever, no matter how many salons had signed up.
   *
   * It counts **every** merchant row, not merchants carrying the badge, and
   * not just ACTIVE ones — because that is what `OnboardingService.signup`
   * gates on (`merchant.count() < FOUNDING_MEMBER_CAP`). A salon awaiting
   * approval has taken a spot; quoting a number the next signup contradicts
   * would be worse than the bug this replaces. See `founding.ts`.
   *
   * Public on purpose: this sits above the fold, long before anyone has an
   * account. It exposes one integer and no merchant identities.
   */
  async foundingSpots(): Promise<FoundingSpots> {
    const merchantCount = await this.prisma.merchant.count();
    const taken = Math.min(merchantCount, FOUNDING_MEMBER_CAP);
    return { cap: FOUNDING_MEMBER_CAP, taken, left: FOUNDING_MEMBER_CAP - taken };
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

  /**
   * T83 — set how many clients this salon can serve at once.
   *
   * Lowering it does NOT cancel bookings that already exceed the new number.
   * Those appointments were accepted in good faith and real customers are
   * expecting them; the salon reduces capacity going forward and works the
   * existing day out. Availability simply offers nothing more until the count
   * drops back under the new figure, which is what a salon losing a stylist
   * actually wants.
   */
  async updateSeats(merchantId: string, seats: number) {
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { seats } });
    return { ok: true, seats };
  }
}
