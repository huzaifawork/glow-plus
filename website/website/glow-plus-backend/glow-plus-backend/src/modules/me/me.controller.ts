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

  @Get('rewards')
  @UseGuards(RequireConsumerGuard)
  rewards(@Req() req: ConsumerRequest) {
    return this.me.rewards(req.accountId);
  }
}
