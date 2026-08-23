# Glow+ — Task Tracker

**Analysis date:** 2026-08-23 · **Status:** `[ ]` todo · `[~]` partial · `[x]` done & tested · `[!]` blocked / needs decision

### Where each task comes from

Not every task here was asked for by the client. Three categories:

1. **Client-requested** — on the docx's 23-item priority list and/or in the Fiverr chat. This covers Phases 2, 3, 4, 8 and 9 almost entirely. These are the contractual deliverables.
2. **Required to make client-requested work possible** — not named by the client, but their requests are impossible without them. T13/T14 are the clearest case: the client asks to "run the booking workflow against the real PostgreSQL database", which cannot happen while the module doesn't compile, isn't imported, and has no tables.
3. **Mine — housekeeping or enablers** — marked `[MINE]`. T2 (flatten nesting), T8 (seed script), T10–T12 (test tooling). None are contractual; drop them freely if time is short.

**Phase 5 (website build) is the exception worth flagging:** it is *not* on the client's list, but it is not optional either — the client believes the frontend already works [F9][F10]. That gap needs raising with them, not quietly absorbing.

---

## Scope

**In scope now (Order 1): backend + website.**
**Not in scope:** the mobile app source (`glow-plus-mobile app/`) — that's Order 2. Treat it as **read-only reference** for API contracts.
**Out of scope entirely:** App/Play Store publishing, code signing, developer fees (agreed 2026-08-19).

The backend must be built so the future React Native app connects with **zero backend rework** — see Phase 7.

## Working agreement

Per task: **implement → test by actually running it → record evidence → tick the box → commit & push referencing the task number.** No batching, no testing at the end.

- **Backend task** = call the real endpoint against real Postgres; verify the DB row changed, and that the unauthorized case is refused.
- **Frontend task** = load in a browser, click the flow against the running backend, check the network call, the error state, and mobile width.
- **Cross-cutting** = one continuous journey: browser → API → DB → UI.

Why this is strict: the exact problem we were hired to fix is *"functionality that exists vs. functionality that's been validated."* Two features the client wants most were written but never watched running — and T13 below proves one of them **could never have worked**.

### Servers stay running so both sides can test

The dev servers run in the background for the whole session, so testing isn't only my report — it can be verified independently in a browser at any time.

| What | URL | Notes |
|---|---|---|
| Backend API | `http://localhost:4000` | NestJS, `npm run start:dev` — hot-reloads on save |
| Website | `http://localhost:3000` | matches the backend's `APP_URL`/`ALLOWED_ORIGINS` |
| Postgres | `localhost:5433` | Docker, matches `DATABASE_URL` |
| Stripe CLI | — | `stripe listen --forward-to localhost:4000/billing/webhook` |

Rules:
- Servers start at T3/T4 and **stay up** — not started and stopped per task.
- After finishing a task, state **exactly what to click or call** to verify it (URL, page, or request), so it can be re-checked independently.
- If a server dies or a port is taken, say so immediately rather than reporting a task as passing.
- **Requires Docker Desktop running** for Postgres — the one dependency that must be up first.

---

## Verified findings (checked in the files, 2026-08-23)

| # | Finding | Evidence |
|---|---|---|
| F1 | **Bookings + BusinessHours modules are never imported** — the booking feature isn't loaded at all | `src/app.module.ts` imports list |
| F2 | **Booking/BusinessHours tables don't exist in the DB** — schema is split across two files | only migration `20260812153753_init` creates 9 tables, none of them Booking |
| F3 | **Rate limiting is applied to nothing.** Worse than the client thinks — they believe `/auth/login` is covered | `rateLimit.middleware.ts` has zero references anywhere in `src/` |
| F4 | **Nothing writes to `Redemption`** | no create/update on redemption in `src/` |
| F5 | **No password-reset code exists at all** | zero matches for reset/forgot in `src/` |
| F6 | **`MerchantStaff` table exists but zero code uses it** | model + migration present, no code references |
| F7 | **`/admin/*` has no guard** — the code comments admit it | `admin.controller.ts:3-5` |
| F8 | **`expirePoints` writes `data: {}`** — a literal no-op placeholder | `expirePoints.job.ts` |
| F9 | **The website is an artifact prototype, not an app** — 0 `fetch`, 0 password fields, data layer is `window.storage` (doesn't exist in browsers) | `Glow-Plus-Website .html` (1,932 lines) |
| F10 | **The original dev says the frontend needs "their own, much bigger buildout"** | `glow-plus-frontend/README.md`, final section |
| F11 | Email provider **does** support Resend; defaults to `log` | `email.provider.ts` — set `EMAIL_PROVIDER=resend` |
| F12 | JWT is hand-rolled HS256, fixed 7-day, **no refresh** | `jwt.util.ts` |
| F13 | No `/health` endpoint | no matches in `src/` |
| F24 | **The auth-switch links never worked.** A "Go to business login" / "Go to customer login" anchor was nested inside a `[data-i18n]` element, and `applyStaticTranslations()` overwrote that element's `innerHTML` with the plain-text translation — destroying the anchor on first render. The `business_login_link` key exists in all 8 languages and is referenced by nothing | `Glow-Plus-Website .html:426,466` vs `applyStaticTranslations()` |
| F25 | **Mobile overflows horizontally** — at a 390px viewport the document is 401px wide because the `.topnav` buttons don't wrap. Measured identically on the original, so it is pre-existing, not migration damage → **T39** | Chromium, both versions, session 3 |
| F26 | **`footer_note` is now factually wrong** — it reads "data is shared & persisted live for everyone previewing this page", true of the artifact's shared `window.storage`, false of per-browser `localStorage`. Needs a copy change or the API wiring that makes it true again | `translations.js`, key `footer_note` |
| F29 | **🔴 Cross-tenant data leak: a CONSUMER token reads merchant-only routes.** `GET /styles` with a consumer's token returns **HTTP 200 and every style row** — reproduced live. Cause: 19 controller call sites pass `req.merchantId!`, and the `!` is a lie — a consumer's token has no `merchantId`, so `undefined` reaches `findMany({ where: { merchantId } })`, **Prisma drops an `undefined` filter**, and the query returns the whole table instead of one merchant's rows. The seed DB has one merchant so the response looked plausible; with two merchants it returns both. `GET /visits` behaves identically (empty only because there are no visit rows). Writes fail closed by luck — `POST /styles` 500s because Prisma rejects a null required column, not because anything checked. **There is exactly ONE role check in the whole codebase** (`bookings.controller.ts:39`) and it selects a branch rather than denying. → **T29**, and it makes T22's admin guard part of a bigger pattern | reproduced live 2026-08-23 |
| F30 | **🔴 The subscription paywall does not work — `RequireActiveSubscriptionMiddleware` never runs.** Registered in `app.module.ts` for `styles/(.*)`, `visits/(.*)`, `reward-rules/(.*)`, it matches **none** of the real paths — not `/styles`, not `/styles/`, not `/styles/abc`. Proved commercially, not just structurally: with the merchant set to **`SUSPENDED`**, `GET /styles` still returned **200** and `POST /styles` still returned **201 and created the row**. So a cancelled or suspended merchant keeps full use of the product. This is the same class of defect as [F3] (rate limiting applied to nothing) — middleware that exists, reads correctly, and is wired to nothing. Note the middleware's own `if (!req.merchantId) throw ForbiddenException` **would have caught [F29]** had it ever executed. → **T29** (+ revisit the note under T14 about booking routes deliberately not being behind it) | reproduced live 2026-08-23 |
| F27 | **`POST /auth/signup` returns 500 *after* creating the account.** `signupConsumer` creates the user and then awaits `sendVerificationEmail`, which throws when Resend refuses the recipient — `403 "You can only send testing emails to your own email address"` [R6]. The row is committed, so the client sees a failure, cannot retry (409), and never receives a verification email. **Pre-existing, not introduced by T16** — before the filter it was the same 500, just without the `error` key. The email send should not be able to fail the signup: queue it, or catch and surface via `POST /auth/resend-verification`. → **T19/T21/T60** | reproduced live 2026-08-23, backend log |
| F28 | **Signup's duplicate check is a check-then-create race.** `findUnique` then `create` with no transaction or constraint handling. Four concurrent signups on one fresh email: 1 succeeded, **3 raised Prisma `P2002`** — which before T16 were bare 500s. T16 now maps them to a correct 409, so the race degrades safely, but the real fix is to drop the pre-check and rely on the unique constraint. → **T31** | reproduced live 2026-08-23 |
| F14 | **The backend source does not compile.** `nest start` fails with 7 TS2307 errors before it reaches the DB | dry run 2026-08-23 |
| F15 | **`bookings/` + `business-hours/` exist ONLY at `src/modules/booking/src/modules/…`** — an unzipped delivery dumped in with its full path preserved, so every relative import (`../../prisma/prisma.service`) resolves to nothing. There is no top-level `src/modules/bookings/` | `find src -type f` |
| F16 | `reward-rules` is genuinely duplicated — a real wired copy at `src/modules/reward-rules/` and a second inside the nested delivery | same |
| F17 | **Docker is not installed on this machine**, and there's no local Postgres — so T3 cannot run as written | dry run |
| F18 | Confirmed at runtime: **zero booking/business-hours routes registered** | boot log route map |

### Dry-run results (2026-08-23, servers started then stopped)

| Component | Result |
|---|---|
| Website (`glow-plus-frontend`, :3000) | ✅ **Runs.** Serves `/`, `/config.js`, `/verify-email` — all 200. `GLOW_API_BASE_URL` correctly points at :4000 |
| Backend from source (`nest start`) | ❌ **Fails to compile** — 7 errors, all from the nested booking folder [F14][F15] |
| Backend from prebuilt `dist/` | ⚠️ **Boots and maps all routes**, then **crashes: Prisma `P1001`, cannot reach DB.** `dist/` is also stale — it predates the booking folder |
| Postgres | ❌ **Docker not installed** [F17] |
| Node / npm | ✅ v24.11.1 / 11.6.2 — note Node 24 is newer than NestJS 10 + Prisma 5 typically target; watch for surprises |

**Conclusion: the delivered backend cannot start in its current state.** Not merely untested — it does not build. T13/T14 are therefore prerequisites for T4, not later cleanup.

**Only 3 HTML files exist in the entire delivery.** There is no React/Next/Vite app anywhere — confirmed against the zip and both extracted folders.

---

# PHASE 0 — Make the project testable *(do first)*

- [x] **T1 — `.gitignore`, `git init`, first commit.** ✅ **DONE & PUSHED 2026-08-23.** Repo: <https://github.com/huzaifawork/glow-plus> (private).
  - [x] `.gitignore` created at project root
  - [x] `.env.example` sanitized — **it contained real Stripe + Resend secrets**, now placeholders (real values remain in the gitignored `.env`)
  - [x] `git init` — repo initialised on branch `main`
  - [x] `git add -A` + audit: **90 files staged, verified clean.** No `.env`, `node_modules/`, `*.zip`, `stripe.exe`, `*.pem`, `*.key` or `dist/` staged. `git check-ignore` confirms each is excluded *by rule*, not by absence. Staged **content** also scanned for live `sk_live_`/`sk_test_`/`whsec_`/`re_`/`vcp_`/AWS/private-key patterns — no matches.
  - [x] First commit — `9d42151`, 90 files, 30,235 insertions, tree clean. Author `huzaifawork <mhuzaifatariq7@gmail.com>`; no AI co-author trailer (applies to all future commits).
  - [x] Create GitHub repo and push — pushed to `origin/main` at `https://github.com/huzaifawork/glow-plus.git`. Verified: remote `main` SHA `9d42151` matches local exactly; branch tracking set.
- [-] **T2 — Flatten the folder nesting.** `[MINE]` ⏭️ **SKIPPED DELIBERATELY 2026-08-23.** Purely cosmetic; breaks nothing. Its only real argument was "free before the first commit", and that window closed at T1 — moving ~90 files now would make the history noisy for zero functional gain. The stray `{prisma,src` artifact is a set of **empty directories** (0 files), so git never tracked it and it cannot affect a build or deploy. Revisit only if the nesting actively causes a deploy-path problem in Phase 8.
  **Cosmetic — breaks nothing. Optional, and safe to skip.** The only real argument for doing it is timing: doing it *before* the first commit is free, whereas moving files later makes git history noisy. If skipping, do so deliberately.
  ⚠️ **Do not confuse this with T13**, which relocates `src/modules/booking/src/modules/…` and **is mandatory** — that one is the cause of the 7 compile errors.
- [x] **T3 — Postgres up.** ✅ **DONE 2026-08-23.** Docker Desktop 29.7.2 installed; container `docker-postgres-1` running Postgres 16.15 on port 5433, database `glowplus`, `pg_isready` confirms accepting connections. No tables yet — migrations not run. Restart with `docker compose -f docker/docker-compose.yml up -d postgres` (⚠️ `docker` is on **no** PATH here — not Git Bash's, not PowerShell's. Docker Desktop is installed to a non-standard location; call the binary by full path:
  `& "$env:LOCALAPPDATA\Programs\DockerDesktop
  `& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" ps`)
- [x] **T4 — Backend boots on :4000.** ✅ **DONE & VERIFIED 2026-08-23.** Unblocked by T13. `npm run start:dev` boots clean: **34 routes mapped, `Nest application successfully started`, and zero `P1001`** — the DB-unreachable crash from the earlier dry run is gone, so Prisma is genuinely connected to Postgres on :5433. Live check: `GET /bookings/me` → 401 and `GET /styles` → 401 (server alive, auth enforced). Server is **still running** in the background for independent testing.
- [x] **T5 — Fix malformed `EMAIL_FROM` in `.env`.** ✅ **DONE & VERIFIED 2026-08-23.**
  **Root cause:** line 16 was `"EMAIL_FROM="Glow+ <onboarding@resend.dev>"` — a **stray leading double-quote**, so dotenv parsed the key as `"EMAIL_FROM` (quote included) and `process.env.EMAIL_FROM` was **undefined**.
  **Why it stayed hidden:** `email.provider.ts:18` falls back to `'Glow+ <onboarding@resend.dev>'` — the identical value — so locally nothing looked broken. The real damage is in production: any deployed `EMAIL_FROM` (e.g. a verified custom domain after T60) would be **silently ignored** and every email would ship from the default sender. Worth re-checking at T53/T60.
  **Evidence:** `node -e "require('dotenv').config()"` → `EMAIL_FROM = "Glow+ <onboarding@resend.dev>"`, and no stray quote-prefixed key present. `.env` is gitignored, so the fix is local-only; `.env.example` already carried the correct form.
  **Also hardened `.gitignore` while here:** the pattern was `.env` + `.env.local` + `.env.*.local`, which does **not** match `.env.bak`, `.env.save` or `.env.production`. A backup of the live `.env` made during this fix was therefore committable. Now `.env.*` with `!.env.example`; all variants verified ignored, `.env.example` verified still tracked.
- [~] **T6 — Resend sends for real.** ⏸️ **DEFERRED by agreement 2026-08-23** — to be done when the email tasks (T19/T20) come up, together with domain verification (T60). Account access is now in hand. Verified read-only: key is live (`GET /api-keys` → 200) but **no domain is verified** (`GET /domains` → `[]`), so sending is still capped at `onboarding@resend.dev` → account owner's address only [R6].
- [x] **T7 — Stripe CLI forwarding works.** ✅ **DONE & VERIFIED 2026-08-23** — and it uncovered a real bug.
  **Forwarding:** `stripe.exe listen --forward-to localhost:4000/billing/webhook`, authenticated with the `.env` test key (no interactive `stripe login` needed — the CLI had no stored key). Confirmed the CLI's signing secret **matches `STRIPE_WEBHOOK_SECRET` in `.env`** (compared programmatically; value never printed).
  **🐛 Bug found and fixed — the webhook rejected every single event with 400.** `billing.controller.ts:32` reads `req.rawBody`, but nothing ever set it: `billing.module.ts` applies `express.raw()` to the route, yet Nest's **global JSON body parser runs first and consumes the stream**, so `express.raw()` no-ops and `req.rawBody` stays `undefined`. `stripe.webhooks.constructEvent()` then failed signature verification on all traffic.
  **Fix:** `rawBody: true` on `NestFactory.create()` in `main.ts` (Nest ≥9.3; running 10.4.22), which retains the untouched bytes on `req.rawBody`.
  **Evidence:** same `stripe trigger payment_intent.succeeded`, before vs after — **4 × `[400]` → 4 × `[200]`** at `POST /billing/webhook`.
  ⚠️ **This means no Stripe webhook has ever been processed successfully in this codebase** — `checkout.session.completed`, `customer.subscription.*` and `invoice.payment_failed` were all silently 400ing. Directly relevant to T17 and T20, and the reason T57 must re-verify this under Vercel's serverless adapter.
- [x] **T8 — Seed script.** `[MINE]` ✅ **DONE & VERIFIED 2026-08-23.** `prisma/seed.ts`, run with `npm run seed`.
  Creates an **ACTIVE + email-verified** merchant (so it passes `RequireActiveSubscription`), a verified consumer, 3 styles with real `durationMinutes` (90/45/60 — needed for booking slot maths), 2 reward rules (one `VISIT_COUNT`, one `POINTS_THRESHOLD`), and business hours Mon–Sat 09:00–17:00 with Sunday closed.
  **Idempotent** — upserts by email / `merchantId_dayOfWeek`; re-run leaves counts unchanged (`{merchants:1, users:1, styles:3, rewardRules:2, businessHours:7}` both times).
  **Guarded:** refuses to run unless `DATABASE_URL` points at localhost/127.0.0.1/docker — these are known weak passwords and must never reach staging or production.
  **Verified through the real endpoints, not just the DB:** `POST /merchants/login` and `POST /auth/login` both return a JWT for the seeded credentials; a wrong password returns 401. Passwords are bcrypt at `SALT_ROUNDS = 12`, matching `auth.service.ts` / `onboarding.service.ts`.
  Credentials: `merchant@glowplus.test / Merchant123!` · `consumer@glowplus.test / Consumer123!`
  Added `ts-node` as a devDependency (it wasn't installed).
- [x] **T9 — Jest configured + passing tests.** ✅ **DONE 2026-08-23.** Jest was a dependency with **no config and no specs**; added `jest` config to `package.json` (ts-jest transform, `*.spec.ts`), installed the missing `ts-jest` + `@types/jest`, and added scripts `test`, `test:watch`, `test:cov`.
  First suite: `src/middleware/jwt.util.spec.ts` — **8 tests, all passing.** Covers sign/verify round-trip, `merchantId` preservation, the 7-day default expiry (documents current behaviour so T47's refresh-token change is visible), expired-token rejection, **tampered-payload rejection**, and malformed tokens. Chosen because every authenticated route depends on it and it's pure — no DB, no network, so it can't flake.
- [x] **T10 — Auth'd request helper.** ✅ **DONE & VERIFIED 2026-08-23.** `scripts/api.sh` — logs in as a seeded account, **caches the JWT** to `$TMPDIR/glow-tokens/<role>.jwt`, re-validates it before reuse and silently re-logs-in if it's expired or rejected.
  `./scripts/api.sh merchant GET /bookings` · `./scripts/api.sh consumer GET /bookings/me` · `./scripts/api.sh public GET '/business-hours/<id>'` · `./scripts/api.sh token merchant` · `./scripts/api.sh reset`
  Prints the response plus `--- HTTP <code> ---`, so the unauthorized case is visible in the same output. **Verified:** both roles authenticate and return `200 []`, tokens land in the cache, and `public` sends no `Authorization` header.
- [x] **T11 — Website served over HTTP against the backend.** ✅ **DONE & VERIFIED 2026-08-23.** Frontend running on :3000 (`npm start`). Pages: `/` 200, `/verify-email` 200, `/business/billing` 200 (serves `billing-result.html` — the route is `/business/billing`, not `/billing-result`), `/config.js` 200 serving `window.GLOW_API_BASE_URL = "http://localhost:4000"`.
  **CORS verified from the real browser origin:** `Origin: http://localhost:3000` → `Access-Control-Allow-Origin: http://localhost:3000` + `Allow-Credentials: true`; preflight `OPTIONS` → 204 with correct `Allow-Methods`/`Allow-Headers`; and **`Origin: http://evil.example.com` is NOT echoed back** (0 matches), so the allowlist genuinely restricts.
- [-] **T12 — Playwright + 1 browser smoke test.** ⏭️ **SKIPPED DELIBERATELY 2026-08-23** (agreed with the user). `[MINE — test tooling, not client-requested]`
  **Why:** the only pages that currently exist are `verify-email` and `billing-result`. The real UI is Phase 5 (T33–T41) and doesn't exist yet, so a browser smoke test today would assert almost nothing while adding a browser-download step to every CI run. **Revisit at the start of Phase 5**, where it has real surface to test. Jest (T9) is in place, so tests can still accumulate per task in the meantime.

# PHASE 1 — Repair the foundation

> **T13/T14 are now the true first coding tasks** — the project doesn't compile without them [F14].

- [x] **T13 — Merge the two Prisma schemas + relocate the nested delivery.** ✅ **DONE & VERIFIED 2026-08-23.**
  **What was done:** `git mv`'d `src/modules/booking/src/modules/{bookings,business-hours}` up to `src/modules/`; deleted the nested `reward-rules` copy [F16]; merged the orphan schema into `prisma/schema.prisma`; deleted the orphan and the now-empty `src/modules/booking/` tree.
  **Correction to this task's own description:** the relative imports were **never broken**. They were written for `src/modules/bookings/` all along (`../../prisma/prisma.service` → `src/prisma/prisma.service` ✓, `../notifications/email.provider` ✓, `../reward-rules/...` ✓) — they simply weren't *at* that path. So T13 was a pure move; **no import rewriting was needed or done.**
  **Duplicate check before deleting:** nested vs top-level `reward-rules.module.ts` and `reward-rules.service.ts` were **byte-identical** (`diff` clean), so nothing was lost.
  **Schema merge — `prisma/schema.prisma` was treated as authoritative** (it owns the applied migration and is the richer of the two). Added from the orphan only what the booking code actually needs:
    · `model Booking` + `enum BookingStatus` · `model BusinessHours` with `@@unique([merchantId, dayOfWeek])` (required — `availability.service.ts:38` looks up by the compound key `merchantId_dayOfWeek`)
    · `Style.durationMinutes Int @default(30)` (required — `availability.service.ts:44`, `bookings.service.ts:27`)
    · `Visit.bookingId String? @unique` + relation (required — `bookings.service.ts` `complete()`)
    · back-relations on `User`, `Merchant`, `Style`
  **Deliberately NOT carried over from the orphan:** `Merchant.foundingBadge` (real code uses `foundingMember`, 5 refs in `billing.service.ts` + `onboarding.service.ts`) and `User.phoneFingerprint` (zero code references; belongs to the T31b phone-encryption decision, not here).
  **Evidence:** `prisma validate` → valid · migration `20260823143506_add_booking_and_business_hours` generated via `migrate diff` and applied with `migrate deploy` · **real Postgres now has 11 tables incl. `Booking` + `BusinessHours`** (was 9), plus `Style.durationMinutes` and `Visit.bookingId` — confirmed by querying `information_schema.columns` · **`tsc --noEmit` → 0 errors**, so [F14]'s 7 × TS2307 are resolved and the backend compiles for the first time.
  ⚠️ `migrate dev` cannot run here (non-interactive shell); use `migrate diff` → write `migration.sql` → `migrate deploy` for all future migrations.
  **Not yet routable** — the modules still aren't imported anywhere. That's T14.
- [x] **T14 — Wire `BookingsModule` + `BusinessHoursModule` into `app.module.ts`.** ✅ **DONE & VERIFIED 2026-08-23.** [F1]
  **Also required, not just the imports:** `AuthMiddleware` **throws 401 when no bearer token is present**, and it is applied to `'*'`. Both controllers document public endpoints (`bookings.controller.ts:14` "browsing available times shouldn't require an account", `business-hours.controller.ts:10`), so merely importing the modules would have left those endpoints 401-ing and *not* public. Added two exclusions, scoped to `GET` so the merchant-only `PUT /business-hours` stays protected: `bookings/availability` and `business-hours/(.*)`. (Partially pre-empts T48.)
  **Evidence:** boot log shows `BookingsModule` + `BusinessHoursModule` dependencies initialized and **all 10 routes mapped** — `/bookings/availability`, `/bookings` (POST, GET), `/bookings/me`, `/bookings/:id/{cancel,confirm,no-show,complete}`, `/business-hours/:merchantId`, `/business-hours` (PUT). [F18] is resolved: booking routes now register.
  **Note for T29:** merchant-only booking routes are **not** behind `RequireActiveSubscription` (it's path-based, and `bookings/*` mixes consumer and merchant routes — blanket-applying it would break consumer booking). Deliberate; flagged for the authorization audit.
- [x] **T15 — Add `GET /health`.** ✅ **DONE & VERIFIED 2026-08-23.** [F13]
  **Two routes, deliberately split** (`src/modules/health/health.controller.ts`):
  - `GET /health` — **liveness**. Process is up. No DB, no I/O. `{ status, uptime, timestamp }`.
  - `GET /health/ready` — **readiness**. Runs `SELECT 1` through Prisma. `{ status, database: { status, latencyMs }, timestamp }`, and **503** with `database.code` when the DB is unreachable.

  **Why two and not one:** a single DB-checking `/health` is the version that bites later. On Vercel (Phase 8) a frequently-polled probe that opens a DB connection every time eats the connection budget T55's pooling exists to protect; and a liveness probe that fails during a DB blip makes the platform kill a process that is actually fine. Split, the platform polls the cheap one and the deploy gate polls the honest one.
  **Public by necessity:** both are excluded from `AuthMiddleware` in `app.module.ts` (GET only). Without that, every probe 401s and reads as "the API is down".
  **Evidence — the failure path was tested, not just the happy one:**
  | Check | Result |
  |---|---|
  | `GET /health` no token | **200** `{"status":"ok","uptime":27,…}` |
  | `GET /health/ready` no token | **200** `{"database":{"status":"up","latencyMs":27}}` |
  | control: `GET /bookings/me` no token | **401** — auth still enforced elsewhere, the exclusion is scoped |
  | **Postgres container stopped** → `GET /health` | **200** — liveness correctly unaffected by a DB outage |
  | **Postgres container stopped** → `GET /health/ready` | **503** `{"status":"error","database":{"status":"down","code":"P1001"}}` |
  | Postgres restarted → `GET /health/ready` | **200**, `latencyMs: 1` — recovers on its own, no API restart needed |

  **Error message is not echoed back** — only the Prisma code. The driver message can carry the DB host and credentials; `code` alone is enough to diagnose and safe to expose publicly.
  **Tests:** `src/modules/health/health.controller.spec.ts` — 4 specs incl. the 503 path and a leak check. Suite now **12 passing** (was 8).
  **Verify independently:** `curl -i http://localhost:4000/health` and `curl -i http://localhost:4000/health/ready`.
- [x] **T16 — Global exception filter.** ✅ **DONE & VERIFIED 2026-08-23.** `src/common/all-exceptions.filter.ts`, registered in `main.ts`. Envelope is now `{ statusCode: number, message: string, error: string, details?: string[] }` for **every** failure.
  **Two things were genuinely broken, both confirmed by calling the running API before the change:**
  1. **Validation returned `message` as an ARRAY.** The RN client does `throw new Error(body.message || …)` (`client.js:25`), so an array reached the user comma-joined by `Error`'s own stringification — working by accident and unrenderable as one clean message. Now `message` is the first validation error and **the full list moves to `details`**, so nothing is lost but the type never changes per response.
  2. **Any non-`HttpException` returned `{"statusCode":500,"message":"Internal server error"}` with NO `error` key.** So the "stable envelope" was not stable in exactly the case a client most needs to branch on.

  **Prisma errors are now mapped instead of collapsing to a blank 500:** `P2002`→**409** (+ `details: ["email is already taken"]`), `P2025`→404, `P2003`/`P2014`→400, `P1001`/`P1002`/`P1008`→**503** (transient and retryable — matches what T15's readiness probe reports for the same condition). Detection is by code shape `/^P\d{4}$/`, not by importing Prisma's error classes, so it survives a client regeneration and still catches errors that crossed a module boundary and lost their prototype.
  **Nothing unexpected is echoed to the client.** Unmapped errors return a generic 500; the driver message (which quotes tables, columns, the DB host, and in one real case an account owner's personal email) goes to the log only.
  **Logging is split by class:** 5xx → `logger.error` **with the stack**; 4xx → a one-line `logger.warn`. Logging every 401 at error level would bury real faults.

  **Evidence — every row is a real request against the running API:**
  | Case | Before | After |
  |---|---|---|
  | Validation (`POST /auth/signup`, bad email + short password) | `{"message":["email must be an email","password must be…"],…}` — **array** | `{"statusCode":400,"message":"email must be an email","error":"Bad Request","details":[…2 items]}` |
  | 401 thrown in **middleware** (`GET /visits`) | `{message,error,statusCode}` | `{"statusCode":401,"message":"Missing bearer token","error":"Unauthorized"}` — **the filter does catch middleware exceptions**, which was not a given |
  | Malformed JSON body | 400, string message | `{"statusCode":400,"message":"Unexpected end of JSON input","error":"Bad Request"}` |
  | Wrong password | 401 | `{"statusCode":401,"message":"Invalid email or password","error":"Unauthorized"}` |
  | **DB stopped** → `POST /auth/login` | `{"statusCode":500,"message":"Internal server error"}` — **no `error` key** | `{"statusCode":503,"message":"The service is temporarily unavailable","error":"Service Unavailable"}` |
  | **Real P2002** — 4 concurrent signups on one fresh email | bare 500 | 3× `{"statusCode":409,…,"details":["email is already taken"]}` [F28] |
  | Successful login | 201 | 201 — unchanged |
  | Unknown route **with** a valid token | — | `{"statusCode":404,"message":"Cannot GET /does-not-exist","error":"Not Found"}` |
  | Wrong method on a real route (`DELETE /auth/login`) | — | 404, enveloped |
  | Tampered / garbage bearer token | — | `{"statusCode":401,"message":"Invalid token signature","error":"Unauthorized"}` |
  | `GET /health`, `GET /health/ready` | — | unchanged; they set status directly and never raise |

  ⚠️ **One deliberate exception to the envelope:** `GET /health/ready` answers 503 with the *health* shape (`{ status, database, timestamp }`), not `{ statusCode, message, error }`. That is intentional — it is consumed by uptime probes, not by the app clients, and monitoring tools expect a health-specific body. Worth knowing before anyone "fixes" the inconsistency.
  **Note on unknown routes without a token:** they return **401, not 404**, because `AuthMiddleware` runs on `*` and rejects first. That is defensible (it doesn't reveal which routes exist) but it is a behaviour to be aware of, not an accident to rely on.

  **Tests:** `src/common/all-exceptions.filter.spec.ts` — 16 specs, incl. a table asserting the envelope invariant across 8 exception kinds (`null` and a thrown string included), both leak checks, and the log-level split. Suite now **28 passing** (was 12).
  **Verify independently:** `curl -i -X POST http://localhost:4000/auth/signup -H "Content-Type: application/json" -d '{"email":"nope","password":"x","name":""}'`

**Phase 1 re-verified 2026-08-23 (after T16).** `npm run typecheck` clean, `npm test` **28/28 passing**, and the envelope re-checked live across 9 failure kinds including an authenticated 404, a wrong HTTP method and a tampered token. The same pass, probing routes with a deliberately wrong role, uncovered **[F29] and [F30]** — a cross-tenant read and an inert paywall. Neither is caused by Phase 1; both are pre-existing and belong to **T29**.

# PHASE 2 — Finish what's mid-test *(client priority #1)*

- [ ] **T17 — Subscription cancel/resume works.** Reproduce and fix the auth error the client hit. Test: cancel → verify `cancelAtPeriodEnd` in DB + Stripe → resume → verify both.
  - [ ] Frontend: billing page with working cancel/resume + state display.
- [ ] **T18 — Booking flow end-to-end against real Postgres** (unblocked by T13/T14). Availability → create → list → cancel; verify rows.
  - [ ] Frontend: real booking UI calling the real API.
- [ ] **T19 — Trigger and watch the trial-ending email fire.** Job exists, never run.
- [ ] **T20 — Trigger and watch `invoice.payment_failed`** via Stripe CLI; verify handler + email.

# PHASE 3 — Structural gaps *(client priority #2)*

- [ ] **T21 — Password reset.** Schema (token table), `POST /auth/forgot-password`, `POST /auth/reset-password`, email template, expiry + single-use. API-driven so the RN app reuses it. [F5]
  - [ ] Frontend: forgot-password + reset-password pages.
- [ ] **T22 — Admin authentication + guard on every `/admin/*` route.** [F7]
  - [ ] Frontend: admin login + guarded admin panel.
- [ ] **T23 — Reward redemption tracking.** Write to the existing `Redemption` table; endpoint to redeem; prevent double-redemption. [F4]
  - [ ] Frontend: redeem button + redemption history.
- [ ] **T24 — Merchant staff accounts + roles.** `MerchantStaff` model already exists — build auth, invite, and role-scoped permissions on it. [F6]
  - [ ] Frontend: staff management UI + role-limited views.
- [ ] **T25 — Points expiration.** Add `expired Boolean` to `Visit`, migrate, replace the `data: {}` no-op, exclude expired visits from progress math. [F8]
  - [ ] Frontend: points balance + expiry display.

# PHASE 4 — Security *(client priority #3)*

- [ ] **T26 — API-wide rate limiting.** Currently applied to **nothing** — signup, login, visits, everything is open. [F3]
- [~] **T27 — Secrets out of plaintext `.env`.** ⚠️ **One part done early 2026-08-23 because it was live-exploitable.**
  **🔓 `JWT_SECRET` in `.env` was the literal placeholder `change-me-to-a-long-random-string`** — the exact string published in `.env.example` (and now on GitHub). Anyone reading it could **mint a valid token for any account and any role**, including `admin`, which has no guard at all [F7]. **Proven, not theorised:** a hand-forged `{sub:'attacker', role:'admin'}` token signed with that placeholder was accepted by the running API (HTTP 200).
  **Fixed:** replaced with 48 random bytes (base64) in the gitignored `.env`. Re-verified after a full restart — the forged placeholder token now returns **401**, and seeded logins still return 200.
  ⚠️ **`nest start --watch` does NOT reload `.env`** — it recompiles TS but keeps the original process env, and stopping the npm wrapper can leave an orphaned node process holding :4000 (`EADDRINUSE`). After any `.env` change, kill the listener on :4000 and restart, then re-verify.
  **Still to do:** move all secrets to Vercel env vars, and **rotate the Resend key** (highest severity — see CONTEXT.md R4). Original task text follows —
- [ ] **T27 (remaining) — Secrets out of plaintext `.env`** into Vercel env vars. **Rotate the Stripe + Resend keys** — they've travelled through a zip and a chat.
- [ ] **T28 — Add `helmet`, tighten CORS** to real origins.
- [ ] **T29 — Authorization audit.** ⚠️ **Scope is now known and larger than "verify" — two live defects are already proven, see [F29][F30].** Verify every merchant-scoped route checks ownership (no IDOR: merchant A reading merchant B's data).
  **Confirmed work, not speculation:**
  1. **Add a real role guard.** 19 call sites pass `req.merchantId!` / `req.accountId!` with no check that the caller holds that role. A consumer token currently reads `GET /styles` and gets **200 + every row** [F29]. The `!` assertions must go — a guard should reject before the handler, so the type is honest.
  2. **Fix `RequireActiveSubscriptionMiddleware`'s route patterns.** They match nothing, so the paywall is inert: a `SUSPENDED` merchant still reads *and writes* [F30]. Re-test with the merchant forced to `SUSPENDED` / `CANCELLED` / `PAST_DUE`, and assert `req.readOnly` is actually honoured by the write handlers (nothing checks it today).
  3. **Audit for the `undefined`-filter trap generally.** `findMany({ where: { merchantId: undefined } })` returns the entire table rather than nothing. Grep every merchant-scoped query for a filter that can go `undefined`.
  4. Only then do the original IDOR sweep (merchant A vs merchant B) with two seeded merchants — the seed has one, which is why this stayed invisible.
- [ ] **T30 — Consider `jsonwebtoken`** over the hand-rolled HS256 implementation. [F12]
- [ ] **T31 — Security review pass** (input validation, error leakage, dependency audit).
- [ ] **T31b — PII at rest: phone numbers are stored in plaintext.** The Fiverr chat says *"JWT_SECRET / **ENCRYPTION_KEY** are sitting in a plaintext .env file"* — but **there is no `ENCRYPTION_KEY`** in `.env` or `.env.example`, and **no encryption/decryption code anywhere in `src/`**. `User.phone` is a bare `String?`. So the client believes phone numbers are encrypted; they are not. Decide with the client: encrypt at rest, or rely on DB-level encryption + access control. Also relevant to the privacy policy (T66), which must describe how personal data is actually stored.
- [!] **T32 — M-Pesa/Daraja webhook + IP allowlisting.** ⚠️ **The docx implies this exists; there is NO M-Pesa code in the repo.** This is build-from-scratch, not a fix. **Needs a client decision — biggest hidden scope item after the frontend.**

# PHASE 5 — Website build *(the real Order 1 work)*

- [!] **T33 — Confirm approach.** The existing HTML can't be wired up — it has no API calls, no password fields, and a browser-nonexistent storage layer. **Rebuild against the API, keeping the existing HTML as the design reference.** [F9][F10]

  **The design itself is a real asset and should be preserved, not redrawn.** View it any time with:
  `node "<scratchpad>/design-preview.js"` → **http://localhost:8080**

  What's already designed and reusable (6 complete views, ~247 lines CSS, ~1,300 lines JS):

  | View | Element |
  |---|---|
  | `view-marketing` | Landing page, founding-spots counter |
  | `view-consumer-auth` | Consumer signup/login |
  | `view-consumer-dashboard` | Punch card, rewards, salon grid, visit ledger |
  | `view-business-auth` | Merchant signup/login |
  | `view-business-portal` | Styles, reward rules, visit logging, portal stats |
  | `view-admin` | Approval queue, metrics |

  Render functions already written: `renderAdmin`, `renderBusinessPortal`, `renderConsumerDashboard`, `renderFoundingSpots`, `renderLedger`, `renderPortalStats`, `renderPunch`, `renderRules`, `renderSalonGrid`, `renderStyles`, `renderVisitStyleOptions`.

  **So the rebuild is "swap the data layer, keep the design"** — replace `window.storage` calls with real API calls, add the missing auth UI. The visual work is largely done; that meaningfully reduces the effort versus designing from scratch.
- [x] **T34 — Project setup.** ✅ **DONE & VERIFIED 2026-08-23 (session 3).** React + Vite app at `website/website/glow-plus-web/`, three entry points (main site, `verify-email`, `billing-result`). Framework, routing and the storage seam are in place; **API client + token storage + protected routes are NOT** — they arrive with T35–T38. See `glow-plus-web/MIGRATION.md` and CONTEXT.md §11.
  **Evidence:** layout fingerprint vs. the original prototype (tag, class, id, text and bounding rect for every element, in document order) → **276 vs 276 elements, IDENTICAL at 1280px and 390px** · functional pass **67/67** in real Chromium · production build serves `/verify-email` and `/business/billing` 200 with correct titles.
  **The storage seam:** `src/lib/storage.js` keeps `window.storage`'s exact async contract but is backed by `localStorage`, so `src/lib/data.js` ported over unchanged. ➡️ **Replacing that one file is how Phase 5/6 moves onto the real API — do not scatter `fetch` calls through the views.**
- [ ] **T35 — Auth UI** — signup, login, logout, email verification.
- [ ] **T36 — Consumer flow** — salon directory, styles, rewards, visit history, bookings.
- [ ] **T37 — Merchant portal** — profile, styles, reward rules, visits, staff, billing.
- [ ] **T38 — Admin panel** — approval queue, MRR/churn metrics.
- [ ] **T39 — Mobile-friendly** across all views (docx explicitly asks for this). ⚠️ **Concrete starting point [F25]:** at 390px the document is **401px** wide — the `.topnav` buttons don't wrap. Reproduced from the original, so it is a real design bug to fix, not a regression.
- [x] **T40 — Preserve the i18n — it's 8 languages, not 3.** ✅ **DONE & VERIFIED 2026-08-23.** `I18N` + `LANG_NAMES` extracted verbatim with `sed` (source lines 627, 630–1352) into `src/i18n/translations.js`; all 8 language blocks confirmed present. Browser-verified: switcher lists 8, Arabic flips `document.documentElement.dir` to `rtl` and translates, French returns it to `ltr`. `en, es, fr, de, pt, zh, ja, ar` — including **Arabic with full RTL** (`document.documentElement.dir` flips). All translation strings already exist in the prototype and are directly reusable. This is a genuine asset; don't lose it in the rebuild.
- [x] **T41 — Keep `verify-email` + `billing-result` pages working.** ✅ **DONE & VERIFIED 2026-08-23.** Both ported to React as **separate Vite entry points** (their CSS targets bare `body`/`.card`/`h1`/`p` and would collide with the main site's stylesheet in a single SPA). Real API call to `POST /auth/verify-email` preserved.
  **Routing:** Express's two routes are now a `vite.config.js` plugin (dev/preview) + `vercel.json` rewrites (prod): `/verify-email` → `verify-email.html`, `/business/billing` → `billing-result.html`. ⚠️ **Any other host needs the same two rewrites** — the backend has these URLs baked in (`APP_URL`, `billing.service.ts` `success_url`/`cancel_url`).
  **Evidence:** verify-email missing-token error, bogus-token → real 'Verification failed' from the running backend · billing success (+ session id echoed, webhook note), canceled, and direct-visit states all correct.

# PHASE 6 — Endpoints the clients need but that don't exist

Build to the shapes the RN app already expects (`glow-plus-mobile app/src/api/client.js`) so Order 2 needs no backend changes.

- [ ] **T42 — `GET /me/rewards`** — match `client.js:44-91` field-for-field.
- [ ] **T43 — `GET /merchants`** — public salon directory.
- [ ] **T44 — `GET /styles/public/:merchantId`** — current `/styles` is merchant-scoped *and* behind `RequireActiveSubscription`, so it can't serve consumers.
- [ ] **T45 — `GET /visits/me`** — consumer visit history.

# PHASE 7 — React-Native readiness *(backend work, no app edits)*

- [ ] **T46 — Auth stays token-only** (`Authorization: Bearer`). Never cookie-only — a native app has no cookie jar.
- [ ] **T47 — Refresh tokens.** Fixed 7-day JWT with no refresh today; retrofitting later changes the login response both clients depend on. [F12]
- [ ] **T48 — Public endpoints truly public** — the app browses before signup.
- [ ] **T49 — API versioning (`/v1`)** before launch.
- [ ] **T50 — Pagination** on visits/bookings (breaking change if added later).
- [ ] **T51 — CORS covers Expo web.**

# PHASE 8 — Deployment *(Vercel for both — decided 2026-08-23)*

Vercel runs the backend **serverless**, a different model from a long-running Node process. T54–T58 exist because of that and are not optional.

- [ ] **T52 — Production Postgres** (Neon/Supabase — Vercel doesn't host it). **Use the pooled connection string.**
- [ ] **T53 — Deploy backend + website**, env vars in Vercel project settings.
- [ ] **T54 — Convert all 4 cron jobs to Vercel Cron.** `@Cron()` **never fires** on serverless — this silently kills T19 and T25. Expose each as a route guarded by `CRON_SECRET`; schedule in `vercel.json`.
- [ ] **T55 — Prisma connection pooling** (PgBouncer / `?pgbouncer=true` / Accelerate). **The most common way Prisma-on-Vercel dies in production.**
- [ ] **T56 — Cache the Nest app instance** across invocations (cold-start bootstrap can exceed the timeout).
- [ ] **T57 — Re-verify the Stripe webhook raw body** under the serverless adapter — local `stripe listen` passing proves nothing about the deployed endpoint.
- [ ] **T58 — Run migrations from CI.** `Dockerfile.api` ran `migrate deploy` on boot; there's no boot step on Vercel.
- [ ] **T59 — Replace all localhost URLs/origins** with production values.
- [ ] **T60 — Domain + Resend domain verification** (unblocks real customer emails — see T6).
- [ ] **T61 — Production Stripe webhook endpoint** registered.
- [ ] **T62 — Backups, monitoring, logging.**
- [ ] **T63 — Full production smoke test.**

# PHASE 9 — Testing, CI, legal

- [ ] **T64 — CI pipeline** running tests on push.
- [ ] **T65 — Integration tests** (auth, authz, billing, webhooks, bookings, rewards) — accumulated per task, not retrofitted.
- [ ] **T66 — Privacy policy + terms** (docx requirement).
- [!] **T67 — Business registration** — *client action, not development work.*

---

## Blocked / needs a decision

- [~] **Database for local dev — DEFERRED, decide at T3.** Docker isn't installed [F17]. Leaning Neon/Supabase free tier (no install, and it's the same platform as T52). Not blocking T1/T2, which need no database.
- [!] **T32 — Is M-Pesa in scope?** No code exists; it's a from-scratch build.
- [!] **T33 — Website rebuild confirmed?** Biggest item; absent from the client's list.
- [!] **Vercel plan** — Hobby allows only 2 cron jobs at once-daily. This project has 4 → Pro (~$20/mo), or consolidate into one dispatcher route.
- [!] **Rotate the Vercel token** pasted in Fiverr chat before using it.

## Waiting on the client

- Domain purchase (blocks T60, T61, and real email delivery)
- Vercel + Neon/Supabase account access
- Confirmation that no desktop app is expected (the docx mentions one; none was delivered)

## Fiverr chat → task mapping (all 4 sections covered)

| Client's chat item | Task |
|---|---|
| **1. Mid-test** — cancel/resume subscription | T17 |
| Booking flow vs real Postgres | T18 (needs T13/T14 first) |
| Trial-ending email | T19 |
| Payment-failed webhook | T20 |
| **2. Structural** — no password reset | T21 |
| No admin authentication | T22 |
| No reward redemption tracking | T23 |
| No merchant staff accounts | T24 |
| Points never expire | T25 |
| **3. Security** — secrets in plaintext `.env` | T27 |
| No API-wide rate limiting | T26 |
| Daraja webhook / IP allowlisting | T32 ⚠️ *no M-Pesa code exists* |
| Production PCI/security review | T31 |
| *(implied: `ENCRYPTION_KEY`)* | T31b ⚠️ *no encryption exists at all* |
| **4. Deployment** — backend hosting | T53 |
| Real production Postgres | T52 |
| Real domain | T60 |
| Production Stripe webhook | T61 |

Every item from the chat is tracked. The chat is a condensed version of the docx — nothing appears in it that isn't also in the doc.

## What the client's docx got wrong

Its 23-item list is **accurate and complete for the backend**. But it assumes the frontend works — only 2 of 23 items touch it ("Deploy the backend and frontend", "Make the website mobile friendly"), and line 3 asserts *"a substantial amount of functional software across the backend, frontend, website."* [F9] and [F10] show otherwise. It also implies M-Pesa exists [T32]. Everything else in it checks out.
