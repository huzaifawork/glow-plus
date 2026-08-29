import { IsInt, Max, Min } from 'class-validator';
import { SEATS_MAX, SEATS_MIN } from '../../common/limits';

/**
 * T83 — a salon setting how many clients it can serve at once.
 *
 * Its own DTO rather than a general "update my salon" one: this is the only
 * field a salon may change about itself today, and a permissive update body is
 * how `status` or `foundingMember` eventually becomes writable by whoever
 * guesses the field name.
 */
export class UpdateSeatsDto {
  @IsInt()
  @Min(SEATS_MIN)
  @Max(SEATS_MAX)
  seats!: number;
}
