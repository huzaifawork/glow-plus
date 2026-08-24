# Glow+ — Session Handoff

**Read this first, then `TASKS.md`.** Written 2026-08-23 to carry context into a fresh chat.

---

## 1. What this project is

Glow+ is a salon loyalty/rewards platform. A client (Fiverr, username `joziilunga`) delivered a part-built codebase and a requirements doc, and hired me to finish, secure, test and deploy it.

**Contract:** $600 total, split into two $300 orders.
- **Order 1 (current): backend + website.**
- **Order 2 (later): mobile app.**
- **Out of scope entirely:** App Store / Play Store publishing, code signing, developer fees.

## 2. Scope rules — important

- **Work on the backend and website only.** Do NOT edit `glow-plus-mobile app/` — that's Order 2. Treat it as **read-only reference** for API contracts.
- **But** the backend must be built so the future React Native app connects with **zero backend rework** — token-only auth, refresh tokens, stable JSON error envelope, genuinely public endpoints, and consumer endpoints matching the shapes the app already expects in `glow-plus-mobile app/src/api/client.js`.
- **Deployment target: Vercel for BOTH frontend and backend** (user's decision — do not re-argue it). Because Vercel runs the backend serverless, cron jobs must be converted to Vercel Cron, Prisma needs pooled connections, etc. See TASKS.md Phase 8.

## 3. Working agreement — follow this strictly

Per task: **implement → test by actually running it → record evidence → tick the box in `TASKS.md` → commit and push to GitHub referencing the task number.** No batching. No "test everything at the end."

- **Backend task** = call the real endpoint against real Postgres; verify the DB row changed AND the unauthorized case is refused.
- **Frontend task** = load in a browser, click the flow against the running backend, check the network call, the error state, and mobile width.
- **Keep dev servers running** in the background the whole session so the user can test in their own browser too. After each task, tell them exactly what to click or call.
- **Do not start work until the user says go.** They coordinate with a collaborator first.

Why strict: the exact problem we were hired to fix is *"functionality that exists vs. functionality that's been validated."*

## 4. Environment — CURRENT STATE (updated 2026-08-23, end of session 3)

| Thing | Status |
|---|---|
| Docker Desktop | ✅ Running. ⚠️ `docker` is on **no** PATH — not Git Bash's, not PowerShell's. Call it by full path: `& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"` |
| Postgres | ✅ `docker-postgres-1`, Postgres 16.15, port **5433**, db `glowplus`. **Migrated — 14 tables + `_prisma_migrations`** (was 0 applied; `PasswordReset` added T21, `Admin` added T22, `StaffInvite` added T24; `Visit.expired`/`expiredAt` added T25) |
| Backend | ✅ **Compiles (0 TS errors) and runs on :4000**, 48 routes mapped, Prisma connected. **T27: it refuses to boot on a missing/placeholder secret** — intended; read the error, it names every problem at once. **T30: JWT is now `jsonwebtoken@9`, not hand-rolled** — pre-T30 tokens lack `iss`/`aud` and are refused, so a stale browser session must sign in once more (the web client clears it automatically). **T31: `bcrypt` → `bcryptjs`** (removes the native binary and the only critical advisory; existing `$2b$` hashes verify unchanged). **T31b: also refuses to boot without `ENCRYPTION_KEY`** (32 bytes, hex or base64) — phone numbers are now AES-256-GCM at rest |
| Website | ✅ **Now React + Vite** — `glow-plus-web` on :3000 (`npm run dev`). Migrated session 3; see §11. The old `glow-plus-frontend` (Express) still exists but is **superseded** — don't run both, they both want :3000 |
| Stripe CLI | ✅ Forwarding verified; **webhook now returns 200** (was 400 on everything — see F19) |
| Tests | ✅ Jest configured, **218 passing** (`npm test`) — 16 suites: jwt.util (23, T30), health controller, exception filter (+6 body-parser, T31), billing readPeriod, require-merchant / require-consumer / require-admin / require-merchant-owner / require-active-subscription guards, trialEndingReminder job, expirePoints job, throttling, env.validation (**+6 for ENCRYPTION_KEY, T31b**), security headers/CORS, input-validation (T31, 22), **pii-crypto (T31b, 25)**. ⚠️ `jest.setup.ts` supplies `JWT_SECRET` AND now `ENCRYPTION_KEY` — neither has a fallback |
| Seed | ✅ `npm run seed` — idempotent, local-DB-guarded |
| Git | ✅ Repo live at **https://github.com/huzaifawork/glow-plus** (private), pushed |
| Node / npm | v24.11.1 / 11.6.2 |

**Restart everything:**
```
# Postgres (if down)
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" compose -f docker/docker-compose.yml up -d postgres
# Backend  (from website/website/glow-plus-backend/glow-plus-backend)
npm run start:dev
# Website  (from website/website/glow-plus-web)   ← React + Vite as of session 3
npm run dev
# Stripe   (from website/website)
./stripe.exe listen --api-key <STRIPE_SECRET_KEY from .env> --forward-to localhost:4000/billing/webhook
```

**Test credentials** (`npm run seed`): `merchant@glowplus.test / Merchant123!` · `consumer@glowplus.test / Consumer123!`
**Helper:** `./scripts/api.sh merchant GET /bookings` · `./scripts/api.sh consumer GET /bookings/me` · `./scripts/api.sh reset`

⚠️ **`nest start --watch` does not reload `.env`.** After changing it, kill whatever holds :4000 and restart — stopping the npm wrapper can orphan the node child (`EADDRINUSE`):
```
Get-NetTCPConnection -LocalPort 4000 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }
```

## 3b. Client account access — NEW

**The client has given access to Stripe, Resend and Hostinger.** Testing that previously needed the client no longer does.

- **Stripe** — key in `.env` is **`sk_test_` (test mode)**, so experiments cannot move real money. Webhook forwarding works end to end.
- **Resend** — ✅ **`mail.glowplusmember.com` is VERIFIED (2026-08-24, T60).** `EMAIL_FROM` is now `Glow+ <noreply@mail.glowplusmember.com>`. Email delivers to **any** recipient — confirmed `last_event: delivered` to a non-owner address. **[R6] is lifted** and **T6 is done**.
- **Hostinger** — domain is **`glowplusmember.com`**, on Hostinger nameservers (`pixel/byte.dns-parking.com`). The four Resend DNS records live under `mail.` (DKIM TXT, two CNAMEs, plus `_dmarc` at the root). The root domain itself is still free of MX/TXT, deliberately, so the client can add real mailboxes later without colliding with Resend.

⚠️ **Never paste keys into chat.** Put them straight into the gitignored `.env`; they can be read from disk.

## 5. Where the code lives

```
joziilunga-attachments/
├─ TASKS.md          ← the task list (source of truth)
├─ CONTEXT.md        ← this file
├─ Software Developer Project Experience.docx   ← client's requirements doc
├─ glow-plus-mobile app/     ← Order 2. DO NOT EDIT.
└─ website/website/
   ├─ Glow-Plus-Website .html      ← the design prototype (1,932 lines). KEEP — it is
   │                                 the reference the migration is verified against
   ├─ stripe.exe
   ├─ glow-plus-web/               ← ⭐ THE WEBSITE (React + Vite, session 3). Work here.
   ├─ glow-plus-frontend/          ← SUPERSEDED Express helper. Kept as reference only.
   └─ glow-plus-backend/glow-plus-backend/   ← the NestJS backend
```

## 6. Critical findings (all verified in the files, not assumed)

| # | Finding |
|---|---|
| **F14** | **The backend source does not compile.** `nest start` fails with 7 TS2307 errors. It is not merely untested — it does not build. |
| **F15** | `bookings/` and `business-hours/` exist ONLY at `src/modules/booking/src/modules/…` — an unzipped delivery dumped in with its full path preserved, so every relative import resolves to nothing. There is **no** top-level `src/modules/bookings/`. |
| **F1** | `BookingsModule` / `BusinessHoursModule` are **never imported** in `app.module.ts` — confirmed at runtime, zero booking routes registered. |
| **F2** | **Booking/BusinessHours tables don't exist in the DB.** The schema is split across two files; the only migration creates 9 tables, none of them Booking. **This is why the client says booking "was never run against real Postgres" — it could not have worked.** |
| **F3** | ✅ **RESOLVED 2026-08-24 by T26.** ~~Rate limiting is applied to nothing.~~ Three tiers now run on every request; the dead middleware (which could not have been applied — Nest DI cannot resolve its constructor params) was deleted. |
| **F4** | ✅ **RESOLVED 2026-08-24 by T23.** ~~Nothing writes to the `Redemption` table.~~ `src/modules/redemptions/` now writes to it, with double-redemption blocked inside a transaction. |
| **F5** | No password-reset code exists at all. |
| **F6** | ✅ **RESOLVED 2026-08-24 by T24.** ~~`MerchantStaff` table exists in schema + migration, but **zero code uses it**.~~ `src/modules/staff/` now writes to it, with an invite flow and an owner/staff split enforced by `RequireMerchantOwnerGuard`. |
| **F7** | `/admin/*` has no guard — the code comments admit it. |
| **F8** | ✅ **RESOLVED 2026-08-24 by T25.** ~~`expirePoints.job.ts` writes `data: {}` — a literal no-op.~~ `Visit.expired`/`expiredAt` exist and the job sets them; all three progress paths filter expired visits out. |
| **F9** | **The website is an AI-generated artifact prototype, not an app** — 0 `fetch` calls in 1,932 lines, 0 password fields, data layer is `window.storage` which doesn't exist in real browsers. It **fails silently**: renders fine, saves nothing. |
| **F10** | The original developer's own `glow-plus-frontend/README.md` says the portal/dashboard need "their own, much bigger buildout." |
| **F11** | Email provider **does** support Resend (`EMAIL_PROVIDER=resend` is already set in `.env`). Until a domain is verified, Resend only delivers to the account owner's own address. |
| **F12** | JWT is hand-rolled HS256, fixed 7-day, **no refresh token**. |
| **F13** | No `/health` endpoint. |

**The design is a genuine asset** — 6 complete views, ~247 lines CSS, 11 render functions, and **8 languages including Arabic with RTL**. The rebuild is *"swap the data layer, keep the design,"* not a redesign.

## 7. Where the client's doc is wrong

Its 23-item priority list is **accurate and complete for the backend**. But:
- It assumes the frontend works — only 2 of 23 items touch it, both presupposing it's done.
- It implies M-Pesa/Daraja exists ("the webhook needs IP allowlisting") — **there is no M-Pesa code in the repo at all.** That's a from-scratch build.

These two are the biggest hidden-scope items. The user has been advised to raise them with the client.

## 8. EXACTLY where to resume — **PHASE 1 IS COMPLETE. START PHASE 2 AT T17**

> **Session 3 note (2026-08-23):** the user asked, out of task order, for the
> HTML website to be converted to React + Vite. That is **done and verified** —
> see §11. It covers **T34 structurally** and satisfies **T40** and **T41**.
> It does **not** wire the site to the API, so T35–T38 remain open.
> The user's instruction for the next session was explicit:
> **"we will start from phase 0 things once starting"** — i.e. resume the
> numbered tasks in order from T15, treating the migration as banked work.

**Session 2 (2026-08-23) finished Phase 0 and the first half of Phase 1.**

✅ **Done, tested and pushed:** T1, T3, T4, T5, T7, T8, T9, T10, T11, **T13, T14**
⏭️ **Deliberately skipped:** T2 (cosmetic nesting), T12 (Playwright — no UI to test until Phase 5)
⏸️ **Deferred by agreement:** T6 (Resend send — do it with T19/T20)
🟡 **Partly done early:** T27 (JWT secret rotated because it was live-exploitable)

> **Session 4 (2026-08-23) closed Phase 1.** T15 and T16 done, tested against the
> running API and pushed. The user asked to stop at the end of Phase 1 and will
> give the go-ahead for Phase 2 separately — **do not start T17 without it.**

✅ **T15 — `GET /health` + `GET /health/ready`.** Split liveness/readiness on purpose; readiness returns **503 + Prisma code** when the DB is unreachable. Verified by actually stopping the Postgres container: liveness stayed 200, readiness went 503 `P1001`, both recovered on restart with no API restart.
✅ **T16 — global exception filter.** `{ statusCode, message, error, details? }` for every failure. `message` is now always a string and `error` is always present — **neither was true before**. Prisma errors mapped (P2002→409, P2025→404, P1001→503) instead of collapsing to a blank 500.

✅ **T60 + T6 — done 2026-08-24, out of phase order** (agreed: they blocked half of Phase 2). `mail.glowplusmember.com` verified in Resend; full loop proven — signup → email **delivered** → link from the delivered email → `/auth/verify-email` → DB updated → replay refused. **F27 resolved.**

✅ **T17 — done 2026-08-24, both backend and frontend.** Three real bugs found and fixed, not just "cancel/resume works":
1. Consumer token on `/billing/cancel` was a bare **500** — fixed with `RequireMerchantGuard` (`src/common/guards/require-merchant.guard.ts`), now 403. Same root cause as F29.
2. Stripe moved `current_period_start`/`_end` off the Subscription object onto its line items in both the pinned SDK version and live webhook payloads — the webhook silently 400'd and never synced. Fixed with `readPeriod()` in `billing.service.ts`. Proved by changing the subscription **directly in Stripe** and watching the DB sync via webhook in ~2s.
3. **`GET /merchants/me` leaked the merchant's bcrypt `passwordHash`**, and `GET /admin/merchants/pending` (no guard — F7) leaked it to **any logged-in consumer**. Fixed with an explicit field allow-list, `MERCHANT_PUBLIC_SELECT`. See **F31**.

Frontend: `glow-plus-web/src/pages/billing-result/BillingManager.jsx` + new `src/lib/api.js` (the real API client — token-only auth, reusable foundation for T35–T38). Mounted at `/business/billing`; the two existing Stripe-redirect states are untouched. Tested end-to-end in a real driven Chrome instance (`puppeteer-core`, installed to the session scratchpad only — not added to the repo, no test framework exists in-repo per T12's deliberate skip): **15/15 checks passed**.

Suite now **40 passing** (was 28). DB and Stripe test data cleaned up after; DB back at exact seed state.

✅ **T18 — done 2026-08-24 (session 5), both backend and frontend.** Booking flow end-to-end against real Postgres: `bookings/availability` → `POST /bookings` → `GET /bookings/me` → `PATCH /:id/cancel`, plus the merchant side (`confirm` → `complete`, which auto-creates a `Visit` row and checks reward triggers). All verified against the live API and a real Prisma query, not just response bodies.

Found the same [F29]-class bug in a second place before building on top of it: `bookings.controller.ts` had 6 more call sites reading `req.merchantId!` / `req.accountId!` with no role check ahead of them — `GET /bookings`, `PATCH /:id/{confirm,no-show,complete}` (merchant-only) and `POST /bookings`, `GET /bookings/me` (consumer-only). A consumer token on `GET /bookings` would have returned every merchant's bookings, reproducing F29 in a new controller. Fixed by reusing T17's `RequireMerchantGuard` on the four merchant-only routes and adding a new mirror `RequireConsumerGuard` (`src/common/guards/require-consumer.guard.ts`) on the two consumer-only ones.

Also added two small **public** endpoints, pulled forward out of Phase 6 because the booking flow has no other way to let a consumer name a merchant/style without hardcoding a database id into the frontend: `GET /merchants/public` (id + businessName, ACTIVE only) and `GET /styles/public/:merchantId` (active styles at an ACTIVE merchant). Both are deliberately minimal — **T43/T44 are still open**, these are stopgaps sized for T18, not their final shape (no pagination/search).

Frontend: new standalone page `glow-plus-web/booking.html` → `/consumer/booking` (same pattern as T17's billing page — not integrated into the SPA, since T35's real auth UI doesn't exist yet). Consumer sign-in → salon/style dropdowns from the two new public endpoints → date → real availability slots → book → "Your bookings" list with cancel. `lib/api.js` gained a **second, separate token key** (`glowplus:token:consumer`, distinct from the merchant billing page's `glowplus:token`) so the two standalone pages can hold independent sessions in the same browser — a real collision T36 would otherwise have hit later. Driven in real Chrome (`puppeteer-core`, scratchpad-only): 14/14 checks passed.

Suite now **46 passing** (was 40).

✅ **T19 — done 2026-08-24 (session 6).** `TrialEndingReminderJob` had never actually been executed — only the code existed. Triggered it directly (booted a Nest application context, called `job.run()`) against real Postgres and real Resend, rather than waiting for its daily 9am cron or faking the system clock in the running dev server. Seeded two `TRIALING` subscriptions with `trialEnd` inside the job's 3–4-day window — the seeded merchant, plus a disposable second merchant at Resend's own `delivered@resend.dev` test address specifically to prove full **delivery**, not just a 200 (`merchant@glowplus.test` isn't a real inbox, so it can only ever show `sent`). Confirmed both back from the live Resend API: `sent` and **`delivered`** respectively, correct subject/content. **No bug found** — the job runs exactly as written. Checked the related webhook backup path (`billing.service.ts` `onTrialWillEnd` / `customer.subscription.trial_will_end`) while here; it's wired, so the cron is genuinely a backup, not the only path. Test data cleaned up after. Added `trialEndingReminder.job.spec.ts` (3 specs: date-window query, emails every match, no-op with no throw when nothing matches). Suite now **49 passing** (was 46).

✅ **T20 — done 2026-08-24 (session 7).** `onPaymentFailed` (`billing.service.ts:226`, case `'invoice.payment_failed'`) had never actually fired. Restarted `stripe listen` myself with output captured (the process already running from a prior session was invisible to this one) and reconfirmed its signing secret still matches `.env`'s `STRIPE_WEBHOOK_SECRET`.

  **The naive plan didn't work and is worth remembering:** attaching a Stripe "always-declines" test PaymentMethod (`pm_card_chargeDeclined`) to a customer fails immediately at `paymentMethods.attach()` — those tokens are built to fail on *any* use, so they never reach an actual invoice-payment step. Raw test card numbers are also blocked outright on this account (raw-card-data APIs not enabled — a real control, not a bug). The reliable path: `stripe trigger invoice.payment_failed` (a real, fully-signed Stripe test-mode event) plus a manual replay of that same event, re-signed with `stripe.webhooks.generateTestHeaderString`, after linking a merchant's `stripeCustomerId` to the fixture's customer.

  **Two paths verified:** (1) the CLI fixture's own synthetic, unlinked customer → webhook **200**, handler no-ops safely, DB untouched — the honest default for real-world orphaned Stripe customers. (2) the same event replayed after linking the seeded merchant to that Stripe customer → webhook **200**, merchant `status` **ACTIVE → PAST_DUE** in real Postgres. Email confirmed by **actual delivery** (not just a 200): `sent` to `merchant@glowplus.test`, **`delivered`** when replayed against Resend's `delivered@resend.dev`, and the delivered HTML pulled back from Resend's API to confirm the real `invoice.stripe.com` link rendered (no literal `undefined`).

  **No bug found** — same as T19, the handler was correct, just never exercised. Test data (merchant status/stripeCustomerId/email, 3 orphaned Stripe test customers from the dead-end attempts) fully cleaned up; suite still **49 passing** (no code changed, so no new tests, consistent with T19).

✅ **T21 — done 2026-08-24 (session 8).** Password reset, both backend and frontend. New `PasswordReset` table mirrors `EmailVerification` exactly (hashed single-use token, `expiresAt`, `usedAt`) — see `prisma/schema.prisma`. `POST /auth/forgot-password` (`src/modules/auth/password-reset.service.ts`) looks the email up in **both** `User` and `Merchant` tables — one generic endpoint serves consumer and merchant, since the RN app only ever knows an email, not which table it's in — and always returns `{ok:true}`, so it can't be used to enumerate accounts (confirmed identical response for a real vs. nonexistent email). `POST /auth/reset-password` validates hash + expiry + single-use inside a `$transaction`, same pattern as `EmailVerificationService.verifyEmail`. Token TTL is 1h, deliberately shorter than email verification's 24h since this resets a live credential.

Tested against the real running API, Postgres, and Resend — not just response shapes: seeded consumer → `forgot-password` → pulled the real token out of the **delivered** Resend email (same technique as T19/T20 — `GET /emails` then `GET /emails/:id` for the HTML) → `reset-password` → **logged in with the new password (201)** → old password now 401 → **reusing the same token 400 (single-use)** → manually expired a second token's row directly in Postgres → rejected with a distinct "Token expired" message, not the generic invalid-token one. Consumer's password restored to the seed baseline (`Consumer123!`) afterward — verified by a final successful login.

Frontend: new standalone pages `glow-plus-web/forgot-password.html` → `/forgot-password` and `reset-password.html` → `/reset-password` (same pattern as T17's billing page and T18's booking page — not part of the SPA, since T35's real auth UI doesn't exist yet). `vite.config.js`'s route-rewrite plugin and Rollup `input` both extended. Driven in real Chrome (`puppeteer-core`, scratchpad-only): **12/12 functional checks passed** — form renders; identical success state for a real vs. unknown email (no UI-level enumeration leak either); missing-token error state; client-side mismatched-password validation; real submit → success; login with the new password succeeds; a reused token shows an error; no horizontal overflow at 390px.

No bug found in pre-existing code this time (unlike T17/T18) — this was new functionality, not a "was it ever exercised" check like T19/T20.

Suite still **49 passing** (no new unit tests — consistent with T17–T20, which test this class of flow end-to-end against the real API rather than in Jest).

✅ **T22 — done 2026-08-24 (session 9).** Admin authentication + `RequireAdminGuard` on every `/admin/*` route except `POST /admin/login`. [F7] closed, and re-verified that the exact **F31** leak vector (a consumer token reading `GET /admin/merchants/pending`) now returns 403 instead of 200. New `Admin` model (migration `20260824090000_admin`), seeded `admin@glowplus.test / Admin123!`. Full approve/suspend cycle tested against real Postgres (fresh signup → PENDING → approve → ACTIVE → suspend → SUSPENDED, confirmed via direct Prisma query, test data cleaned up). Frontend: new standalone page `glow-plus-web/admin.html` → `/admin/panel` (same pattern as T17/T18/T21) — admin login, platform metrics tiles, pending-merchants approve/suspend list. `lib/api.js` gained a third token key, `glowplus:token:admin`. Driven in real Chrome (`puppeteer-core`, scratchpad-only): 11/11 checks passed. Suite now **55 passing** (was 49).

Noted in passing, not fixed (out of scope for T22): `POST /merchants/signup` returns a bare 500 even though the row commits — same shape as the already-resolved [F27], just on the merchant path instead of consumer. Worth a look next time merchant onboarding is touched.

✅ **T23 — done 2026-08-24 (session 10), both backend and frontend.** [F4] closed — the `Redemption` table finally has a writer. New `src/modules/redemptions/` module with four routes, every one role-guarded from the start (reusing T17's `RequireMerchantGuard` and T18's `RequireConsumerGuard`) so the [F29] `req.merchantId!` pattern isn't repeated in a new controller: `GET /redemptions/available?merchantId=` and `POST /redemptions` and `GET /redemptions/me` (consumer), `GET /redemptions` (merchant history, with client name/email).

**Double-redemption is blocked by re-deriving eligibility inside the `$transaction`** from real `Visit`/`Redemption` rows — the client only ever names *which rule*, never its own progress. `oneTime` rules refuse once any redemption exists; repeatable rules refuse when `redeemedCount >= unlockedCount`, so a consumer at 10/5 visits can redeem exactly twice, not unlimited times.

Verified against the live API and real Postgres: redeem → **201** with a real row; same rule again → **400**; a *different* rule → **201**; zero-visit consumer → **400 "Not eligible"**; bad rule id → **404**; wrong-role tokens → **403** both directions; no token → **401**. Then logged 5 more visits and confirmed the **second milestone genuinely unlocks and re-locks**.

Frontend: `glow-plus-web/rewards.html` → `/consumer/rewards` (same standalone pattern as T17/T18/T21/T22). Real Chrome via `puppeteer-core`: 11/12 — including a live Redeem click that grew history by exactly one and re-locked the button, and no overflow at 390px. The single non-pass is a `favicon.ico` 404, cosmetic and present on every standalone page.

No bug found in pre-existing code (new functionality, like T21). Suite still **55 passing**, `tsc --noEmit` clean, test data fully cleaned up — DB back at exact seed state.

✅ **T24 — done 2026-08-24 (session 11), both backend and frontend.** [F6] closed — the `MerchantStaff` table finally has a writer. New `src/modules/staff/` with 9 routes: public `POST /staff/login`, `GET /staff/invites/:token`, `POST /staff/accept-invite`; owner-only `GET /staff`, `POST /staff/invites`, `DELETE /staff/invites/:id`, `PATCH /staff/:id/role`, `DELETE /staff/:id`; and `GET /staff/me` for any merchant token.

Invites live in a separate **`StaffInvite`** table (migration `20260824170000_staff_invites`), mirroring `EmailVerification`/`PasswordReset`: hashed single-use token, 7d `expiresAt` (an invite is not a live credential like a 1h reset), `acceptedAt`, `revokedAt`. No staff row — and so no password hash — exists until acceptance, which runs in a `$transaction` that **re-checks the token inside**, so two clicks on the emailed link can't both succeed. `MerchantStaff` gained `name` and `lastLoginAt`.

**Role scoping is split across two guards.** T17's `RequireMerchantGuard` accepts owner *and* staff — day-to-day work. The new `RequireMerchantOwnerGuard` refuses `merchant_staff` with a distinct message ("requires the merchant owner account" — a staff member reading "requires a merchant account" would read it as a bug), and T24 **narrowed billing checkout/cancel/resume onto it**: a receptionist could previously have cancelled the salon's subscription. `StaffRole.OWNER` signs `merchant_owner`, `STAFF` signs `merchant_staff`, and `sub` is always the staff id — exactly what `Visit.loggedBy` ("staff user id") always meant to record, and now does.

Every management method filters by the caller's `merchantId`, never by staff id alone: `MerchantStaff.email` is globally unique, so a bare `findUnique({ id })` would have let merchant A rename or delete merchant B's staff — **[F29]'s shape in a new table**. Verified: merchant B gets **404**, row intact.

**55/55 backend checks** against the live API and real Postgres, including the invite email **DELIVERED** through Resend (`delivered@resend.dev`, `last_event=delivered`, token pulled back out of the delivered HTML as in T19–T21). **26/26 frontend checks** in real Chrome. Two new standalone pages: `staff.html` → `/business/staff` and `accept-invite.html` → `/staff/accept-invite` (backend-baked, like `/reset-password`). **One sign-in box serves both account kinds** — `teamSignIn()` tries `/merchants/login` and falls back to `/staff/login` **on 401 only**, so a real outage isn't reported as "wrong password". `GET /staff/me` then picks the view; staff never see the management panel, and the API refuses them independently (403 proved using the browser's own token), so the hiding is convenience, never the boundary. Fourth token key: `glowplus:token:staff`.

**Also fixed while here:** `vercel.json` still had rewrites for only the original two routes, so `/consumer/booking`, `/forgot-password`, `/reset-password`, `/admin/panel` and `/consumer/rewards` would all have **404'd in production** — including reset-password links the backend already emails. All added.

✅ **T25 — done 2026-08-24 (session 11), both backend and frontend.** [F8] closed. `expirePoints.job.ts` ran nightly, called `updateMany` with `data: {}` — a literal no-op — and logged a count of rows it had "touched" while changing none. `Visit` now has `expired` + `expiredAt` (migration `20260824180000_visit_points_expiry`, two indexes) and the job writes them.

**Expiring never deletes.** Points aren't a stored balance — they're derived from `Visit` rows — so expiry excludes a visit from progress maths and leaves it in the merchant's history. The job filters `expired: false`, making it idempotent: a rerun expires 0 more and does **not** rewrite `expiredAt` on old rows. TTL is `POINTS_EXPIRE_AFTER_DAYS` (365, env-overridable).

**All three progress paths now filter expired visits** — `redemptions.service.ts` (both the `available` read *and* the eligibility re-derivation inside the redeem `$transaction`) and `reward-rules.service.ts` `evaluate()`, which `POST /visits` calls to decide what just unlocked. Missing the in-transaction one would have let a consumer redeem against points the UI had already stopped showing.

**`src/modules/points/` is now real** — one of [F22]'s empty placeholder directories. `GET /points/me` (consumer-guarded from the start) returns per-salon `activePoints`, `expiredPoints`, `expiresAfterDays`, `nextExpiry` and a 30-day `expiringSoon` window. **`nextExpiry` is computed from the visit date, not from the job**, so the UI warns before the points go rather than reporting the loss the morning after.

**21/21 backend checks** (job booted through a Nest application context and called directly, as in T19, rather than waiting for its 3am cron) and **10/10 frontend checks** in real Chrome — a points card on `/consumer/rewards` with balance, expiry date, a red expiring-soon warning, and expired points reported rather than silently dropped. With every visit expired, `POST /redemptions` returns **400** — the refusal is server-side, not a hidden button.

Suite now **67 passing** (was 55). `tsc --noEmit` clean. Test data fully cleaned up after both tasks — DB back at exact seed state (1 merchant, 5 visits, 0 expired, 0 staff, 0 invites).

✅ **T26 — done 2026-08-24 (session 12).** [F3] closed. `rateLimit.middleware.ts` had zero references **and could not have been wired up**: Nest DI cannot resolve its `windowMs`/`max`/`keyOf` constructor params, so `consumer.apply()` would have failed at boot. Deleted; replaced with `@nestjs/throttler` v6.5 in three tiers (`src/common/throttling.ts`): `global` 300/min per IP in **one bucket for the whole API**, `default` 120/min per IP per handler, and `identity` keyed by the **email in the request body** — the credential-stuffing defence the deleted middleware's own comment described and never implemented. Credential routes 20/5min per IP but only **5/15min per email**: a salon is one NAT'd office and must not lock itself out, so the brute-force defence lives in the per-email tier.

**Two real bugs found in my own first implementation, by testing rather than reading:**
1. **A guard-only limiter leaves every protected route floodable by anonymous traffic.** Nest runs middleware before guards and `AuthMiddleware` throws 401 first, so `ThrottlerGuard` never saw those requests. Spotted because `GET /styles` came back with **no** `X-RateLimit-*` headers while `GET /merchants/public` (excluded from AuthMiddleware) had them. Fixed by moving the `global` tier into `src/middleware/globalRateLimit.middleware.ts`, applied **before** `AuthMiddleware`, sharing the throttler's storage service. That tier is deliberately **absent** from the guard's list — in both, it would double-count every authenticated request and halve the real limit. → **[F32]**
2. **Every exemption silently missed.** `req.path` inside `forRoutes('*')` middleware is `/`, not the real path — Express strips the matched mount prefix and with a `*` mount the whole path *is* the prefix. `/health` and the Stripe webhook were both being throttled while the unit tests (which pass a path string) stayed green. Fixed with `requestPath()` reading `originalUrl`. → **[F33]**

Exempt: the Stripe webhook (it **retries harder** on a 429, so throttling manufactures the load it was meant to shed), `/health*` (a throttled probe reads as an outage), and `OPTIONS` preflight. New **`TRUST_PROXY_HEADER`** (default `0`): `X-Forwarded-For` is caller-supplied, so trusting it on a directly-exposed server is a free bypass — but it **must be `1` on Vercel** or every visitor shares the proxy's IP. **26/26 live checks**, including the route ceiling firing at request #120 of 120 and a rotating forged `X-Forwarded-For` failing to bypass a block.

✅ **T27 — done 2026-08-24 (session 12), except key rotation** (a client account action; the user ruled it out of scope). The blocker to moving secrets to Vercel was never the move — it was that **nothing would notice a secret going missing**. Every secret had a silent fallback, and `jwt.util.ts`'s was `?? 'dev-secret-change-me'` — a constant published in this repo. A var forgotten in the Vercel dashboard would boot green and sign `role:'admin'` tokens with it: **[F20] reproduced exactly**, and [F20] was already proven exploitable.

New `src/config/env.validation.ts` on `ConfigModule.forRoot({ validate })` refuses to boot on missing/placeholder secrets (including the two real historical strings), a `JWT_SECRET` under 32 chars, and — production only — a `localhost` `APP_URL`/`ALLOWED_ORIGINS`, `EMAIL_PROVIDER=log`, or `TRUST_PROXY_HEADER` off (which would collapse T26's limiter to one bucket for the internet). It lists **every** problem at once, and treats `VERCEL=1` as production even with `NODE_ENV` unset. `jwt.util.ts`'s fallback is gone; `jest.setup.ts` supplies a test key. New **`glow-plus-backend/DEPLOYMENT.md`** — 15 vars, grepped not remembered, with what breaks when each is wrong. Boot refusal proven against the **compiled** app for three bad configs. `.env` confirmed gitignored and never committed.

✅ **T28 — done 2026-08-24 (session 13).** Security headers + CORS. Before this, the live API answered **every** request with exactly two headers of interest — `X-Powered-By: Express` and `Access-Control-Allow-Credentials: true` — and nothing else: no `X-Content-Type-Options`, no `X-Frame-Options`, no `Referrer-Policy`, no CSP, no HSTS. The credentials header was the notable one: it went out **even to origins that were refused**, and auth here is bearer-token only in both clients, so it bought nothing while being exactly what would make a future session cookie CSRF-able on day one.

New **`src/config/security.ts`** — pure functions of the environment, so the policy is unit-testable without booting Nest; `main.ts` only wires it. helmet is tuned for a **JSON-only** API (confirmed first: no `useStaticAssets`/`sendFile`/`text/html` anywhere in `src/`): `default-src 'none'` with `useDefaults:false`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. Two deliberate departures from helmet's defaults — **`Cross-Origin-Resource-Policy: cross-origin`**, because helmet's `same-origin` default describes a deployment this project doesn't have (site and API are different hosts), and **HSTS production-only with `preload:false`**, since preload submission is a one-way door on the client's own domain.

**helmet is applied first in the chain**, so the headers are present on a 401 from `AuthMiddleware`, a 404, and a **429 from T26** — the error responses an attacker generates most, which anything registered later would have left bare.

CORS: `credentials:false`; explicit `methods`/`allowedHeaders` instead of reflecting whatever the browser asks; exact case-insensitive origin matching with trailing slashes and stray spaces normalised off. **The payoff worth remembering: `Access-Control-Expose-Headers`.** A cross-origin `fetch` can only read the CORS-safelisted headers, so **every one of T26's rate-limit headers was invisible to the website** — enforced but unreadable, and the UI could not tell a user how long to wait after a 429. Now readable (proved in a real browser, with `ETag` as a control that stays hidden).

`env.validation.ts` gained two production checks: `ALLOWED_ORIGINS` containing `*`, and any entry with no scheme (never matches a browser's `Origin`, so the site fails CORS while the variable looks correct). The old inline `?? ['http://localhost:3000']` fallback survives only outside production and now **announces itself at boot**.

**36/36 curl checks** live (including the prefix/suffix/`Origin: null`/scheme-swap near-misses a naive `startsWith`/`endsWith` lets through), **12/12 real-Chrome checks**, and **Stripe webhooks re-verified end to end** (`stripe trigger` → 10 events, all 200) because [F19] was a raw-body regression and helmet now sits ahead of that path. Suite **133 passing** (was 104). New `DEPLOYMENT.md` **CORS (T28)** section.

✅ **T29 — done 2026-08-24 (session 14).** The authorization audit. [F29] and [F30] both closed, and a third leak [F34] found by the audit itself.

**Both defects were reproduced live before being touched.** A consumer token on `GET /styles` returned **200 and every style row**; on `GET /visits`, **200 and every visit row**. With the merchant forced **SUSPENDED**, `GET /styles` returned **200** and `POST /styles` returned **201 and created the row**.

**The guard sweep.** `RequireMerchantGuard` (T17) now covers the last unguarded controllers — `styles` (5 routes), `visits` (2), `GET /merchants/me`, and `PUT /business-hours`, which the ticket had missed. The two 500s (`/merchants/me`, `PUT /business-hours`) were failing closed only because Prisma rejected an undefined id — luck, not a check; they are 403s now.

**The `!` assertions are gone from every controller in the codebase**, not only the ones this task touched. Two new types — `MerchantRequest` and `ConsumerRequest` in `auth.middleware.ts` — declare `merchantId`/`accountId` non-optional, and guarded handlers take those instead of asserting. **Remove a guard now and the build fails**, so the compiler enforces what used to be a convention. `RequireMerchantGuard` gained an `accountId` check, which is what makes that type honest (`visits.logVisit` writes it to `Visit.loggedBy`).

**`RequireActiveSubscriptionMiddleware` is deleted**, replaced by `RequireActiveSubscriptionGuard`. Path-matched middleware has now silently missed its target three times in this repo — [F3] rate limiting, [F33] the throttler's exemptions, [F30] here — so this is a guard on the real routes: **a guard cannot be aimed at a path that doesn't exist.** Its old registration also listed `reward-rules/(.*)`, and **that module has no controller at all**, so a third of the paywall pointed at nothing regardless of the pattern bug.

**PAST_DUE's "read-only" was fiction.** The middleware set `req.readOnly` and left it to "the route handlers themselves" — **no handler ever checked it**, so PAST_DUE was in practice full access. The guard now refuses POST/PUT/PATCH/DELETE itself. `GET /merchants/me` is deliberately **not** paywalled: a suspended merchant must still reach their profile and billing to fix exactly that.

**→ [F34], found by item 3 of the audit and worth remembering.** `GET /redemptions/available` takes `merchantId` as a **query** param, which can simply be absent — `undefined` reached `findMany({ where: { merchantId } })` and it returned the reward rules of **every merchant on the platform**. T23 role-guarded that route on day one and it leaked anyway: **a guard fixes _who_ is asking, never _what they may scope the question to_.** Route params can't do this (always a string); query params, optional DTO fields and anything defaulted can.

**Also found, unrelated to auth:** `UpdateStyleDto` marked its fields optional with TypeScript's `?` and no `@IsOptional()`, so class-validator ran every decorator against `undefined` and **`PATCH /styles/:id` refused any partial body** — a merchant could not rename their own style. It only surfaced because the 400 fired *before* the ownership check and masked what the IDOR probe was testing. The other seven DTOs were checked and are correct.

**51/51 live checks** against the running API and real Postgres, including a genuine two-tenant IDOR sweep (a second merchant created directly in Postgres rather than through `POST /merchants/signup`, which also creates a Stripe customer — T20 left three orphans that way). Frontend untouched; the request sequences of the billing, rewards and booking pages were replayed and are unaffected (`/redemptions/available` already always sent `merchantId`). Suite **146 passing** (was 133), `tsc --noEmit` clean, DB re-seeded to exact baseline.

✅ **T30 — done 2026-08-24 (session 15). `jsonwebtoken` adopted.** The task said "consider", so the hand-rolled HS256 was probed first — and it had **four real defects**, three of which let a *correctly signed* token bypass expiry completely, each reproduced at HTTP 200 live: a token with **no `exp`** never expired (`undefined < number` is `false`), a **non-numeric `exp`** never expired either (`NaN < n` is also `false`), and **4-, 5- and 6-segment strings were accepted as JWTs** (`const [h,p,s] = split('.')` drops the rest, so `<valid-token>.garbage` authenticated). The fourth was a non-constant-time `!==` signature compare.

None of those is exploitable without the ability to sign — said plainly rather than inflated. They matter because **T47 (refresh tokens) is the next caller of `sign()`**, and a missed expiry there would have produced an immortal refresh token silently. Checked and found *not* broken: `alg:none` was already refused (the old code never read the header — safe by accident), as was a wrong-secret token.

Same exported API, so all five `sign()` call sites are untouched. Added: pinned `algorithms`, **verified** `iss`/`aud`, `iat`/`jti`, 5s clock tolerance, and a shape check refusing an unknown `role`. Library error strings are mapped back to our own messages — jsonwebtoken says *"jwt audience invalid. expected: glow-plus-app"*, which describes our config to an unauthenticated caller ([F31]'s principle applied to error text). **35/35 live, 11/12 in real Chrome.**

**→ That exposed a real frontend defect, fixed:** `lib/api.js` never cleared a token the server rejected, so a stale session re-sent it forever and showed "Malformed token" with no way out. `apiRequest` now drops the token on a **401 that carried one** — and only 401, since a 403 is a *valid* token refused *one* route (T29's guards) and clearing there would log a merchant out for touching an admin URL.

✅ **T31 — done 2026-08-24 (session 15). Five real defects, all found by running the API.** **45/45 live, 14/14 in real Chrome, 189 unit tests, DB re-seeded to baseline.**

1. 🔴 **`POST /merchants/signup` had NO validation at all.** It bound `@Body() dto: MerchantSignupInput` — a TypeScript **interface**, erased at compile time, so `ValidationPipe` had no metatype and **silently validated nothing**. `password: ""` **created a merchant account whose empty password logs in** (confirmed with `bcrypt.compare('', hash)` against the committed row). A non-email reached Stripe; a missing `businessName` and a numeric password were bare 500s. **Consumers were never exposed** — their DTO is a real class. The paying side had a weaker password rule than the free side: none. Every other `@Body()` was checked; this was the only one.
2. 🔴 **[F27] was only half-fixed.** T60 removed the *trigger* (unverified Resend domain), not the *shape* — the email was still `await`ed unguarded **after** the row committed, so a Resend failure still returned **500 for an account that had been created**, un-retryable (409 next time). Reproduced again this session. Now swallowed and logged on both paths.
3. 🟠 **[F28] closed**, differently per path — see TASKS.md. 6 concurrent signups → one account, **zero 5xx**.
4. 🟠 **`GET /bookings/availability` 500'd on a missing query param.** `AvailabilityQueryDto` **already existed and was never wired up**; the controller bound three loose `@Query()` strings instead. Now 400.
5. 🟠 **The body-size limit worked; the report was a 500.** body-parser errors aren't `HttpException`s, so they fell to the generic 500 — the client was told to retry something that can never succeed. Now 413/400.
6. 🟡 **No string field in the API had a max length** — a 100,000-char `name` was written to Postgres. New `common/limits.ts` across all 9 DTO files.

**Dependency audit:** 27 → **25, and 1 critical → 0.** The critical (`tar` ← `node-pre-gyp` ← **`bcrypt`**) was traced, not assumed — `tar` is only reached from node-pre-gyp's install paths, never from `bcrypt.find()` at runtime. Removed anyway by swapping **`bcrypt` → `bcryptjs`**, verified drop-in first (existing native `$2b$` hashes verify, same output prefix, same speed) and then live for all three roles. It also drops a native binary from the Vercel serverless target. Everything left is dev-only tooling or unreachable transitives, and **all of it needs Nest 10 → 11** → raised as **T31c**, deliberately not done inside a security pass days before deploy.

**Confirmed NOT broken** (so the record isn't inflated): no secret material in 15 swept routes, no internals in 7 failure modes, no account enumeration on login or forgot-password, headers clean, HSTS correctly production-gated, nothing mass-assignable.

✅ **T31b — done 2026-08-24 (session 15), by explicit user request to implement rather than only decide.** The docx claims, twice, that phone numbers are encrypted and that an `ENCRYPTION_KEY` exists. **Neither was true** — verified by signing up through the live API with `+254712345678` and reading the row straight back out of Postgres: it came back in clear text. No `ENCRYPTION_KEY` anywhere, no encryption code in `src/`, no `pgcrypto` extension in the database.

Built **application-level AES-256-GCM** rather than the cheaper "rely on provider disk encryption" option, because the docx's false claim feeds directly into the privacy policy (T66) and the user asked for it done, not just flagged. New `common/pii-crypto.ts` — two columns, because authenticated encryption's random IV means the same number encrypts differently every time: `phone` holds the ciphertext, `phoneFingerprint` (a column that **already existed in the schema with zero code references**, per T13's note — this is what it was for) holds a keyed HMAC-SHA256 blind index and carries the `@unique` constraint that would otherwise break. `ENCRYPTION_KEY` is now `ALWAYS_REQUIRED` in `env.validation.ts`, same tier as `JWT_SECRET`, checked for correct length and for not reusing `JWT_SECRET` (independent rotation). Migration applied to real Postgres with **no backfill** — `decryptPii()` passes a legacy plaintext value through unchanged, verified by inserting one directly via raw SQL and confirming it coexists with encrypted rows.

Wired at the only two places a phone number moves through the API: `auth.service.ts` encrypts on signup, `bookings.service.ts` decrypts for the merchant's own booking view. **17/17 live checks** against the real API and real Postgres (read with raw SQL, bypassing Prisma): the stored value for `+254712345678` was `v1:yHmNsR2W4Vy5o8OX:E-_rWjwHZ8rAENsLDKmb-Q:nuuL56ChI00f08Kufg`; a duplicate phone on a second signup still gets **409**; a different phone succeeds; no phone leaves both columns **NULL** (not an encrypted empty string), and a second no-phone user also succeeds, proving NULL uniqueness; the full loop — book as the phone-bearing consumer, read `GET /bookings` as the merchant — returned the correctly **decrypted** `+254712345678`, not ciphertext. Suite **218 passing** (was 189): new `pii-crypto.spec.ts` (25) plus `env.validation.spec.ts` +6. `tsc --noEmit` clean. DB re-seeded to exact baseline.

✅ **F24 (auth-switch links unclickable) — confirmed live 2026-08-24, user-reported independently of any task list, and it was a real gap: recorded as a finding since session 3 with no task ever attached to it.** Reproduced in a driven browser and it's worse than first written down: `view-business-auth` renders *"Go to customer login"* as text with **zero `<a>` elements** in the view — plain dead text; `view-consumer-auth` doesn't even keep the text, only *"Run a salon instead?"* survives. The whole landing page has exactly **one** anchor total (the logo). Now explicitly called out as T35's starting point, the same way F25 already anchors T39. **Not fixed yet** — T35 needs a design call on where those links should actually go once real auth exists, so this is scoped, not resolved.

➡️ **NEXT: T32 (M-Pesa — needs a client decision; do not start without one) or Phase 5 (T33+, the website build).** Check `TASKS.md` for the next unticked item, and see its new **"Message for the client"** section at the end for exactly what to say about T32 and the now-resolved T31b. **T31c** (Nest 11 / Vite 8 majors) is still open and should land before the client runs their own `npm audit`.

**Everything needed to test is already working**: Postgres migrated, backend compiling and running, seed data, an auth helper, Jest, Stripe forwarding. A new session should be able to start coding T15 immediately after starting the three servers.

**New findings from session 15** (T30 and T31 — every one reproduced against the running API, not read out of the source):

| # | Finding |
|---|---|
| **F35** | **`POST /merchants/signup` had no input validation whatsoever, and `password: ""` created a working account.** The controller bound `@Body() dto: MerchantSignupInput` — a TypeScript **interface**. Interfaces are erased at compile time, so `ValidationPipe` has no metatype to read and **skips validation silently**: no warning, no error, it simply does not run. `whitelist: true` is inert for the same reason. Confirmed by querying Postgres directly — the committed merchant row satisfied `bcrypt.compare('', hash)`. **Consumers were never exposed**: their `SignupDto` is a real class with `@MinLength(8)`, so the *paying* side of the platform had a weaker password rule than the free side — none at all. **The lesson generalises: a DTO that is an `interface` or a `type` is not validated, and nothing tells you.** Every other `@Body()` was checked and binds a real class. Fixed in T31 |
| **F36** | **[F27] was only half-resolved, and the remaining half is the one that recurs in production.** T60 verified the Resend domain and F27 was ticked — but that removed the **trigger**, not the **shape**. `sendVerificationEmail` was still `await`ed, unguarded, *after* the account row committed, so a non-2xx from Resend still returned **500 for an account that had in fact been created**, un-retryable (409 next time). Reproduced again in session 15 against live Resend. **Any transient outage of a third-party mailer reproduces it.** F27's own note said *"the email send must not be able to fail the signup"* — that sentence was never actually implemented. Fixed in T31 on both signup paths |
| **F37** | **Four defects in the hand-rolled JWT, three of which defeated expiry entirely.** No `exp` claim → never expired (`undefined < number` is `false`); non-numeric `exp` → never expired (`'abc' < n` and `NaN < n` are also `false`); and **4-, 5- and 6-segment strings were accepted as JWTs**, because `const [h,p,s] = token.split('.')` drops the remainder — so `<valid-token>.garbage` authenticated. The fourth was a non-constant-time `!==` on the signature. All three expiry bypasses require the ability to **sign**, so none was exploitable by an outsider — they mattered because **T47 (refresh tokens) is the next thing to call `sign()`**, where a missed expiry would silently mint an immortal token. Resolved by T30's move to `jsonwebtoken`. Worth remembering: `alg:none` was *already* refused, because the old code never read the header at all — **safe by accident, not by design** |
| **F38** | **A DTO can exist, be correct, and simply never be wired up.** `AvailabilityQueryDto` sat in `bookings/dto.ts` fully written while `GET /bookings/availability` bound three loose `@Query('x') x: string` params — which `ValidationPipe` does not validate. A missing id reached `findUnique({ where: { id: undefined } })` and returned a bare **500**. This is [F34]'s family (*a guard fixes who is asking, never what they may scope the question to*) recurring on a **public** route. **Grep for DTO classes nothing imports.** Fixed in T31 |
| **F39** | **A control can work perfectly and still be a defect if it reports itself wrong.** Express's 100kb body limit was enforced correctly the whole time — but body-parser's errors are plain `Error`s carrying an HTTP `status` and a `type`, **not** `HttpException`s, so they fell past every branch of the exception filter into the generic **500**. The client was told "Internal server error" and to retry, for a request that can never succeed. Now 413/400 with our own message — body-parser's own text names the configured byte limit, which there is no reason to publish. **Anything throwing a non-`HttpException` with meaning is invisible to the filter; check for others.** Fixed in T31 |
| **F40** | **No string field in the entire API had a maximum length.** Every `@IsString()` accepted whatever fit inside the body limit, and Prisma's `String` is Postgres `text`, unbounded too. A **100,000-character `name`** was accepted by `POST /auth/signup` and written to the database — read back out of Postgres to confirm. Not dramatic; slow. Every unbounded field is a way to fill the client's database, inflate every response carrying the row, and push unbounded text into the emails these fields are interpolated into. New `common/limits.ts` covers all 9 DTO files. Note `MAX_PASSWORD` is **not** about storage: **bcrypt ignores everything past 72 bytes**, so a longer passphrase is silently truncated and the user never told |
| **F41** | **The docx asserts two controls exist that do not: an M-Pesa/Daraja webhook, and phone-number encryption.** Both checked exhaustively rather than assumed. M-Pesa: zero hits for `m-pesa`/`daraja`/`safaricom`/`stk push`/etc. across every source file (two search tools), no payment SDK but `stripe` in any `package.json`, no transaction model in Prisma, no `MPESA_*`/`DARAJA_*` env keys, and — read straight from the live boot log — **exactly one webhook among 55 routes, and it is Stripe's.** Encryption: no `ENCRYPTION_KEY` in either `.env` file, zero encryption code in `src/`, no `pgcrypto` extension in Postgres, and a live-submitted phone number came back in clear text. **The lesson: a requirements document can assert a control exists in prose with no way to check it except running the actual system** — this delivery had two such claims, both false, both independently verified against the real repo and the real running app rather than trusted. M-Pesa remains open, blocked on the client (T32); the encryption claim is now made TRUE by T31b rather than merely corrected |

**New findings from session 12** (both found by running the code, not reading it):

| # | Finding |
|---|---|
| **F32** | **Guards cannot rate-limit unauthenticated traffic in this app.** Nest runs middleware before guards, and `AuthMiddleware` throws 401 first, so a `ThrottlerGuard`-based limiter never sees an anonymous request to a protected route — every one stayed floodable. Visible in the headers: a 401 from `GET /styles` carried no `X-RateLimit-*` at all. Fixed in T26 by moving the API-wide tier into middleware applied ahead of `AuthMiddleware`. **Anything else that must apply to every request has the same constraint.** |
| **F33** | **`req.path` is `/` inside `forRoutes('*')` middleware.** Express strips the matched mount prefix from `req.url`, and with a `*` mount the whole path is the prefix. Every path-based exemption missed — `/health` and the Stripe webhook were both being throttled — while unit tests passing a path string stayed green. Use `req.originalUrl`. Relevant to **T29**, since `RequireActiveSubscriptionMiddleware` is also path-matched and also matches nothing [F30]. |

**New finding from session 14** (found by T29's own audit, not by reading):

| # | Finding |
|---|---|
| **F34** | **The `undefined`-filter trap [F29] survives in a query param, on a route that was role-guarded from birth.** `GET /redemptions/available` reads `merchantId` from the query string, so it can simply be absent; `undefined` reached `rewardRule.findMany({ where: { merchantId } })`, Prisma dropped the filter, and the route returned every merchant's active reward rules. **A guard fixes _who_ is asking, never _what they may scope the question to._** Route params are safe (always a string); query params, optional DTO fields and anything defaulted are not. Fixed in T29 — now 400. |

**New findings from session 4** (all reproduced against the running API):

| # | Finding |
|---|---|
| **F29** | ✅ **RESOLVED 2026-08-24 by T29.** **🔴 Cross-tenant data leak.** A **consumer** token on `GET /styles` returns **200 and every style row**. 19 call sites pass `req.merchantId!`; a consumer has no `merchantId`, so `undefined` reaches `findMany({ where: { merchantId } })` and **Prisma drops an `undefined` filter**, returning the whole table. The seed has one merchant, which is why it looked plausible. There is **exactly one role check in the entire codebase** and it picks a branch rather than denying. → **T29** |
| **F30** | ✅ **RESOLVED 2026-08-24 by T29.** **🔴 The subscription paywall is inert.** `RequireActiveSubscriptionMiddleware` is registered for `styles/(.*)`, `visits/(.*)`, `reward-rules/(.*)` and matches **none** of the real paths. With the merchant forced to **`SUSPENDED`**, `GET /styles` still returned 200 and `POST /styles` still returned **201 and created the row** — a revenue control that does nothing. Same class as [F3]. Its own `if (!req.merchantId)` guard **would have caught F29** had it ever run. → **T29** |
| **F27** | ✅ **RESOLVED 2026-08-24 by T60** — signup now returns **201** and the email is delivered. Was: **`POST /auth/signup` returned 500 *after* creating the account.** The user row is committed, then `sendVerificationEmail` throws — Resend answers `403 "You can only send testing emails to your own email address"` [R6]. So the client sees a failure, cannot retry (409 on the second attempt), and never gets a verification email. **Pre-existing, not caused by T16.** The email send must not be able to fail the signup. Blocks clean testing of **T19/T21**; **T60** removes the underlying cause. |
| **F28** | **Signup's duplicate check is a check-then-create race.** Four concurrent signups on one fresh email: 1 succeeded, **3 raised Prisma `P2002`** — bare 500s before T16, correct 409s after. The filter makes it degrade safely; the real fix (drop the pre-check, rely on the unique constraint) belongs to **T31**. |

**New findings from session 2** (all verified by running the code, not by reading it):

| # | Finding |
|---|---|
| **F19** | **No Stripe webhook had ever been processed successfully.** `billing.controller.ts` reads `req.rawBody`, but Nest's global JSON parser consumed the stream before `billing.module.ts`'s `express.raw()` ran, so `req.rawBody` was always `undefined` and **every** event failed signature verification with 400. Fixed with `rawBody: true` on `NestFactory.create()`. Verified 4×400 → 4×200. Affects T17, T20; T57 must re-verify under Vercel. |
| **F20** | **`JWT_SECRET` in `.env` was the literal placeholder from `.env.example`** — a published string. A hand-forged `role:'admin'` token was **accepted (200)** by the running API. Rotated to 48 random bytes; forged token now 401. |
| **F21** | **T13's own description was wrong**: the booking modules' relative imports were never broken. They were always written for `src/modules/bookings/` — they simply weren't at that path. T13 was a pure move, no import rewriting. |
| **F22** | `src/modules/points/` and `src/modules/redemptions/` are **empty placeholder directories** (0 files) — corroborates [F4]. The `{prisma,src` folder is a failed `mkdir -p` brace expansion, also all empty, untracked by git. |
| **F23** | `prisma/seed.ts` sits outside tsconfig's `rootDir` (`./src`), so watch builds emitted `prisma/seed.js` in place. Added `exclude: [..., "prisma"]` and gitignored `prisma/*.js`. |

**Note on merchant booking routes:** they are deliberately **not** behind `RequireActiveSubscription` — it's path-based and `bookings/*` mixes consumer and merchant routes, so a blanket rule would break consumer booking. Flagged for T29's authorization audit.

## 9. RISK REGISTER — things that could cause trouble

Ranked by how much damage they can do. Items 1–3 are commercial, not technical.

### R1 — The desktop app does not exist, but $600 was priced on "two apps"
The docx has a whole section 6, *"Mobile and Desktop Applications"*, stating **"The product includes mobile and desktop applications"** and **"Neither the mobile nor desktop application has completed the actual App Store, Google Play Store, or code-signing process."**

**Verified: there is no desktop app anywhere in the delivery.** No Electron, no Tauri, no desktop package.json. The only client is one Expo app whose `app.json` targets **iOS and Android only**.

This matters because on 2026-08-19 the price was raised from $400 to $600 on the stated basis that *"there are actually two separate apps involved."* Only one app was delivered. **Clarify with the client what the second application is before Order 2** — it may be undelivered, may not exist, or "the website" may have been what was meant.

### R2 — The website is not built, and the client believes it is
See [F9][F10]. Phase 5 is the largest block of work in the project and appears nowhere on the client's 23-item list. Absorbing it silently means doing a large unpaid build inside a $300 order.

### R3 — M-Pesa/Daraja does not exist  ⚠️ **EXHAUSTIVELY VERIFIED 2026-08-24 (session 15)**

The docx states it as fact — *"The Daraja M-Pesa webhook currently **does not have IP allowlisting. This was identified during development but remains unresolved**"* — and lists *"Secure the Daraja webhook"* in its 23-item list. Both sentences presuppose a working integration missing one control.

**There is no M-Pesa code anywhere in the delivery.** Six independent checks, two different search tools:

1. Case-insensitive search for `m-pesa`/`mpesa`/`daraja`/`safaricom`/`stk push`/`lipa na`/`paybill`/`shortcode`/`till number`/`consumer_secret` across every `.ts/.js/.jsx/.tsx/.json/.md/.html/.prisma/.env/.yml` → **zero hits outside our own `TASKS.md`/`CONTEXT.md`.** Run with ripgrep **and** plain grep.
2. Every `package.json` (backend, website, old frontend, mobile) → **no payment SDK but `stripe`.**
3. Prisma schema (15 models, 8 enums) → **no payment/transaction/ledger model**; the only money model is `Subscription`.
4. `.env` **and** `.env.example` → **no `MPESA_*`/`DARAJA_*` keys.** A real integration needs `CONSUMER_KEY`, `CONSUMER_SECRET`, `SHORTCODE`, `PASSKEY`, `CALLBACK_URL` — none present.
5. **All 55 live routes** from the running API's boot log → **exactly one webhook, `POST /billing/webhook` (Stripe).**
6. Mobile app, all 13 source files → nothing payment-related.

**"Add IP allowlisting to the Daraja webhook" is therefore not a task that can be performed** — there is no webhook to allowlist. A real build means Daraja OAuth, STK push, a public callback, replay protection + idempotency, a transactions model and migration, reconciliation with rewards, and Safaricom sandbox **plus** production credentials (needing a registered Kenyan shortcode/paybill). **Unpriced; second-largest hidden-scope item after the website.** → see the **"Message for the client"** section at the end of `TASKS.md`.

### R4 — Credentials are already compromised
The Stripe secret key, webhook secret, and Resend API key travelled through a zip file, Fiverr chat, **and were sitting in `.env.example`** (a file normally committed to git). The client's Vercel token was also pasted into Fiverr chat. **Tell the client in writing to rotate all of them.** If that account is later abused, the record should show it was flagged.

**Severity re-checked 2026-08-23 (prefixes inspected locally, values never printed):**

| Credential | Verdict |
|---|---|
| `STRIPE_SECRET_KEY` | **`sk_test_` — test mode.** Cannot move real money. Leak is low-severity; rotate before production (T27), not urgently. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_` — test-mode endpoint; regenerated by `stripe listen` during dev anyway. |
| `RESEND_API_KEY` | **Live and confirmed working** (`GET /api-keys` → 200). Resend keys have no test mode — a leak lets anyone **send email as this account**. This is the highest-severity of the three; rotate first. |

So the original "live Stripe secret key" framing overstated Stripe and understated Resend. **Resend is the one to rotate first.**

**Resend account state (verified 2026-08-23):** `GET /domains` → `[]` — **no verified domain**, so sending is still limited to `onboarding@resend.dev`, which delivers only to the account owner's own address [R6]. Two API keys exist: `glow` (created 2026-08-14, in active use) and `glow-plus-dev` (created 2026-08-13, **never used** — a spare, safe to delete during rotation).

### R5 — Vercel cron jobs will silently not fire
`@Cron()` needs a long-running process. On Vercel serverless the four jobs **never run and never error**. Two of them are features the client specifically asked to see working (trial-ending email, points expiry). If deployed without T54, this surfaces *after* delivery as "the emails don't work."

### R6 — Email cannot be tested to real customers until a domain exists
Resend's shared `onboarding@resend.dev` sender only delivers to the Resend account owner's own address. The trial-ending and payment-failed flows can be fully verified end-to-end, but **not delivered to an arbitrary customer address** until the client buys a domain. Document this so it doesn't read as an unfinished feature.

### R7 — "Combine app and website" expectation
On 2026-08-18 the client wrote *"please combine app and website so they work together."* The current plan defers all mobile work to Order 2. That's reasonable, but the client may expect the app connected as part of the first order. **Worth confirming explicitly.**

### R8 — The mobile app's assets are missing (Order 2)
`app.json` references `./assets/icon.png`, `splash.png` and `adaptive-icon.png`. The `assets/` folder contains only `.gitkeep`. The Expo app will not build until those exist.

### R9 — Treat the docx as a narrative, not an inventory
Its actual title is **"Software Developer Project Experience & Technical Assessment"**, and it closes with *"The project demonstrates practical experience with the complete software-development lifecycle."* It reads as a reflective/portfolio write-up, which explains why it asserts things aspirationally — the frontend, the desktop app, and M-Pesa are all described as existing when they don't. **Verify every claim in it against the code before accepting it as scope.** Its backend analysis, by contrast, has proven accurate.

## 10. Open items needing the user / client

- **Rotate the Stripe and Resend keys** — they travelled through a zip and Fiverr chat, and were sitting in `.env.example`.
- **Rotate the Vercel token** the client pasted in Fiverr chat (`vcp_…`) before using it.
- **Is M-Pesa in scope?** (no code exists)
- **Confirm the website rebuild** (biggest item, absent from the client's list)
- **Vercel plan** — Hobby allows only 2 cron jobs at once-daily; this project has 4 → Pro (~$20/mo) or consolidate.
- Domain purchase — blocks production email and Stripe webhooks.

---

## 11. Website migration to React + Vite — DONE (session 3, 2026-08-23)

Requested by the user out of task order. **Structural migration only** — same
design, same content, same behaviour. The API wiring was deliberately left for
Phase 5/6.

### What exists now

`website/website/glow-plus-web/` — one Vite app, **three entry points**:

| Entry | Serves | Source |
|---|---|---|
| `index.html` | the 6-view main site | `Glow-Plus-Website .html` (1,932 lines) |
| `verify-email.html` | `/verify-email` | `glow-plus-frontend/public/verify-email.html` |
| `billing-result.html` | `/business/billing` | `glow-plus-frontend/public/billing-result.html` |

Three entries rather than one SPA because the two Stripe/verify pages carry
their own stylesheets that target bare `body`, `.card`, `h1`, `p` — separate
documents is what keeps them from colliding with the main site's CSS.

**Read `glow-plus-web/MIGRATION.md` before touching this app.** It documents the
architecture, the storage seam, and every carried-over quirk.

### The critical thing to know: the storage seam

The prototype persisted via `window.storage` — a Claude-artifact API that does
not exist in a real browser, so [F9] "saves nothing, silently" was literal.

`src/lib/storage.js` now keeps that **exact async contract** (`get(key) →
{value}|null`, `set(key, value)`) but is backed by `localStorage`. Every caller
in `src/lib/data.js` ported over unchanged.

➡️ **This is the single file Phase 5/6 replaces to move onto the real API.**
Nothing else in the app needs to change. Do not scatter `fetch` calls through
the views.

### Verified, not assumed

Both run against the original (served on `:8080`) and the new app side by side
in real Chromium. Scripts are in the session scratchpad (`compare.js`,
`functional.js`) — rewrite them if needed, they're throwaway.

- **Layout fingerprint** (tag, class, id, text, bounding rect for every element,
  in document order): **276 vs 276 elements, IDENTICAL at 1280px and 390px.**
- **Functional:** 67/67 checks pass — 8 languages + Arabic RTL, business signup,
  styles, reward rules, visit logging, reward-trigger modulo maths, portal
  stats, ledger, consumer dashboard, admin approve/suspend, persistence across
  reload, both Stripe/verify pages in every state, zero console errors.
- **Production build** checked separately: `/verify-email` and `/business/billing`
  both 200 with the correct page titles.

### Routing — do not break these two URLs

The backend has them baked in (`APP_URL`; `billing.service.ts` `success_url` /
`cancel_url`). Express used to map them; now:

- **dev/preview** — a plugin in `vite.config.js`
- **production** — `vercel.json` rewrites

Any other host needs the same two rewrites or email verification and Stripe
returns break.

### Two gotchas that will waste time if forgotten

1. **A stray `C:\Users\GCA\Documents\postcss.config.js`** (outside the repo)
   requires `tailwindcss`. Vite walks up the tree and fails the build on it.
   `vite.config.js` declares `css.postcss` inline to stop the search — **don't
   remove that block.**
2. **Don't run `glow-plus-frontend` and `glow-plus-web` together** — both bind
   :3000, and `glow-plus-web` uses `strictPort`.

### Carried over as-is — pre-existing, NOT introduced (F24–F26)

| # | Finding |
|---|---|
| **F24** | **The auth-switch links never worked.** The markup nested a "Go to business login" / "Go to customer login" anchor inside a `[data-i18n]` element, and `applyStaticTranslations()` overwrote that element's `innerHTML` with the plain-text translation, destroying the anchor on first render. The `business_login_link` key exists in all 8 languages and is referenced by nothing. One-line fix; needs a design call. |
| **F25** | **Mobile overflows horizontally.** At a 390px viewport the document is 401px wide — the `.topnav` buttons don't wrap. Measured identically on the original, so it is original, not migration damage. This is **T39**. |
| **F26** | **`footer_note` is now factually wrong.** It reads "data is shared & persisted live for everyone previewing this page" — true of the artifact's shared `window.storage`, false of per-browser `localStorage`. Needs a copy change or the API wiring that makes it true again. |

### What this does and doesn't close in TASKS.md

- ✅ **T34** (project setup) — structurally done: framework, entry points, routing, storage seam
- ✅ **T40** (preserve i18n) — all 8 languages + Arabic RTL verified
- ✅ **T41** (keep verify-email + billing-result working) — verified in every state
- ⬜ **T35–T38** (auth UI, consumer, merchant, admin against the **real API**) — still open
- ⬜ **T39** (mobile-friendly) — still open; see F25
- ⚠️ **Blocked on missing endpoints** — the SPA views still cannot be wired until
  these exist: `GET /me/rewards` (**T42**), `GET /visits/me` (**T45**), and a
  **reward-rules controller — that module has no HTTP routes at all.**
  `GET /merchants` public directory (**T43**) and `GET /styles/public/:merchantId`
  (**T44**) now partially exist — **T18** (2026-08-24) added minimal versions
  (`/merchants/public`, `/styles/public/:merchantId`) to unblock the standalone
  booking page. They're stopgaps, not the final shape (no pagination/search) —
  T43/T44 are still open, but the SPA's future salon-directory view can likely
  reuse them as-is.
