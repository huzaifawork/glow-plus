# Environment variables — Glow+ API

Written for **T27** ("secrets out of a plaintext `.env` and into Vercel env
vars"). This is the authoritative list of what the API reads. It was built by
grepping `process.env` across `src/` and `prisma/`, not from memory, so it is
complete as of 2026-08-24.

`src/config/env.validation.ts` enforces this list at boot. A missing or
placeholder secret **fails the deploy** instead of booting green and
misbehaving later — see [Why boot validation](#why-boot-validation).

---

## The variables

| Variable | Secret? | Local | Production (Vercel) | What breaks if it is wrong |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | 🔴 yes | `postgresql://…@localhost:5433/glowplus` | Neon/Supabase **pooled** string (T52/T55) | Nothing starts. A non-pooled string is the most common way Prisma-on-Vercel dies (T55) |
| `JWT_SECRET` | 🔴 yes | 48 random bytes | **A different** 48 random bytes | A weak or shared value means anyone can mint an `admin` token — this already happened once, [F20] |
| `PORT` | no | `4000` | set by Vercel — **do not set** | — |
| `APP_URL` | no | `http://localhost:3000` | `https://glowplusmember.com` | Verification and password-reset emails ship dead `localhost` links to real customers |
| `ALLOWED_ORIGINS` | no | `http://localhost:3000` | the real site origin(s), comma-separated | The website's API calls fail CORS. Must also cover Expo web for Order 2 (T51) |
| `TRUST_PROXY_HEADER` | no | `0` | **`1`** | At `0` behind Vercel every visitor counts as one IP and T26's limiter locks out the whole platform on one abuser |
| `STRIPE_SECRET_KEY` | 🔴 yes | `sk_test_…` | `sk_live_…` when going live | Checkout and billing fail at request time, not boot |
| `STRIPE_WEBHOOK_SECRET` | 🔴 yes | printed by `stripe listen` | from the **production** endpoint (T61) — a different value | Every webhook 400s and subscription state silently stops syncing ([F19] was exactly this) |
| `STRIPE_PRICE_ID_MONTHLY` | no | test-mode price id | live-mode price id | Checkout 400s |
| `STRIPE_PRICE_ID_ANNUAL` | no | test-mode price id | live-mode price id | Checkout 400s |
| `EMAIL_PROVIDER` | no | `resend` | `resend` | `log` prints mail to stdout and sends nothing |
| `RESEND_API_KEY` | 🔴 yes | current key | **rotate first** — see below | No email sends at all |
| `EMAIL_FROM` | no | `Glow+ <noreply@mail.glowplusmember.com>` | same | Resend rejects a From on an unverified domain |
| `POINTS_EXPIRE_AFTER_DAYS` | no | unset → `365` | set explicitly | Points expire on a different schedule than the client expects (T25) |
| `CRON_SECRET` | 🔴 yes | n/a | **add with T54** | Cron routes are unauthenticated, or the jobs never fire |

`NODE_ENV`, `VERCEL` and `VERCEL_ENV` are set by Vercel; the validator reads
them to decide whether the production rules apply. It treats `VERCEL=1` as
production even when `NODE_ENV` is unset, because a deployment that forgot to
set `NODE_ENV` is precisely the case the checks exist for.

## Moving them to Vercel

1. Vercel → Project → **Settings → Environment Variables**.
2. Add each row above, scoped to **Production** (and **Preview** with test-mode
   Stripe keys and a preview `APP_URL`, if previews are used).
3. Mark every 🔴 row as **Sensitive** so it cannot be read back from the UI.
4. Do **not** commit a `.env` for production, and do not add one to the Vercel
   project as a file — the dashboard is the store.
5. Redeploy. If anything is missing the build fails with a list naming every
   problem at once, not one per redeploy.

Local development is unchanged: `cp .env.example .env` and fill it in. `.env`
is gitignored (`.gitignore:3`) and has never been committed — verified with
`git log --all -- "**/.env"`, which returns nothing.

## Why boot validation

Before T27 every secret in the codebase had a silent fallback:

```
jwt.util.ts          process.env.JWT_SECRET ?? 'dev-secret-change-me'
billing.service.ts   new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
*.service.ts         process.env.APP_URL ?? 'http://localhost:3000'
```

So a variable forgotten in the Vercel dashboard would not fail the deploy. It
would boot green, report healthy, and then sign every token — including
`role:'admin'` — with **a constant published in this repository**. That is
[F20] exactly: a hand-forged admin token was already proven accepted (HTTP 200)
once, when `JWT_SECRET` held the `.env.example` placeholder. A missing variable
reproduces it perfectly.

The `jwt.util.ts` fallback is now gone entirely, and the validator rejects the
placeholder strings, secrets under 32 characters, a `localhost` `APP_URL` in
production, `EMAIL_PROVIDER=log` in production, and `TRUST_PROXY_HEADER` left
off behind a proxy. Proven by actually booting the compiled app against bad
values, not only in unit tests.

## ⚠️ Still outstanding — needs the client, not code

**Rotate the Stripe and Resend keys.** They travelled through a zip file and
Fiverr chat. Highest severity first:

1. **`RESEND_API_KEY`** — live, with no test mode. A leak lets anyone send
   email as this account. There are two keys on the account; `glow-plus-dev`
   has never been used and can be deleted during rotation.
2. **`STRIPE_SECRET_KEY`** — currently `sk_test_`, so it cannot move real
   money. Rotate before going live, not urgently.
3. **`STRIPE_WEBHOOK_SECRET`** — test-mode, and regenerated by `stripe listen`
   during development anyway. The production endpoint gets its own (T61).
4. **The Vercel token** the client pasted into Fiverr chat (`vcp_…`).

Rotation is an account action in each provider's dashboard and is deliberately
left to the client. Everything else in T27 is done.
