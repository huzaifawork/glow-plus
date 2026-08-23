import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { LogVisitDto } from './dto';
import { AuthedRequest } from '../../middleware/auth.middleware';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.visits.list(req.merchantId!);
  }

  @Post()
  log(@Req() req: AuthedRequest, @Body() dto: LogVisitDto) {
    return this.visits.logVisit(req.merchantId!, req.accountId!, dto);
  }
}
