import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottleCredentials } from '../../common/throttling';
import { MerchantsService } from './merchants.service';
import { OnboardingService } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { MerchantLoginDto } from './login.dto';
import { MerchantSignupDto } from './signup.dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly onboarding: OnboardingService,
    private readonly merchantAuth: MerchantAuthService,
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