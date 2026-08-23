import { Module } from '@nestjs/common';
import { RewardRulesService } from './reward-rules.service';

@Module({
  providers: [RewardRulesService],
  exports: [RewardRulesService],
})
export class RewardRulesModule {}
