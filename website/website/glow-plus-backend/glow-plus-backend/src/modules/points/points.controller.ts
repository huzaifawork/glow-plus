import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PointsService } from './points.service';
import { AuthedRequest } from '../../middleware/auth.middleware';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';

// Consumer-only from the start (T18's guard), so this controller never
// repeats the `req.accountId!`-with-no-role-check pattern behind [F29].
@Controller('points')
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get('me')
  @UseGuards(RequireConsumerGuard)
  mine(@Req() req: AuthedRequest) {
    return this.points.balanceFor(req.accountId!);
  }
}
