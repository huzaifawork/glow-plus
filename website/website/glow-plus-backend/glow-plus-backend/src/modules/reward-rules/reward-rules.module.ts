import { Module } from '@nestjs/common';
import { RewardRulesController } from './reward-rules.controller';
import { RewardRulesService } from './reward-rules.service';

// T37 — `controllers` was absent entirely, which is why the module exported a
// service that only `POST /visits` and the booking flow could ever reach.
@Module({
  controllers: [RewardRulesController],
  providers: [RewardRulesService],
  exports: [RewardRulesService],
})
export class RewardRulesModule {}
