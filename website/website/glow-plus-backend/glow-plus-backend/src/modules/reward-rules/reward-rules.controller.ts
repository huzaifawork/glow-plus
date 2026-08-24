import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RewardRulesService } from './reward-rules.service';
import { CreateRewardRuleDto, UpdateRewardRuleDto } from './dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireMerchantOwnerGuard } from '../../common/guards/require-merchant-owner.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/require-active-subscription.guard';

/**
 * Reward rules over HTTP  (T37)
 *
 * This controller did not exist. `reward-rules.module.ts` declared no
 * `controllers` array at all, so a salon had no way to create or change the
 * offers its own loyalty programme runs on — the rules could only be seeded.
 * The portal's "Reward rules" tab was writing to `localStorage` [F9] because
 * there was nothing else for it to write to.
 *
 * ── The role split, decided rather than inherited ──────────────────────────
 *
 * T24 established two merchant guards and they are not interchangeable:
 * `RequireMerchantGuard` accepts the owner AND staff, for the day-to-day work
 * staff exist to do; `RequireMerchantOwnerGuard` refuses staff on the things
 * that are the owner's alone.
 *
 * Reads are open to staff. A receptionist has to be able to tell a client what
 * they are working toward, and the portal's rules tab must render for them.
 *
 * **Writes are owner-only.** A reward rule is a standing commitment to give
 * money away — "every 5th visit is free" is a discount on every fifth
 * appointment from now on, applied automatically by `POST /visits` with nobody
 * approving it at the till. That is the same class of decision as the
 * subscription itself, which T24 moved onto the owner guard for the same
 * reason (a receptionist could otherwise cancel the salon's plan). Note this
 * is a deliberate divergence from `styles.controller.ts`, where staff may
 * write: a style is catalogue upkeep, and mispricing one costs the points on
 * a single visit, not a recurring giveaway.
 *
 * Guard ORDER matters and matches every other merchant controller here: the
 * role guard runs first and establishes `req.merchantId`, then the
 * subscription guard reads it. Guards are applied per route rather than on the
 * controller because Nest *merges* controller- and handler-level guards — a
 * handler could not opt out of a controller-wide list, which is exactly what
 * the read/write split needs to do.
 *
 * `req.merchantId` is read only ever behind one of those guards — the [F29]
 * pattern (`req.merchantId!` with no role check ahead of it, which returned
 * every merchant's rows to a consumer token) is not repeated here.
 */
const MERCHANT_READ = [RequireMerchantGuard, RequireActiveSubscriptionGuard];
const OWNER_WRITE = [RequireMerchantOwnerGuard, RequireActiveSubscriptionGuard];

@Controller('reward-rules')
export class RewardRulesController {
  constructor(private readonly rewardRules: RewardRulesService) {}

  @Get()
  @UseGuards(...MERCHANT_READ)
  list(@Req() req: MerchantRequest) {
    return this.rewardRules.list(req.merchantId);
  }

  @Post()
  @UseGuards(...OWNER_WRITE)
  create(@Req() req: MerchantRequest, @Body() dto: CreateRewardRuleDto) {
    return this.rewardRules.create(req.merchantId, dto);
  }

  @Patch(':id')
  @UseGuards(...OWNER_WRITE)
  update(@Req() req: MerchantRequest, @Param('id') id: string, @Body() dto: UpdateRewardRuleDto) {
    return this.rewardRules.update(req.merchantId, id, dto);
  }

  // No DELETE — see RewardRulesService.setActive(). Redemption rows point at a
  // rule by foreign key, so removing one would take the customer's redemption
  // history with it.
  @Patch(':id/activate')
  @UseGuards(...OWNER_WRITE)
  activate(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.rewardRules.setActive(req.merchantId, id, true);
  }

  @Patch(':id/deactivate')
  @UseGuards(...OWNER_WRITE)
  deactivate(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.rewardRules.setActive(req.merchantId, id, false);
  }
}
