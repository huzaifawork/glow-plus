/**
 * Create a Glow+ platform administrator.  [F70]
 *
 * **Why this file has to exist.** There is no admin signup route, and there
 * must not be one: an endpoint that mints platform administrators is a
 * permanent hole in the product for the sake of an action taken once or twice
 * in a deployment's life. But until T63 ran the live stack end to end, that
 * left production with **no way at all** to create the first admin. The only
 * `prisma.admin.create` in the repository was in `prisma/seed.ts`, which
 * refuses to run against a non-local database — correctly, since it seeds
 * known-weak passwords.
 *
 * The consequence was not cosmetic. Every salon signs up **PENDING**, and only
 * `PATCH /admin/merchants/:id/approve` makes one ACTIVE. With zero admins that
 * call could never be made, so no salon could ever go live and the public
 * directory would have stayed empty permanently.
 *
 * **Usage** — from the backend directory, with `DATABASE_URL` pointing at the
 * target database:
 *
 *     npx ts-node scripts/create-admin.ts <email> <password>
 *
 * Deliberately an operator action, run once, rather than a route that exists
 * forever. Unlike `seed.ts` this is *allowed* to touch production — that is
 * the entire point — so the safety comes from the password floor and from
 * refusing to overwrite an existing admin silently.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// The same cost seed.ts and the auth services use. A weaker admin hash than a
// customer hash would be precisely backwards.
const SALT_ROUNDS = 12;

// Matches the API's own floor (auth/dto.ts MIN_PASSWORD) so an admin cannot be
// created with a password the product would refuse from a customer.
const MIN_PASSWORD = 8;

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    fail(
      'Usage: npx ts-node scripts/create-admin.ts <email> <password>\n' +
        'Pass the password as an argument only on a machine you control — it lands in shell history.',
    );
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail(`"${email}" is not a valid email address.`);
  }

  if (password.length < MIN_PASSWORD) {
    fail(`Password must be at least ${MIN_PASSWORD} characters (the API's own floor).`);
  }

  // Named weak passwords, not a character-class rule. This account can approve,
  // suspend and read every salon on the platform; "Admin123!" passing a
  // complexity regex is exactly how that ends up in production.
  const WEAK = ['admin123!', 'password', 'password123', 'changeme', 'glowplus', 'admin@123'];
  if (WEAK.includes(password.toLowerCase())) {
    fail('That password is on the known-weak list. This account can approve or suspend every salon.');
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      // Not an upsert. Silently resetting an administrator's password because
      // someone re-ran a command is not a recovery flow, it is an account
      // takeover that looks like a typo.
      fail(`An admin with ${email} already exists (created ${existing.createdAt.toISOString()}). Refusing to overwrite it.`);
    }

    const total = await prisma.admin.count();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = await prisma.admin.create({ data: { email, passwordHash } });

    // eslint-disable-next-line no-console
    console.log(
      `\n✅ Admin created.\n` +
        `   id:     ${admin.id}\n` +
        `   email:  ${admin.email}\n` +
        `   admins on this database: ${total + 1}\n\n` +
        `   Sign in at POST /v1/admin/login, or the SPA's Admin view.\n` +
        `   The password is NOT stored anywhere else — record it in a password manager now.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n✖ Failed to create admin:', err instanceof Error ? err.message : err, '\n');
  process.exit(1);
});
