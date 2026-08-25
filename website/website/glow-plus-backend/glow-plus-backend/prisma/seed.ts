/**
 * Glow+ development seed  (T8)
 *
 * Creates a known, ready-to-use merchant + consumer so every later task can be
 * tested against real Postgres in seconds instead of clicking through signup.
 *
 * Idempotent: re-running upserts by email/compound key rather than duplicating.
 *
 *   npm run seed
 *
 * Passwords are hashed with bcrypt at SALT_ROUNDS = 12 — the same cost used by
 * auth.service.ts and onboarding.service.ts — so these accounts log in through
 * the real endpoints. Credentials are deliberately weak and local-only; the
 * script refuses to run against a non-local database (see guard below).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

export const SEED = {
  merchant: { email: 'merchant@glowplus.test', password: 'Merchant123!' },
  consumer: { email: 'consumer@glowplus.test', password: 'Consumer123!' },
  admin: { email: 'admin@glowplus.test', password: 'Admin123!' },
};

/** Refuse to seed anything that isn't obviously a local dev database. */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(url);
  if (!isLocal) {
    throw new Error(
      'Refusing to seed: DATABASE_URL does not point at a local database.\n' +
        'This script creates accounts with known weak passwords and must never ' +
        'run against staging or production.',
    );
  }
}

async function main() {
  assertLocalDatabase();

  const [merchantHash, consumerHash, adminHash] = await Promise.all([
    bcrypt.hash(SEED.merchant.password, SALT_ROUNDS),
    bcrypt.hash(SEED.consumer.password, SALT_ROUNDS),
    bcrypt.hash(SEED.admin.password, SALT_ROUNDS),
  ]);

  // --- Merchant: ACTIVE + verified, so it passes RequireActiveSubscription ---
  const merchant = await prisma.merchant.upsert({
    where: { email: SEED.merchant.email },
    update: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    create: {
      businessName: 'Glow Salon',
      email: SEED.merchant.email,
      passwordHash: merchantHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      foundingMember: true,
    },
  });

  // --- Consumer ---
  const user = await prisma.user.upsert({
    where: { email: SEED.consumer.email },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: SEED.consumer.email,
      name: 'Seed Consumer',
      passwordHash: consumerHash,
      emailVerifiedAt: new Date(),
    },
  });

  // --- Styles. durationMinutes drives booking slot maths (T13/T18). ---
  const styleSpecs = [
    { name: 'Balayage', type: 'HAIR' as const, pointsPerVisit: 50, durationMinutes: 90 },
    { name: 'French Tip Gel', type: 'NAIL' as const, pointsPerVisit: 20, durationMinutes: 45 },
    { name: 'Deep Tissue Massage', type: 'SPA' as const, pointsPerVisit: 40, durationMinutes: 60 },
  ];

  const styles = [];
  for (const spec of styleSpecs) {
    // No unique constraint on (merchantId, name), so find-then-create.
    const existing = await prisma.style.findFirst({
      where: { merchantId: merchant.id, name: spec.name },
    });
    styles.push(
      existing
        ? await prisma.style.update({ where: { id: existing.id }, data: spec })
        : await prisma.style.create({ data: { ...spec, merchantId: merchant.id, active: true } }),
    );
  }

  // --- Reward rules: one visit-count, one points-threshold ---
  const ruleSpecs = [
    {
      name: '5 Visits = 15% Off',
      triggerType: 'VISIT_COUNT' as const,
      triggerValue: 5,
      rewardType: 'PERCENT_OFF' as const,
      rewardValue: 15,
    },
    {
      name: '200 Points = $20 Off',
      triggerType: 'POINTS_THRESHOLD' as const,
      triggerValue: 200,
      rewardType: 'FLAT_DISCOUNT' as const,
      rewardValue: 2000,
    },
  ];

  for (const spec of ruleSpecs) {
    const existing = await prisma.rewardRule.findFirst({
      where: { merchantId: merchant.id, name: spec.name },
    });
    if (!existing) {
      await prisma.rewardRule.create({ data: { ...spec, merchantId: merchant.id, active: true } });
    }
  }

  // --- Admin (T22) ---
  await prisma.admin.upsert({
    where: { email: SEED.admin.email },
    update: {},
    create: { email: SEED.admin.email, passwordHash: adminHash },
  });

  // --- Business hours: Mon-Sat 09:00-17:00, closed Sunday (dayOfWeek 0) ---
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    const closed = dayOfWeek === 0;
    await prisma.businessHours.upsert({
      where: { merchantId_dayOfWeek: { merchantId: merchant.id, dayOfWeek } },
      update: { openTime: '09:00', closeTime: '17:00', closed },
      create: { merchantId: merchant.id, dayOfWeek, openTime: '09:00', closeTime: '17:00', closed },
    });
  }

  const counts = {
    merchants: await prisma.merchant.count(),
    users: await prisma.user.count(),
    admins: await prisma.admin.count(),
    styles: await prisma.style.count({ where: { merchantId: merchant.id } }),
    rewardRules: await prisma.rewardRule.count({ where: { merchantId: merchant.id } }),
    businessHours: await prisma.businessHours.count({ where: { merchantId: merchant.id } }),
  };

  console.log('Seed complete.\n');
  console.log('  merchant :', SEED.merchant.email, '/', SEED.merchant.password, `(id ${merchant.id})`);
  console.log('  consumer :', SEED.consumer.email, '/', SEED.consumer.password, `(id ${user.id})`);
  console.log('  admin    :', SEED.admin.email, '/', SEED.admin.password);
  console.log('  styleId  :', styles[0].id, `(${styles[0].name}, ${styles[0].durationMinutes}min)`);
  console.log('\n  row counts:', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
