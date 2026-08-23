import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { OnboardingService, MerchantSignupInput } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { MerchantLoginDto } from './login.dto';
import { AuthedRequest } from '../../middleware/auth.middleware';

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly onboarding: OnboardingService,
    private readonly merchantAuth: MerchantAuthService,
  ) {}

  @Post('signup')
  signup(@Body() dto: MerchantSignupInput) {
    return this.onboarding.signup(dto);
  }

  @Post('login')
  login(@Body() dto: MerchantLoginDto) {
    return this.merchantAuth.login(dto);
  }

  // Public salon directory — see MerchantsService.listPublic() (T18/T43).
  @Get('public')
  listPublic() {
    return this.merchants.listPublic();
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.merchants.getProfile(req.merchantId!);
  }
}