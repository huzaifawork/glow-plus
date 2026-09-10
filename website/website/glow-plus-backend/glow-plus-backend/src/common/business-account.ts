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
  return (await findBusinessAccount(prisma, email)) !== null;
}

/** Which kind of business account an address belongs to, if any. */
export type BusinessAccountKind = 'admin' | 'merchant' | 'merchantStaff';

/**
 * The same question, but the answer says WHICH table matched.
 *
 * Added because the refusal it produces is deliberately vague — "a business or
 * admin account", never which one, so the message cannot be used to enumerate
 * who is a salon owner. That is right for the customer, and it left the
 * operator with the same blank: a Google sign-in was refused for an address
 * that was visibly not in the `Admin` table, and there was no way to tell
 * without opening two more tables by hand. Callers log the kind server-side
 * and keep telling the caller nothing.
 *
 * ── `insensitive` ─────────────────────────────────────────────────────────
 * Off by default, so `hasBusinessAccount` keeps behaving EXACTLY as it did for
 * password login. `email` is `@unique` per table and Postgres compares text
 * case-sensitively, so a consumer signed in today with `bob@x.com` while a
 * merchant row read `Bob@x.com` — turning that on globally would lock out
 * accounts that work right now, which is not a change to make in passing.
 *
 * The Google path opts in, and must: it normalises the address Google returns
 * to lower case before looking anything up, so without this a merchant stored
 * in mixed case would slip through a check that password login would fail.
 * A normalisation must not become a bypass.
 */
export async function findBusinessAccount(
  prisma: PrismaService,
  email: string,
  { insensitive = false }: { insensitive?: boolean } = {},
): Promise<{ kind: BusinessAccountKind; email: string } | null> {
  // An absent address is not a business account, and asking would be worse
  // than useless. `findFirst` treats an `undefined` filter as NO FILTER — so
  // `where: { email: undefined }` returns whichever admin row happens to come
  // back first, and every caller would read that as "yes". `findUnique`, which
  // this replaced, threw on the same input instead. Guarding here rather than
  // at each of the three call sites, because it is a property of the query
  // shape and not of any one caller.
  if (typeof email !== 'string' || email.trim() === '') return null;

  const where = insensitive
    ? { email: { equals: email, mode: 'insensitive' as const } }
    : { email };
  const select = { id: true, email: true };

  // `findFirst` rather than `findUnique`: the insensitive form is not an
  // equality on the unique key, so it is not a `findUnique` argument at all.
  const [admin, merchant, staff] = await Promise.all([
    prisma.admin.findFirst({ where, select }),
    prisma.merchant.findFirst({ where, select }),
    prisma.merchantStaff.findFirst({ where, select }),
  ]);

  if (admin) return { kind: 'admin', email: admin.email };
  if (merchant) return { kind: 'merchant', email: merchant.email };
  if (staff) return { kind: 'merchantStaff', email: staff.email };
  return null;
}
