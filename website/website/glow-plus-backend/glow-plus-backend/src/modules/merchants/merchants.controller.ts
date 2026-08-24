import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottleCredentials } from '../../common/throttling';
import { MerchantsService } from './merchants.service';
import { OnboardingService, MerchantSignupInput } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { MerchantLoginDto } from './login.dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly onboarding: OnboardingService,
    private readonly merchantAuth: MerchantAuthService,
  ) {}

  @ThrottleCredentials()
  @Post('signup')
  signup(@Body() dto: MerchantSignupInput) {
    return this.onboarding.signup(dto);
  }

  @ThrottleCredentials()
  @Post('login')
  login(@Body() dto: MerchantLoginDto) {
    return this.merchantAuth.login(dto);
  }

  // Public salon directory — see MerchantsService.listPublic() (T18/T43).
  @Get('public')
  listPublic() {
    return this.merchants.listPublic();
  }

  // Merchant-only (T29). Deliberately NOT behind RequireActiveSubscriptionGuard:
  // a SUSPENDED or PAST_DUE merchant must still be able to read their own
  // profile and reach billing to fix exactly that.
  @Get('me')
  @UseGuards(RequireMerchantGuard)
  me(@Req() req: MerchantRequest) {
    return this.merchants.getProfile(req.merchantId);
  }
}