import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { RewardRulesModule } from '../reward-rules/reward-rules.module';

@Module({
  imports: [RewardRulesModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
