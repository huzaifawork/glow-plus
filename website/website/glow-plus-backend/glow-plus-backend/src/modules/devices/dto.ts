import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PUSH_TOKEN } from '../../common/limits';

/**
 * `POST /me/devices`  (M1 — mobile spec R4.5)
 *
 * The app registers the push token of the installation it is running on, so
 * the platform can tell this customer when a salon confirms, cancels or
 * completes their booking.
 *
 * `platform` is a fixed set rather than a free string: it is written to the
 * database and read by whoever debugs "why did my iPhone not get it", and an
 * open field there fills up with `ios`, `iOS`, `iPhone` and `apple` inside a
 * week.
 */
export class RegisterDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUSH_TOKEN)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web', 'unknown'])
  platform?: 'ios' | 'android' | 'web' | 'unknown';
}

/**
 * `DELETE /me/devices` — stop notifying this installation.
 *
 * Sent on logout, and when the user turns notifications off in the app. A body
 * on a DELETE is unusual but correct here: the token is the identity of the
 * thing being deleted, and putting an `ExponentPushToken[...]` in a path
 * segment means url-encoding brackets that some proxies normalise.
 */
export class UnregisterDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUSH_TOKEN)
  token!: string;
}
