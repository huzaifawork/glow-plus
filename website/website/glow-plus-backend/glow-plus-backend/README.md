# Glow+ API

Backend for the Glow+ loyalty platform — NestJS + Prisma + Postgres + Stripe.
Implements the data model and endpoints from the Glow+ Platform Spec:
auth, merchant onboarding, styles, visits, reward rules, billing (with
self-serve cancellation), and the admin approval/metrics endpoints.

## Stack

- **NestJS** (Express adapter) — REST API
- **Prisma + PostgreSQL** — data layer (`prisma/schema.prisma`)
- **Stripe** — subscription billing, checkout, webhooks
- **@nestjs/schedule** — cron jobs (point expiry, nightly rollups, weekly
  merchant reports, trial-ending reminders)

## Local setup

```bash
cp .env.example .env
# fill in STRIPE_SECRET_KEY / STRIPE_PRICE_ID / STRIPE_WEBHOOK_SECRET
# (use `stripe listen --forward-to localhost:4000/billing/webhook` in dev)

docker compose -f docker/docker-compose.yml up -d postgres

npm install
npx prisma migrate dev --name init
npm run start:dev


The API listens on `http://localhost:4000` by default.

## Folder structure

```
src/
  main.ts                  # app bootstrap
  app.module.ts             # wires modules + middleware
  prisma/                   # PrismaService (DB client)
  middleware/                # auth, subscription gating, rate limiting
  modules/
    auth/                    # signup/login, email verification
    merchants/                # onboarding, profile, admin approval reads
    styles/                    # merchant-owned service catalog
    visits/                    # log a visit → award points → check rewards
    reward-rules/                # reward rule CRUD + progress evaluation
    billing/                      # Stripe checkout, cancel/resume, webhooks
    admin/                          # approval queue, MRR, churn
    notifications/                   # transactional email provider stub
  jobs/                       # scheduled background jobs
prisma/schema.prisma          # full data model
docker/                       # docker-compose + API Dockerfile
```

## Key endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | Consumer signup |
| POST | `/auth/login` | Consumer login → JWT |
| POST | `/auth/verify-email` | Consumes an email verification token |
| POST | `/merchants/signup` | Creates merchant + Stripe customer, status `PENDING` |
| GET | `/merchants/me` | Merchant profile (auth required) |
| GET/POST | `/styles` | Merchant's style catalog |
| PATCH | `/styles/:id/activate` \| `/deactivate` | Toggle a style |
| GET/POST | `/reward-rules` | Merchant's reward rules |
| GET/POST | `/visits` | Log a visit; returns any newly unlocked rewards |
| POST | `/billing/checkout` | Stripe Checkout session — `{ plan: "MONTHLY" \| "ANNUAL" }`, $49.99/mo or $479.99/yr, 7-day trial (+30 bonus days for the first 50 founding-member merchants) |
| POST | `/billing/cancel` \| `/resume` | Self-serve cancellation (cancels at period end) |
| POST | `/billing/webhook` | Stripe webhook receiver (raw body) |
| GET | `/admin/merchants/pending` | Approval queue |
| PATCH | `/admin/merchants/:id/approve` \| `/suspend` | Admin actions |
| GET | `/admin/metrics/mrr` \| `/churn` \| `/platform` | Revenue + usage metrics |

## Notes / what's stubbed for a real deployment

- **AdminGuard**: `admin.controller.ts` has no role check yet — every route
  there must be gated on `req.accountRole === 'admin'` before shipping.
- **Email provider**: `notifications/email.provider.ts` logs to stdout.
  Swap in Postmark/SendGrid/Resend.
- **JWT**: `middleware/jwt.util.ts` is a minimal dependency-free HS256
  implementation for readability — fine for this scope, but consider the
  `jsonwebtoken` package plus refresh-token rotation for production.
- **Point expiry**: `jobs/expirePoints.job.ts` is wired up but the schema
  doesn't yet have an `expired` flag on `Visit` — add it if you want
  points to actually lapse after a year.
