import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StylesService } from './styles.service';
import { CreateStyleDto, UpdateStyleDto } from './dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/require-active-subscription.guard';

// T29 — every route here except the public one is the merchant's own
// catalogue. Guard order matters and is the same everywhere: the merchant
// guard establishes req.merchantId, then the subscription guard reads it.
// Applied per route rather than on the controller because Nest *merges*
// controller- and handler-level guards — a `@UseGuards()` on the public route
// could not opt out of a controller-wide list.
const MERCHANT = [RequireMerchantGuard, RequireActiveSubscriptionGuard];

@Controller('styles')
export class StylesController {
  constructor(private readonly styles: StylesService) {}

  @Get()
  @UseGuards(...MERCHANT)
  list(@Req() req: MerchantRequest) {
    return this.styles.list(req.merchantId);
  }

  // Public — a consumer picks a style before booking (T18/T44). Deliberately
  // unguarded: there is no merchant context, and it must keep working for a
  // consumer browsing a salon they don't own.
  @Get('public/:merchantId')
  listPublic(@Param('merchantId') merchantId: string) {
    return this.styles.listPublicForMerchant(merchantId);
  }

  @Post()
  @UseGuards(...MERCHANT)
  create(@Req() req: MerchantRequest, @Body() dto: CreateStyleDto) {
    return this.styles.create(req.merchantId, dto);
  }

  @Patch(':id')
  @UseGuards(...MERCHANT)
  update(@Req() req: MerchantRequest, @Param('id') id: string, @Body() dto: UpdateStyleDto) {
    return this.styles.update(req.merchantId, id, dto);
  }

  @Patch(':id/activate')
  @UseGuards(...MERCHANT)
  activate(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.styles.setActive(req.merchantId, id, true);
  }

  @Patch(':id/deactivate')
  @UseGuards(...MERCHANT)
  deactivate(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.styles.setActive(req.merchantId, id, false);
  }
}
