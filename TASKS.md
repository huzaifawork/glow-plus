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

- [~] **T1 — `.gitignore`, `git init`, first commit.** ⚠️ **PARTIALLY DONE — see `CONTEXT.md` §8.**
  - [x] `.gitignore` created at project root
  - [x] `.env.example` sanitized — **it contained real Stripe + Resend secrets**, now placeholders (real values remain in the gitignored `.env`)
  - [ ] `git init`
  - [ ] `git add -A`, then review `git status` to confirm no `.env` / `node_modules` / `*.zip` / `stripe.exe` staged
  - [ ] First commit
  - [ ] Create GitHub repo and push
- [ ] **T2 — Flatten the folder nesting.** `[MINE — not requested by the client]` `website/website/glow-plus-backend/glow-plus-backend/` is 4 levels of duplication from how the zip extracted. Also delete the stray `{prisma,src` folder (a broken brace-expansion artifact).
  **Cosmetic — breaks nothing. Optional, and safe to skip.** The only real argument for doing it is timing: doing it *before* the first commit is free, whereas moving files later makes git history noisy. If skipping, do so deliberately.
  ⚠️ **Do not confuse this with T13**, which relocates `src/modules/booking/src/modules/…` and **is mandatory** — that one is the cause of the 7 compile errors.
- [x] **T3 — Postgres up.** ✅ **DONE 2026-08-23.** Docker Desktop 29.7.2 installed; container `docker-postgres-1` running Postgres 16.15 on port 5433, database `glowplus`, `pg_isready` confirms accepting connections. No tables yet — migrations not run. Restart with `docker compose -f docker/docker-compose.yml up -d postgres` (⚠️ use the PowerShell tool — `docker` isn't on Git Bash's PATH here).
- [ ] **T4 — Backend boots** on :4000. **Blocked by T13/T14** — the source doesn't compile [F14], so this cannot be done first. Order is: T13 → T14 → `prisma generate` → `prisma migrate dev` → `start:dev`.
- [ ] **T5 — Fix malformed `EMAIL_FROM`** in `.env` (breaks email before anything else can be tested).
- [ ] **T6 — Resend sends for real.** Set `EMAIL_PROVIDER=resend`, send one test email. ⚠️ Until a domain is verified, `onboarding@resend.dev` delivers **only to the Resend account owner's address** — so email tests are self-addressed until T60.
- [ ] **T7 — Stripe CLI forwarding works** (`stripe.exe` is in the repo); webhook secret matches `.env`.
- [ ] **T8 — Seed script** — merchant, consumer, styles, reward rules on demand. Without this, per-task testing is too slow to sustain.
- [ ] **T9 — Jest configured + 1 passing test.** Jest is a dep with no config and no tests. Set up now so tests accumulate per task.
- [ ] **T10 — Auth'd request helper** (REST file/script that logs in and reuses the token).
- [ ] **T11 — Website served over HTTP** against the backend (not `file://` — CORS/fetch misbehave). Confirm CORS from that origin.
- [ ] **T12 — Playwright + 1 browser smoke test.** (The docx claims Playwright was used; no config or specs were delivered.)

# PHASE 1 — Repair the foundation

> **T13/T14 are now the true first coding tasks** — the project doesn't compile without them [F14].

- [ ] **T13 — Merge the two Prisma schemas + relocate the nested delivery.** Move `src/modules/booking/src/modules/{bookings,business-hours}` up to `src/modules/`, fix their broken relative imports, delete the duplicate `reward-rules` copy [F16], merge `src/modules/booking/prisma/schema.prisma` `src/modules/booking/prisma/schema.prisma` (has `Booking`, `BusinessHours`) is orphaned from `prisma/schema.prisma` (has `Subscription`, `MerchantStaff`, `Redemption`). Merge into one, generate a migration, delete the orphan. **This is why booking "was never run against real Postgres" — the tables don't exist.** [F2]
- [ ] **T14 — Wire `BookingsModule` + `BusinessHoursModule`** into `app.module.ts`. They're fully written but never imported. [F1]
- [ ] **T15 — Add `GET /health`.** Needed for deploy checks. [F13]
- [ ] **T16 — Global exception filter** → stable `{ statusCode, message, error }` envelope (the RN client already reads `body.message`).

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
- [ ] **T27 — Secrets out of plaintext `.env`** into Vercel env vars. **Rotate the Stripe + Resend keys** — they've travelled through a zip and a chat.
- [ ] **T28 — Add `helmet`, tighten CORS** to real origins.
- [ ] **T29 — Authorization audit.** Verify every merchant-scoped route checks ownership (no IDOR: merchant A reading merchant B's data).
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
- [ ] **T34 — Project setup** (framework, routing, API client, token storage, protected routes).
- [ ] **T35 — Auth UI** — signup, login, logout, email verification.
- [ ] **T36 — Consumer flow** — salon directory, styles, rewards, visit history, bookings.
- [ ] **T37 — Merchant portal** — profile, styles, reward rules, visits, staff, billing.
- [ ] **T38 — Admin panel** — approval queue, MRR/churn metrics.
- [ ] **T39 — Mobile-friendly** across all views (docx explicitly asks for this).
- [ ] **T40 — Preserve the i18n — it's 8 languages, not 3.** `en, es, fr, de, pt, zh, ja, ar` — including **Arabic with full RTL** (`document.documentElement.dir` flips). All translation strings already exist in the prototype and are directly reusable. This is a genuine asset; don't lose it in the rebuild.
- [ ] **T41 — Keep `verify-email` + `billing-result` pages working** (the only currently-functional frontend).

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
