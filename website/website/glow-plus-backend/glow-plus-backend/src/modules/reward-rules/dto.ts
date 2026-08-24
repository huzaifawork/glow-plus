import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_ID, MAX_NAME } from '../../common/limits';

/**
 * A reward rule's trigger is used as a MODULUS  (T37)
 *
 * `RewardRulesService.evaluate()` computes `progress % rule.triggerValue`.
 * A `triggerValue` of 0 makes that `NaN`, and every comparison against NaN is
 * false — the rule would simply never unlock, silently, for the life of the
 * salon. `@Min(1)` here is what stops a zero ever reaching the column; it is
 * validation standing in for a database constraint, so do not relax it.
 *
 * The ceiling is generous rather than tight: a real punch card is 5 or 10
 * visits and a real points threshold is a few hundred, but nothing breaks at
 * a million, and a cap this high is never something a legitimate salon has to
 * think about. What it does stop is 2^31, which is the number that makes a
 * rule unreachable by construction — the same class of problem T31 fixed on
 * `Style.pointsPerVisit`.
 */
const MAX_TRIGGER_VALUE = 1_000_000;

/** A flat discount is stored in CENTS. This ceiling is $10,000. */
const MAX_FLAT_DISCOUNT_CENTS = 1_000_000;

export enum TriggerTypeDto {
  VISIT_COUNT = 'VISIT_COUNT',
  POINTS_THRESHOLD = 'POINTS_THRESHOLD',
}

export enum RewardTypeDto {
  PERCENT_OFF = 'PERCENT_OFF',
  FLAT_DISCOUNT = 'FLAT_DISCOUNT',
  FREE_SERVICE = 'FREE_SERVICE',
}

/**
 * The reward's own bounds depend on its type, which class-validator cannot
 * express on a single property: 100 is the whole discount for PERCENT_OFF and
 * one dollar for FLAT_DISCOUNT. So the type-specific rules live in
 * `RewardRulesService.normaliseReward()`, and these decorators only carry the
 * bounds that hold whatever the type is. See that method for the rest.
 */
export const REWARD_VALUE_BOUNDS = {
  MAX_PERCENT: 100,
  MAX_FLAT_DISCOUNT_CENTS,
};

export class CreateRewardRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @IsEnum(TriggerTypeDto)
  triggerType!: TriggerTypeDto;

  @IsInt()
  @Min(1)
  @Max(MAX_TRIGGER_VALUE)
  triggerValue!: number;

  /**
   * Optional: restrict the rule to ONE of the merchant's styles.
   *
   * Note this is a Style **id**, not a style *type*. The prototype's rule form
   * offered "Hair only / Nail only / Spa only" — a category — but the column
   * has always been a foreign key to a single Style row. The portal's scope
   * dropdown lists real styles for exactly this reason (T37).
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID)
  styleScopeId?: string;

  @IsEnum(RewardTypeDto)
  rewardType!: RewardTypeDto;

  /** Percent (1–100) or cents, per `rewardType`. Ignored for FREE_SERVICE. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_FLAT_DISCOUNT_CENTS)
  rewardValue?: number;

  /** Required when `rewardType` is FREE_SERVICE — the style being given away. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID)
  freeServiceStyleId?: string;

  @IsOptional()
  @IsBoolean()
  oneTime?: boolean;
}

/**
 * Every field optional — a PATCH that renames a rule must not be forced to
 * resend its economics. `@IsOptional()` is on every one of them deliberately:
 * T29 found that without it, class-validator runs the remaining decorators
 * against `undefined` and refuses a partial update with an error about a field
 * the caller never sent. That bug made it impossible to rename a Style; it is
 * not repeated here.
 */
export class UpdateRewardRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name?: string;

  @IsOptional()
  @IsEnum(TriggerTypeDto)
  triggerType?: TriggerTypeDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_TRIGGER_VALUE)
  triggerValue?: number;

  /** `null` clears the scope back to "any style". */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID)
  styleScopeId?: string | null;

  @IsOptional()
  @IsEnum(RewardTypeDto)
  rewardType?: RewardTypeDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_FLAT_DISCOUNT_CENTS)
  rewardValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID)
  freeServiceStyleId?: string | null;

  @IsOptional()
  @IsBoolean()
  oneTime?: boolean;
}
