import { collectEnvProblems, isProductionEnv, validateEnv } from './env.validation';

/**
 * T27 — the point of these is that every case below currently *boots green*
 * without the validator, and only misbehaves later, in front of a user.
 */

const REAL_SECRET = 'B9x2Qk7ZtL4vRw8pYc1JmN6sHd3FgU0aEoTiXbVzKrQ=';

const goodProd = (): NodeJS.ProcessEnv =>
  ({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pw@db.example.com:5432/glowplus?pgbouncer=true',
    JWT_SECRET: REAL_SECRET,
    APP_URL: 'https://glowplusmember.com',
    ALLOWED_ORIGINS: 'https://glowplusmember.com',
    STRIPE_SECRET_KEY: 'sk_live_abc123',
    STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
    STRIPE_PRICE_ID_MONTHLY: 'price_month',
    STRIPE_PRICE_ID_ANNUAL: 'price_year',
    EMAIL_PROVIDER: 'resend',
    EMAIL_FROM: 'Glow+ <noreply@mail.glowplusmember.com>',
    RESEND_API_KEY: 're_abc123',
    TRUST_PROXY_HEADER: '1',
  }) as NodeJS.ProcessEnv;

describe('isProductionEnv', () => {
  it('treats a Vercel deployment as production even with NODE_ENV unset', () => {
    // Inferring "not production" from a missing variable would switch the
    // checks off in exactly the situation they exist for.
    expect(isProductionEnv({ VERCEL: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProductionEnv({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProductionEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('does not treat local development as production', () => {
    expect(isProductionEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isProductionEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('collectEnvProblems — always required', () => {
  it('accepts a fully configured production environment', () => {
    expect(collectEnvProblems(goodProd())).toEqual([]);
  });

  it('accepts a minimal local environment', () => {
    expect(
      collectEnvProblems({ DATABASE_URL: 'postgresql://localhost:5433/glowplus', JWT_SECRET: REAL_SECRET } as NodeJS.ProcessEnv),
    ).toEqual([]);
  });

  it('rejects a missing JWT_SECRET even locally', () => {
    const problems = collectEnvProblems({ DATABASE_URL: 'postgresql://x' } as NodeJS.ProcessEnv);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('JWT_SECRET');
  });

  it('rejects the exact placeholder that was once live-exploitable [F20]', () => {
    const env = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'change-me-to-a-long-random-string' } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(env).join()).toContain('placeholder');
  });

  it("rejects jwt.util's old hardcoded fallback", () => {
    const env = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'dev-secret-change-me' } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(env).join()).toContain('placeholder');
  });

  it('rejects the .env.example house style of placeholder', () => {
    const env = {
      ...goodProd(),
      STRIPE_SECRET_KEY: 'sk_test_your_stripe_secret_key_here',
    } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(env).join()).toContain('STRIPE_SECRET_KEY');
  });

  it('rejects a real-but-short JWT_SECRET, not just a missing one', () => {
    // "It is set" is not the property that matters — a short HMAC key is
    // brute-forceable offline from any token the API has ever issued.
    const env = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'shortish-secret' } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(env).join()).toContain('at least 32');
  });
});

describe('collectEnvProblems — production only', () => {
  it('does not demand production vars locally', () => {
    const env = { DATABASE_URL: 'postgresql://localhost/x', JWT_SECRET: REAL_SECRET } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(env)).toEqual([]);
  });

  it('demands every production var when they are absent', () => {
    const problems = collectEnvProblems({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: REAL_SECRET,
    } as NodeJS.ProcessEnv);
    for (const key of ['APP_URL', 'ALLOWED_ORIGINS', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'EMAIL_FROM']) {
      expect(problems.join()).toContain(key);
    }
  });

  it('reports every problem at once, not one per redeploy', () => {
    const problems = collectEnvProblems({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(problems.length).toBeGreaterThan(5);
  });

  it('rejects a localhost APP_URL in production — emailed links would be dead', () => {
    const env = { ...goodProd(), APP_URL: 'http://localhost:3000' };
    expect(collectEnvProblems(env).join()).toContain('APP_URL points at localhost');
  });

  it('rejects localhost left in ALLOWED_ORIGINS in production', () => {
    const env = { ...goodProd(), ALLOWED_ORIGINS: 'https://glowplusmember.com,http://localhost:3000' };
    expect(collectEnvProblems(env).join()).toContain('ALLOWED_ORIGINS');
  });

  it('rejects TRUST_PROXY_HEADER left off behind Vercel — T26 would see one IP for everyone', () => {
    const env = { ...goodProd(), TRUST_PROXY_HEADER: '0' };
    expect(collectEnvProblems(env).join()).toContain('TRUST_PROXY_HEADER');
  });

  it('rejects EMAIL_PROVIDER=log in production — mail would go to stdout', () => {
    const env = { ...goodProd(), EMAIL_PROVIDER: 'log' };
    expect(collectEnvProblems(env).join()).toContain('EMAIL_PROVIDER');
  });

  it('rejects EMAIL_PROVIDER=resend with no API key, in any environment', () => {
    const env = {
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: REAL_SECRET,
      EMAIL_PROVIDER: 'resend',
    } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(env).join()).toContain('RESEND_API_KEY');
  });
});

describe('validateEnv', () => {
  it('returns the config untouched when everything is valid', () => {
    const env = goodProd();
    expect(validateEnv(env as unknown as Record<string, unknown>)).toBe(env);
  });

  it('throws one error listing every problem, so a deploy fails once', () => {
    let message = '';
    try {
      validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'change-me-to-a-long-random-string' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('refusing to start');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('DEPLOYMENT.md');
  });
});
