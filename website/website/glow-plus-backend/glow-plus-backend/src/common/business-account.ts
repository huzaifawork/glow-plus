import { PrismaService } from '../prisma/prisma.service';

/**
 * Is this email address a business-side account?
 *
 * `email` is `@unique` on `User`, `Merchant`, `MerchantStaff` and `Admin`
 * *independently* — nothing at the database level stops one address existing
 * as a consumer row AND an admin row at the same time, each with its own
 * password. That is not hypothetical: a Glow+ admin held a working consumer
 * session in the mobile app because both rows were real and the consumer
 * login only ever read the consumer one.
 *
 * The consumer app is for consumers, so the rule is enforced at all three
 * places a consumer session can begin or continue:
 *
 *   · `AuthService.signupConsumer` — a business address cannot become one,
 *   · `AuthService.loginConsumer`  — an address that became a business account
 *     *after* its consumer account existed stops being able to sign in,
 *   · `RefreshTokenService.claimsFor` — and an already-issued session stops
 *     renewing, rather than outliving the rule for as long as the app is used.
 *
 * One function rather than three copies: three places that must agree on what
 * "not a consumer" means is exactly where a fourth account type gets added to
 * two of them.
 */
export async function hasBusinessAccount(
  prisma: PrismaService,
  email: string,
): Promise<boolean> {
  const [admin, merchant, staff] = await Promise.all([
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
    prisma.merchant.findUnique({ where: { email }, select: { id: true } }),
    prisma.merchantStaff.findUnique({ where: { email }, select: { id: true } }),
  ]);
  return !!(admin || merchant || staff);
}
