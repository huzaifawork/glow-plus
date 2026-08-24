import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { StylesService } from './styles.service';
import { CreateStyleDto, UpdateStyleDto } from './dto';
import { PublicStylesParamDto, PublicStylesQueryDto } from './public-styles.dto';
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

  /**
   * A salon's public menu (T44). Supports `?limit=`, `?offset=`.
   *
   * Deliberately unguarded: there is no merchant context, and it must keep
   * working for a consumer browsing a salon they don't own — before they have
   * an account at all. Public for real only because `app.module.ts` excludes
   * `styles/public/(.*)` from AuthMiddleware, GET-only, so the merchant-scoped
   * `GET /styles` above stays behind a token.
   *
   * The `:merchantId` is bound as a DTO, not a bare `@Param('merchantId')`
   * string — see public-styles.dto.ts. A loose param is validated by nothing
   * [F38], and this route is reachable without a token.
   *
   * `passthrough: true` matters, exactly as it does on `GET /merchants`:
   * without it, injecting `@Res()` puts the handler into manual mode, Nest
   * stops serialising the return value, and the request hangs until it times
   * out.
   *
   * `X-Total-Count` is not a CORS-safelisted response header, so it is
   * unreadable from a browser unless CORS exposes it — that is done once in
   * `config/security.ts` (EXPOSED_HEADERS) and deliberately NOT with a
   * `res.setHeader('Access-Control-Expose-Headers', ...)` here, which
   * replaces rather than appends and would take the rate-limit headers down
   * with it. See the note beside the constant.
   */
  @Get('public/:merchantId')
  async listPublic(
    @Param() params: PublicStylesParamDto,
    @Query() query: PublicStylesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.styles.listPublicForMerchant(params.merchantId, query);
    res.setHeader('X-Total-Count', String(total));
    return items;
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
