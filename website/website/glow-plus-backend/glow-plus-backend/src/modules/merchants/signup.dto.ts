import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL, MAX_NAME, MAX_PASSWORD, MIN_PASSWORD } from '../../common/limits';

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
}
