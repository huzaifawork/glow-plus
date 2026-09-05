import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_ADDRESS,
  MAX_CITY,
  MAX_EMAIL,
  MAX_NAME,
  MAX_PASSWORD,
  MAX_POSTAL_CODE,
  MAX_REGION,
  MIN_PASSWORD,
} from '../../common/limits';

/**
 * Validation for `POST /merchants/signup`  (T31)
 *
 * This class exists because the route had **no input validation at all**.
 * The controller bound `@Body() dto: MerchantSignupInput`, and
 * `MerchantSignupInput` is a TypeScript **interface** — erased at compile
 * time, so there is no metatype at runtime for `ValidationPipe` to read. Nest
 * silently skips validation for a body it cannot resolve a class for; it does
 * not warn. Every other `@Body()` in the codebase was checked and binds a
 * real DTO class. This was the only one.
 *
 * What that actually allowed, reproduced live against the running API and
 * then confirmed by querying Postgres directly:
 *
 *   - `password: ""` → **a merchant account was created whose empty password
 *     logs in.** `bcrypt.compare('', hash)` returned true on the committed
 *     row. Consumers were safe (their `SignupDto` has `@MinLength(8)`);
 *     salons — the paying side — were not.
 *   - `email: "definitely-not-an-email"` → reached Stripe, which rejected it,
 *     after the password had already been hashed.
 *   - `businessName` absent → `PrismaClientValidationError` → bare 500.
 *   - `password: 99999` → bcryptjs threw "Illegal arguments: number, number"
 *     → bare 500.
 *
 * `whitelist: true` on the global pipe also does nothing without a class, so
 * unknown keys were passed through untouched. `OnboardingService.signup()`
 * builds its Prisma `data` field-by-field, so nothing was mass-assignable —
 * that was luck in the service, not a control here, and it is why this class
 * is the fix rather than a guard in the service.
 */
export class MerchantSignupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  businessName!: string;

  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  // Matches SignupDto's consumer rule. There is no good reason for the
  // paying side of the platform to have a weaker password floor than the
  // free side, which is exactly what it had.
  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  password!: string;

  /**
   * M2 — where the salon is, captured at the moment the salon is created.
   *
   * **Required, and that is the whole point of M2.** The columns have existed
   * since M1 and the portal has had an editor for them since M1, but the only
   * way to fill them in was for an owner to find a settings tab after signing
   * up — so on production every live salon had `city: null`, and the app's
   * city filter and distance sort had nothing to work with. An optional field
   * on a form nobody revisits is not a data source.
   *
   * Asking here costs a signup two text inputs and guarantees that every
   * salon created from now on is findable. `region` and `postalCode` stay
   * optional because they vary by country and neither is needed to place a
   * salon in a city list.
   *
   * ⚠️ Coordinates are deliberately NOT accepted here. They are derived from
   * this address by `geocodeAddress`, and a salon that wants to correct them
   * does so from the portal, authenticated — an unauthenticated route that
   * writes a map pin is a route that writes a map pin for anyone.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ADDRESS)
  addressLine!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CITY)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REGION)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_POSTAL_CODE)
  postalCode?: string;
}
