import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_ID } from '../../common/limits';

export class RedeemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ID)
  rewardRuleId!: string;
}
