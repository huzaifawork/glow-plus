/**
 * Logical backup of the Glow+ database.  (T62)
 *
 * **Why this exists, and what it is NOT.** The production database is on
 * Supabase's **free plan, which takes no backups at all** — no daily snapshot,
 * no point-in-time recovery. A dropped table or a bad migration on a Tuesday
 * is simply gone. The correct fix is the **Pro plan (~$25/mo)**, which adds
 * daily backups and 7-day PITR, and that is a client decision about money
 * rather than something code can solve.
 *
 * Until that decision is made, this is the stopgap: a complete, restorable
 * snapshot of every row, runnable on demand and from any machine.
 *
 * ⚠️ **Be clear about its limits.** This dumps DATA, not schema — restoring
 * assumes `prisma migrate deploy` has already rebuilt the tables. It is a
 * point-in-time copy taken when someone remembers to run it, not continuous
 * protection, so the realistic recovery point is "the last time a human ran
 * this". It does not capture sequences (this schema uses `cuid()`, so there
 * are none) or Supabase-side objects like auth or storage. **It is a safety
 * net, not a substitute for real backups.**
 *
 * ⚠️ **The output file is SENSITIVE.** It contains bcrypt password hashes and
 * AES-GCM encrypted phone numbers. The ciphertext is useless without
 * `ENCRYPTION_KEY`, which is exactly why that key must never be stored beside
 * a dump. `backups/` is gitignored.
 *
 *     npm run backup                 # -> backups/glowplus-<iso>.json
 *     npm run backup -- --out path   # explicit destination
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Order matters for restore: parents before children, so a foreign key never
 * points at a row that does not exist yet. This is the topological order of
 * the schema's relations, and it is the same order `restore` must replay.
 */
const TABLES = [
  'admin',
  'user',
  'merchant',
  'subscription',
  'merchantStaff',
  'staffInvite',
  'style',
  'rewardRule',
  'businessHours',
  'visit',
  'redemption',
  'booking',
  'emailVerification',
  'passwordReset',
  'refreshToken',
] as const;

async function main() {
  const outFlag = process.argv.indexOf('--out');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath =
    outFlag !== -1 && process.argv[outFlag + 1]
      ? process.argv[outFlag + 1]
      : path.join(process.cwd(), 'backups', `glowplus-${stamp}.json`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const data: Record<string, unknown[]> = {};
  let total = 0;

  for (const table of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any)[table].findMany();
    data[table] = rows;
    total += rows.length;
    // eslint-disable-next-line no-console
    console.log(`  ${table.padEnd(20)} ${rows.length}`);
  }

  const host = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//***@');
  const payload = {
    meta: {
      takenAt: new Date().toISOString(),
      // Recorded so a dump can never be restored into the wrong database by
      // accident, and so "which environment was this?" is answerable later.
      source: host,
      tableOrder: TABLES,
      rowCount: total,
      note: 'Data only. Run `prisma migrate deploy` before restoring. Restore in tableOrder.',
    },
    data,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), { encoding: 'utf8' });

  const bytes = fs.statSync(outPath).size;
  // eslint-disable-next-line no-console
  console.log(
    `\n✅ ${total} rows -> ${outPath} (${(bytes / 1024).toFixed(1)} KB)\n` +
      `   ⚠️  Contains password hashes and encrypted PII. Store it somewhere private,\n` +
      `      and never beside ENCRYPTION_KEY.\n`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('\n✖ Backup failed:', err instanceof Error ? err.message : err, '\n');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
