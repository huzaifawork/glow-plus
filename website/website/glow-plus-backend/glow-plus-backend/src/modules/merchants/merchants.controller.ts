import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ThrottleCredentials } from '../../common/throttling';
import { MerchantsService } from './merchants.service';
import { OnboardingService } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { MerchantLoginDto } from './login.dto';
import { MerchantSignupDto } from './signup.dto';
import { PublicMerchantsQueryDto } from './public-merchants-query.dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireMerchantOwnerGuard } from '../../common/guards/require-merchant-owner.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/require-active-subscription.guard';
import { AvailabilityService } from '../bookings/availability.service';
import { UpdateSeatsDto } from './settings.dto';
import { UpdateLocationDto, UploadLogoDto } from './location.dto';
import { CapacityQueryDto } from './capacity-query.dto';
import { assertMerchantVisible } from '../../common/merchant-visibility';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly onboarding: OnboardingService,
    private readonly merchantAuth: MerchantAuthService,
    private readonly availability: AvailabilityService,
    private readonly prisma: PrismaService,
  ) {}

  // T31 — this bound `MerchantSignupInput`, a TypeScript INTERFACE. Interfaces
  // are erased at compile time, so ValidationPipe had no metatype to read and
  // silently validated nothing: `password: ""` created a real salon account
  // whose empty password logged in. See signup.dto.ts.
  @ThrottleCredentials()
  @Post('signup')
  signup(@Body() dto: MerchantSignupDto) {
    return this.onboarding.signup(dto);
  }

  @ThrottleCredentials()
  @Post('login')
  login(@Body() dto: MerchantLoginDto) {
    return this.merchantAuth.login(dto);
  }

  /**
   * Public salon directory (T43). Supports `?q=`, `?limit=`, `?offset=`.
   *
   * Declared before `@Get('me')` only for readability — Nest matches
   * `/merchants` and `/merchants/me` as distinct paths, so order is not
   * load-bearing here the way it would be under a `:id` param route.
   *
   * `passthrough: true` matters: without it, injecting `@Res()` switches the
   * handler into manual mode and Nest stops serialising the return value, so
   * the request hangs until it times out. With it, the header is set and the
   * returned array is still sent normally — and the global exception filter
   * still owns any error thrown below.
   *
   * The total goes in a header rather than an envelope so the body stays the
   * bare array the RN app maps over. `X-Total-Count` is not a CORS-safelisted
   * response header, so the browser can only read it because CORS exposes it.
   *
   * T44 moved that exposure into `config/security.ts` (EXPOSED_HEADERS). It
   * used to be a `res.setHeader('Access-Control-Expose-Headers', ...)` on
   * this line, on the grounds that the exposure belonged next to the header
   * it exposed — but `setHeader` replaces, so this route was answering with
   * that one name and silently hiding every rate-limit header from the
   * browser. See the note beside the constant.
   */
  @Get()
  async list(@Query() query: PublicMerchantsQueryDto, @Res({ passthrough: true }) res: Response) {
    const { items, total } = await this.merchants.listPublic(query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  /**
   * Founding-spots counter for the landing page (T43) [F42]. Public — it sits
   * above the fold and returns one integer, no merchant identities.
   */
  @Get('founding-spots')
  foundingSpots() {
    return this.merchants.foundingSpots();
  }

  // Merchant-only (T29). Deliberately NOT behind RequireActiveSubscriptionGuard:
  // a SUSPENDED or PAST_DUE merchant must still be able to read their own
  // profile and reach billing to fix exactly that.
  @Get('me')
  @UseGuards(RequireMerchantGuard)
  me(@Req() req: MerchantRequest) {
    return this.merchants.getProfile(req.merchantId);
  }

  /**
   * T83 — "can I get in?", for a salon's public page.
   *
   * PUBLIC, like the salon's menu and its opening hours: a customer deciding
   * whether to walk in has not signed in yet, and asking them to is the
   * fastest way to lose them. `getCapacity` calls `assertMerchantVisible`, so
   * a suspended, cancelled or unapproved salon 404s here exactly as it does on
   * every other public route — T48 [F47] is not re-opened by adding one.
   *
   * Booking counts only. It exposes no customer, no name and no appointment
   * time — just how many of the salon's own chairs are busy.
   */
  @Get(':merchantId/capacity')
  capacity(@Param('merchantId') merchantId: string, @Query() query: CapacityQueryDto) {
    return this.availability.getCapacity(merchantId, query.date);
  }

  /**
   * M1 (W5, R3.11) — a salon's logo, for every Glow+ surface.
   *
   * PUBLIC, and behind `assertMerchantVisible` like the menu, the hours and
   * the capacity above it: a suspended salon's logo has to 404 exactly as its
   * menu does, or the directory and the image disagree about whether the salon
   * exists [F47].
   *
   * **Immutable-cacheable, because the URL carries a version.**
   * `logoUrlFor()` appends `?v=<logoUpdatedAt>`, so a replaced logo is a
   * different URL and this one can be cached hard forever. Without the
   * version this header would pin a salon's old logo into every app and CDN
   * for a year; with it, `immutable` is simply true. The two are one design and
   * must not be separated — if you remove `?v=`, remove this header.
   *
   * `@Res({ passthrough: false })` on purpose: this is the one route in the
   * API that does not answer with JSON, so it writes the body itself. The
   * global exception filter still owns anything thrown BEFORE that write.
   */
  @Get(':merchantId/logo')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async logo(@Param('merchantId') merchantId: string, @Res() res: Response) {
    await assertMerchantVisible(this.prisma, merchantId, 'Merchant not found');
    const logo = await this.merchants.getLogoBytes(merchantId);
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Content-Length', String(logo.sizeBytes));
    res.end(logo.bytes);
  }

  /**
   * W1/W2 — upload or replace the salon's logo.
   *
   * **`RequireActiveSubscriptionGuard` IS requirement W1**, not incidental
   * hardening: *"A salon's subscription must be active before the website
   * allows that salon to upload a logo."* Owner-only alongside it, matching
   * every other write that changes what customers are shown.
   *
   * `PUT` rather than `POST`: there is exactly one logo per salon and
   * uploading twice must replace, not accumulate. The verb is the contract.
   */
  @UseGuards(RequireMerchantOwnerGuard, RequireActiveSubscriptionGuard)
  @Put('me/logo')
  uploadLogo(@Req() req: MerchantRequest, @Body() dto: UploadLogoDto) {
    return this.merchants.setLogo(req.merchantId!, dto.image);
  }

  /** W2 — "and replace it later if they choose" includes taking it down. */
  @UseGuards(RequireMerchantOwnerGuard, RequireActiveSubscriptionGuard)
  @Delete('me/logo')
  removeLogo(@Req() req: MerchantRequest) {
    return this.merchants.deleteLogo(req.merchantId!);
  }

  /**
   * M1 — the salon registers where it is  (mobile spec R3.6-R3.10)
   *
   * Owner-only, and deliberately NOT behind the subscription paywall — unlike
   * the logo, whose gate is a stated requirement (W1). A lapsed salon is
   * hidden from the directory anyway [F74], so gating this would only stop it
   * from correcting its own address before it comes back.
   *
   * ⚠️ This is the SALON's address. Nothing on this server ever accepts a
   * CUSTOMER's coordinates (NF6) — the app computes distance on the device.
   */
  @UseGuards(RequireMerchantOwnerGuard)
  @Patch('me/location')
  updateLocation(@Req() req: MerchantRequest, @Body() dto: UpdateLocationDto) {
    return this.merchants.updateLocation(req.merchantId!, dto);
  }

  /**
   * T83 — the salon sets its own seat count.
   *
   * Owner-only and behind the paywall, the same pair reward-rules uses for its
   * writes: this is business configuration that changes what customers are
   * offered, not day-to-day work a receptionist does.
   */
  @UseGuards(RequireMerchantOwnerGuard, RequireActiveSubscriptionGuard)
  @Patch('me/seats')
  updateSeats(@Req() req: MerchantRequest, @Body() dto: UpdateSeatsDto) {
    return this.merchants.updateSeats(req.merchantId!, dto.seats);
  }
}
