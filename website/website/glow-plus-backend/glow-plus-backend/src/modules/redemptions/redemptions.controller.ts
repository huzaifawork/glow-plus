import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RedemptionsService } from './redemptions.service';
import { RedeemDto } from './dto';
import { ConsumerRequest, MerchantRequest } from '../../middleware/auth.middleware';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';

@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptions: RedemptionsService) {}

  @Get('available')
  @UseGuards(RequireConsumerGuard)
  available(@Req() req: ConsumerRequest, @Query('merchantId') merchantId: string) {
    return this.redemptions.available(req.accountId, merchantId);
  }

  @Post()
  @UseGuards(RequireConsumerGuard)
  redeem(@Req() req: ConsumerRequest, @Body() dto: RedeemDto) {
    return this.redemptions.redeem(req.accountId, dto.rewardRuleId);
  }

  @Get('me')
  @UseGuards(RequireConsumerGuard)
  mine(@Req() req: ConsumerRequest) {
    return this.redemptions.history(req.accountId);
  }

  @Get()
  @UseGuards(RequireMerchantGuard)
  forMerchant(@Req() req: MerchantRequest) {
    return this.redemptions.historyForMerchant(req.merchantId);
  }
}
