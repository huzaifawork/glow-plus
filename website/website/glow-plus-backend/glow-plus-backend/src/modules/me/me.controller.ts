import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { MeService } from './me.service';
import { ConsumerRequest } from '../../middleware/auth.middleware';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';

/**
 * `/me/*` — the signed-in consumer's own view of the platform (T42).
 *
 * Consumer-guarded from the first commit, like PointsController: everything
 * here scopes off `req.accountId`, which is exactly the `req.merchantId!`
 * shape behind [F29]. A merchant token carries an accountId too, so without
 * the guard this would answer with that staff account's (empty) history
 * instead of refusing.
 */
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** Who am I? Lets a client restore a consumer session from a stored token [F51]. */
  @Get()
  @UseGuards(RequireConsumerGuard)
  profile(@Req() req: ConsumerRequest) {
    return this.me.profile(req.accountId);
  }

  @Get('rewards')
  @UseGuards(RequireConsumerGuard)
  rewards(@Req() req: ConsumerRequest) {
    return this.me.rewards(req.accountId);
  }
}
