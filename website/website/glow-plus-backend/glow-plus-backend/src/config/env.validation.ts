/**
 * Boot-time environment validation  (T27)
 *
 * T27 is "get the secrets out of a plaintext `.env` and into Vercel env
 * vars". The move itself is a dashboard action — but doing it *safely* needs
 * this file first, because today every secret in this codebase has a silent
 * fallback:
 *
 *   jwt.util.ts       `process.env.JWT_SECRET ?? 'dev-secret-change-me'`
 *   billing.service   `new Stripe(process.env.STRIPE_SECRET_KEY ?? '')`
 *   *.service         `process.env.APP_URL ?? 'http://localhost:3000'`
 *
 * So a var forgotten in the Vercel dashboard does not fail the deploy. It
 * boots green and then:
 *
 *   - signs every token with a **constant published in this repo**, which is
 *     exactly [F20] — a hand-forged `role:'admin'` token was already proven
 *     accepted (HTTP 200) once, when JWT_SECRET was the `.env.example`
 *     placeholder. A missing var reproduces it perfectly.
 *   - emails real customers password-reset links pointing at `localhost:3000`.
 *   - answers Stripe calls with an empty key and fails at checkout, not boot.
 *
 * Every one of those is invisible until a user hits it. This refuses to start
 * instead, listing everything wrong at once rather than one var per redeploy.
 *
 * Wired into `ConfigModule.forRoot({ validate })` in app.module.ts, so it runs
 * before anything else is constructed.
 */

/** Vars the API cannot do anything useful without, in any environment. */
const ALWAYS_REQUIRED = ['DATABASE_URL', 'JWT_SECRET'] as const;

/**
 * Vars that only *have* to be right once real users and real money are
 * involved. Locally they have workable defaults; in production a default is a
 * silent misconfiguration.
 */
const PRODUCTION_REQUIRED = [
  'APP_URL',
  'ALLOWED_ORIGINS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID_MONTHLY',
  'STRIPE_PRICE_ID_ANNUAL',
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
] as const;

/**
 * Placeholder values that are worse than an empty string: they look like real
 * configuration in a dashboard, so nobody spots them on review. The first two
 * are the actual live-exploitable strings from this project's history — the
 * `.env.example` placeholder ([F20]) and jwt.util's own hardcoded fallback.
 */
const PLACEHOLDERS = [
  'change-me-to-a-long-random-string',
  'dev-secret-change-me',
  'changeme',
  'your-secret-here',
];

function looksLikePlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (PLACEHOLDERS.includes(v)) return true;
  // Covers the `.env.example` house style: sk_test_your_stripe_secret_key_here
  return /(^|[_-])your[_-]/.test(v) || /[_-]here$/.test(v) || v.includes('xxxxx');
}

function isLocalUrl(value: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

/**
 * True when this process is serving real users. `VERCEL` is checked as well as
 * NODE_ENV because a Vercel deployment that forgot to set NODE_ENV is exactly
 * the case these checks exist for — inferring "not production" from a missing
 * variable would disable the validation precisely when it is needed.
 */
export function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL === '1' || env.VERCEL_ENV === 'production';
}

/**
 * Returns every problem found, rather than throwing on the first. A deploy
 * that fails one variable at a time costs one round trip per variable.
 */
export function collectEnvProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  const production = isProductionEnv(env);

  const required = production ? [...ALWAYS_REQUIRED, ...PRODUCTION_REQUIRED] : [...ALWAYS_REQUIRED];

  for (const key of required) {
    const value = env[key];
    if (!value || !value.trim()) {
      problems.push(`${key} is missing or empty${production ? ' (required in production)' : ''}`);
      continue;
    }
    if (looksLikePlaceholder(value)) {
      problems.push(`${key} is still a placeholder value — replace it with a real secret`);
    }
  }

  // Length, not just presence. A short HMAC key is brute-forceable offline
  // from any single token the API has ever issued, so "it's set" is not the
  // property that matters.
  const secret = env.JWT_SECRET?.trim();
  if (secret && !looksLikePlaceholder(secret) && secret.length < 32) {
    problems.push(
      `JWT_SECRET is only ${secret.length} characters — use at least 32 (openssl rand -base64 48)`,
    );
  }

  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY?.trim()) {
    problems.push('EMAIL_PROVIDER is "resend" but RESEND_API_KEY is missing — no email would send');
  }

  if (production) {
    // A localhost APP_URL in production is not a crash, which is why it is
    // dangerous: it ships verification and password-reset links that are dead
    // for every recipient, and the failure lands on the customer, not on us.
    if (env.APP_URL && isLocalUrl(env.APP_URL)) {
      problems.push(`APP_URL points at localhost (${env.APP_URL}) — emailed links would be dead for users`);
    }
    if (env.ALLOWED_ORIGINS && isLocalUrl(env.ALLOWED_ORIGINS)) {
      problems.push(`ALLOWED_ORIGINS still contains localhost (${env.ALLOWED_ORIGINS})`);
    }
    // T26's limiter collapses to a single bucket for the entire internet
    // without this, because every request arrives from Vercel's proxy IP.
    // One abuser would then lock out every user.
    if (env.TRUST_PROXY_HEADER !== '1' && env.TRUST_PROXY_HEADER !== 'true') {
      problems.push(
        'TRUST_PROXY_HEADER must be "1" behind Vercel, or rate limiting counts every visitor as one IP',
      );
    }
    if (env.EMAIL_PROVIDER === 'log') {
      problems.push('EMAIL_PROVIDER is "log" — real emails would be printed to stdout, not sent');
    }
  }

  return problems;
}

/**
 * ConfigModule's `validate` hook. Must return the config object; throwing
 * aborts the boot, which is the whole point.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const problems = collectEnvProblems(config as NodeJS.ProcessEnv);

  if (problems.length) {
    throw new Error(
      [
        '',
        'Environment configuration is invalid — refusing to start.',
        ...problems.map((p) => `  - ${p}`),
        '',
        'Local: copy .env.example to .env and fill it in.',
        'Vercel: Project Settings -> Environment Variables (see DEPLOYMENT.md).',
        '',
      ].join('\n'),
    );
  }

  return config;
}
