import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
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

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly onboarding: OnboardingService,
    private readonly merchantAuth: MerchantAuthService,
    private readonly availability: AvailabilityService,
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
  capacity(@Param('merchantId') merchantId: string) {
    return this.availability.getCapacity(merchantId);
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
