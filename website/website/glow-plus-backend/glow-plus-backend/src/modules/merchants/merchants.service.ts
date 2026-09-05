import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StyleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FOUNDING_MEMBER_CAP, FoundingSpots } from './founding';
import { DEFAULT_MERCHANT_PAGE, PublicMerchantsQueryDto } from './public-merchants-query.dto';
import { LISTABLE_MERCHANT_WHERE } from '../../common/salon-listable';
import { decodeImageDataUrl } from '../../common/image';
import { absoluteApiUrl } from '../../config/public-url';
import { UpdateLocationDto } from './location.dto';
import { Coordinates, geocodeAddress } from '../../common/geocode';

/**
 * Where a salon is  (M1 — mobile spec R3.6-R3.10)
 *
 * Every field is nullable and that is load-bearing, not defensive: R3.9 and
 * the spec's own dependency note both require "no location" to be a state the
 * clients handle, so it has to be a state the payload can express. A salon
 * with `latitude: null` is simply absent from distance-sorted results and
 * present everywhere else.
 *
 * ⚠️ These are the SALON's coordinates. The customer's are never sent to this
 * server (NF6) — the app computes distance on the device from these numbers.
 */
export type MerchantLocation = {
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** One row of the public salon directory (T43). */
export type PublicMerchant = MerchantLocation & {
  id: string;
  businessName: string;
  foundingMember: boolean;
  seats: number;
  /**
   * M1 (W5, R3.11/R3.12) — an absolute URL to this salon's logo, or `null`
   * when it has not uploaded one.
   *
   * `null` rather than a placeholder image URL, deliberately. The placeholder
   * is a CLIENT decision — R3.12 asks each surface to render "a neutral
   * placeholder", and the app's is a tinted monogram that no server-side
   * default image could produce. Sending a URL here would also mean every
   * salon without a logo triggers a real network fetch for a picture of
   * nothing.
   */
  logoUrl: string | null;
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
  // M1 — opted in explicitly, as the allow-list above requires. All published
  // on purpose: a customer choosing a salon needs to know where it is and what
  // it looks like, and the salon's own portal reads these back from here to
  // fill its settings form. `logoMimeType`/`logoUpdatedAt` are metadata, not
  // the image — the bytes live in MerchantLogo and are never selected here.
  logoMimeType: true,
  logoUpdatedAt: true,
  addressLine: true,
  city: true,
  region: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  subscription: true,
} satisfies Prisma.MerchantSelect;

/**
 * The URL a client should fetch this salon's logo from, or null.
 *
 * `?v=` is the whole reason this is a function rather than a template literal
 * at each call site. The logo lives at a STABLE path (`/merchants/:id/logo`)
 * so it can be cached hard, and a salon that replaces its logo would otherwise
 * keep showing the old one in every app and browser that had already fetched
 * it. The version is the update timestamp, so a new upload is a new URL and an
 * unchanged logo is a cache hit.
 */
export function logoUrlFor(merchant: { id: string; logoUpdatedAt: Date | null }): string | null {
  if (!merchant.logoUpdatedAt) return null;
  return absoluteApiUrl(`merchants/${merchant.id}/logo?v=${merchant.logoUpdatedAt.getTime()}`);
}

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: MERCHANT_PUBLIC_SELECT,
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    // M1 — the salon's own portal renders its current logo from the same field
    // name the public directory uses, so one `<img src={logoUrl}>` works in
    // both places and there is no second "am I looking at the settings copy or
    // the public copy" path to keep in step.
    return { ...merchant, logoUrl: logoUrlFor(merchant) };
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
    const city = query.city?.trim();
    const where: Prisma.MerchantWhereInput = {
      // [F74] — approval is only half of it. A salon that never subscribed used
      // to be listed forever for free; LISTABLE_MERCHANT_WHERE adds the
      // subscription half, and is shared with assertMerchantVisible so the
      // directory and the per-salon routes cannot disagree.
      ...LISTABLE_MERCHANT_WHERE,
      // M1 (R3.10) — `q` now searches the CITY as well as the name.
      //
      // The requirement is "manually search or filter by city or area as an
      // alternative to device-detected location", and a single box that finds
      // both "Bloom" and "Scarborough" is what a user actually types into. It
      // is an OR, not a second field: a name-only match must keep working
      // exactly as it did for the website, which has had this search box since
      // T43 and passes no `city`.
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' as const } },
              { city: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      // A separate, EXPLICIT city filter, for the app's city chips — where the
      // user picked a city from a list rather than typing, and a fuzzy name
      // match would be wrong. Combines with `q` by AND, so "nails in Toronto"
      // is expressible.
      ...(city ? { city: { equals: city, mode: 'insensitive' as const } } : {}),
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
        // T83 — `seats` joins the card so the directory can say "4 chairs"
        // without an extra request per salon. How BUSY each one is stays on
        // GET /merchants/:id/capacity: that answer needs today's bookings and
        // the salon's hours, and doing it per row here would be one query per
        // card on every directory load.
        // M1 — location and logo METADATA join the row. Both are needed to
        // render a directory card and neither costs a second request: the
        // coordinates are two floats, and `logoUpdatedAt` is a timestamp that
        // becomes a URL (`logoUrlFor`) without touching the image bytes, which
        // live in their own table precisely so a 100-salon page never reads
        // them. R3.13 — "must not block or delay the rest of the salon
        // information" — is satisfied structurally here, not by the client
        // being careful.
        select: {
          id: true,
          businessName: true,
          foundingMember: true,
          seats: true,
          logoUpdatedAt: true,
          addressLine: true,
          city: true,
          region: true,
          postalCode: true,
          latitude: true,
          longitude: true,
        },
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
        const { logoUpdatedAt, ...rest } = m;
        return {
          ...rest,
          // The timestamp itself is not published — it is an implementation
          // detail of cache-busting, and a client that read it would be
          // building the URL a second time, which is how two surfaces end up
          // disagreeing about which logo is current (W5).
          logoUrl: logoUrlFor(m),
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

  /**
   * Used by the admin merchant-approval queue and the console's salon list.
   *
   * M2 — `logoUrl` is mapped on here for the same reason `getProfile` does it:
   * the console shows each salon's logo beside its name and can replace one,
   * and it must read the field by the name every other surface uses rather
   * than rebuilding the versioned URL itself.
   */
  async listByStatus(status?: string) {
    const merchants = await this.prisma.merchant.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      select: MERCHANT_PUBLIC_SELECT,
    });
    return merchants.map((m) => ({ ...m, logoUrl: logoUrlFor(m) }));
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

  /**
   * M1 — a salon registers where it is  (mobile spec R3.6-R3.10 dependency)
   *
   * `PATCH` semantics, honestly implemented: a field the caller did not send
   * is left alone, and a field sent as `null` is cleared. The distinction
   * matters because the portal's form submits only what changed, and because a
   * salon that typed the wrong address must be able to remove it — with a
   * `{ ...dto }` spread, `undefined` would clear it and there would be no way
   * to edit one field without resending all six.
   *
   * Coordinates are validated as a PAIR here as well as by the database CHECK,
   * so a salon sending only a latitude gets a sentence explaining why rather
   * than a driver error. A half-coordinate is worse than none: it passes an
   * `IS NOT NULL` test on one axis and puts the salon on the equator.
   */
  async updateLocation(merchantId: string, dto: UpdateLocationDto) {
    const has = (key: keyof UpdateLocationDto) => Object.prototype.hasOwnProperty.call(dto, key);

    // Both, or neither, in whatever the row ends up as after this patch.
    if (has('latitude') !== has('longitude')) {
      throw new BadRequestException(
        'Latitude and longitude must be set together — send both, or neither.',
      );
    }
    if (has('latitude') && (dto.latitude === null) !== (dto.longitude === null)) {
      throw new BadRequestException(
        'Latitude and longitude must be set together — send both, or clear both.',
      );
    }

    const data: Prisma.MerchantUpdateInput = {};
    // Trimmed, and an all-whitespace value is a clear rather than a blank
    // string: a directory that groups by city must not grow a "  " city.
    const text = (value: string | null | undefined) => {
      if (value === null) return null;
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };

    if (has('addressLine')) data.addressLine = text(dto.addressLine);
    if (has('city')) data.city = text(dto.city);
    if (has('region')) data.region = text(dto.region);
    if (has('postalCode')) data.postalCode = text(dto.postalCode);
    if (has('latitude')) data.latitude = dto.latitude ?? null;
    if (has('longitude')) data.longitude = dto.longitude ?? null;

    const merchant = await this.prisma.merchant.update({
      where: { id: merchantId },
      data,
      select: MERCHANT_PUBLIC_SELECT,
    });

    // M2 — if the salon is left without coordinates, try to derive them from
    // the address it just saved. Runs AFTER the update, on the row as it now
    // stands, so it sees the merged result rather than guessing at the patch.
    const located = await this.deriveCoordinates(merchant);
    return { ...merchant, ...(located ?? {}), logoUrl: logoUrlFor(merchant) };
  }

  /**
   * M2 — fill in a salon's map coordinates from its own address. Best-effort.
   *
   * ── Why this is not the same thing as the manual latitude/longitude pair ──
   * The pair stays, and an explicitly-entered pair always wins: this only ever
   * runs when the row has NO coordinates. A salon that typed its own numbers
   * has said something more precise than an address, and re-geocoding over the
   * top of that would quietly move a pin the owner placed on purpose.
   *
   * ── Why re-deriving after a clear is correct, not surprising ─────────────
   * Clearing the coordinate fields in the portal means "I do not want to type
   * these numbers", not "hide my salon from people searching nearby". The
   * salon that genuinely wants no pin clears its ADDRESS too, and with no city
   * or postal code `buildGeocodeQuery` returns null and nothing is derived.
   *
   * ── Why it never throws ──────────────────────────────────────────────────
   * Every caller is a request a human is waiting on — a signup, or a save. A
   * geocoder outage must degrade to "no coordinates yet", which is a state the
   * schema, the API and both clients already handle. It is retried on the next
   * save, and the manual fields are always available.
   */
  async deriveCoordinates(merchant: {
    id: string;
    addressLine: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
  }): Promise<Coordinates | null> {
    if (merchant.latitude !== null && merchant.longitude !== null) return null;

    const coords = await geocodeAddress(merchant);
    if (!coords) return null;

    try {
      await this.prisma.merchant.update({
        where: { id: merchant.id },
        data: { latitude: coords.latitude, longitude: coords.longitude },
      });
    } catch {
      // The salon row was deleted between the two statements, or the write
      // lost a race. Neither is worth failing the caller's request for — the
      // address is saved, and the next save tries again.
      return null;
    }
    return coords;
  }

  /**
   * W2/W3 — store a salon's logo.
   *
   * The subscription gate (W1) is NOT here: it is `RequireActiveSubscription`
   * on the route, the same guard every other paywalled write uses. Putting it
   * in the service would be a second implementation of a rule that already has
   * one, and the route-level guard is what also hides the feature from the
   * portal, which reads the same subscription state.
   *
   * The stored `mimeType` is the one `decodeImageDataUrl` DERIVED from the
   * bytes, never the one the caller declared — these bytes are served back
   * from our own origin, so the content type has to be a fact about them.
   *
   * Written as one transaction with the Merchant metadata update: `logoUrl`
   * is built from `logoUpdatedAt`, so a row whose bytes changed without its
   * timestamp changing would serve a stale image from every cache forever.
   */
  async setLogo(merchantId: string, dataUrl: string) {
    const { buffer, format, sizeBytes } = decodeImageDataUrl(dataUrl);
    const now = new Date();

    const [, merchant] = await this.prisma.$transaction([
      this.prisma.merchantLogo.upsert({
        where: { merchantId },
        create: { merchantId, mimeType: format.mimeType, bytes: buffer, sizeBytes },
        update: { mimeType: format.mimeType, bytes: buffer, sizeBytes },
      }),
      this.prisma.merchant.update({
        where: { id: merchantId },
        data: { logoMimeType: format.mimeType, logoUpdatedAt: now },
        select: MERCHANT_PUBLIC_SELECT,
      }),
    ]);

    return { ok: true, logoUrl: logoUrlFor(merchant), mimeType: format.mimeType, sizeBytes };
  }

  /** W2 — "and replace it later if they choose" includes removing it. */
  async deleteLogo(merchantId: string) {
    await this.prisma.$transaction([
      this.prisma.merchantLogo.deleteMany({ where: { merchantId } }),
      this.prisma.merchant.update({
        where: { id: merchantId },
        data: { logoMimeType: null, logoUpdatedAt: null },
      }),
    ]);
    // Clearing the timestamp is what makes `logoUrlFor` return null, so every
    // surface falls back to its placeholder (R3.12) on the next read.
    return { ok: true, logoUrl: null };
  }

  /**
   * The bytes, for `GET /merchants/:id/logo`.
   *
   * Visibility is checked by the CALLER (the controller calls
   * `assertMerchantVisible` first), for the same reason every other public
   * per-salon route does: a suspended salon's logo must 404 exactly as its
   * menu does, or the directory and the image disagree about whether the salon
   * exists.
   */
  async getLogoBytes(merchantId: string) {
    const logo = await this.prisma.merchantLogo.findUnique({ where: { merchantId } });
    if (!logo) throw new NotFoundException('This salon has no logo');
    return logo;
  }
}
