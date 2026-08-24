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
| Postgres | ✅ `docker-postgres-1`, Postgres 16.15, port **5433**, db `glowplus`. **Migrated — 13 tables + `_prisma_migrations`** (was 0 applied; `PasswordReset` added T21, `Admin` added T22) |
| Backend | ✅ **Compiles (0 TS errors) and runs on :4000**, 38 routes mapped (T23 added 4), Prisma connected |
| Website | ✅ **Now React + Vite** — `glow-plus-web` on :3000 (`npm run dev`). Migrated session 3; see §11. The old `glow-plus-frontend` (Express) still exists but is **superseded** — don't run both, they both want :3000 |
| Stripe CLI | ✅ Forwarding verified; **webhook now returns 200** (was 400 on everything — see F19) |
| Tests | ✅ Jest configured, **55 passing** (`npm test`) — 8 suites: jwt.util, health controller, exception filter, billing readPeriod, require-merchant guard, require-consumer guard, require-admin guard, trialEndingReminder job |
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
| **F3** | **Rate limiting is applied to nothing.** `rateLimit.middleware.ts` has zero references. The client believes `/auth/login` is protected; it is not. |
| **F4** | ✅ **RESOLVED 2026-08-24 by T23.** ~~Nothing writes to the `Redemption` table.~~ `src/modules/redemptions/` now writes to it, with double-redemption blocked inside a transaction. |
| **F5** | No password-reset code exists at all. |
| **F6** | `MerchantStaff` table exists in schema + migration, but **zero code uses it**. |
| **F7** | `/admin/*` has no guard — the code comments admit it. |
| **F8** | `expirePoints.job.ts` writes `data: {}` — a literal no-op. |
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

➡️ **NEXT: T24 — Merchant staff accounts + roles.** [F6] The `MerchantStaff` table exists in schema and migration but **zero code uses it**. Needs staff auth, an invite flow, role-scoped permissions, and a staff-management UI with role-limited views.

**Everything needed to test is already working**: Postgres migrated, backend compiling and running, seed data, an auth helper, Jest, Stripe forwarding. A new session should be able to start coding T15 immediately after starting the three servers.

**New findings from session 4** (all reproduced against the running API):

| # | Finding |
|---|---|
| **F29** | **🔴 Cross-tenant data leak.** A **consumer** token on `GET /styles` returns **200 and every style row**. 19 call sites pass `req.merchantId!`; a consumer has no `merchantId`, so `undefined` reaches `findMany({ where: { merchantId } })` and **Prisma drops an `undefined` filter**, returning the whole table. The seed has one merchant, which is why it looked plausible. There is **exactly one role check in the entire codebase** and it picks a branch rather than denying. → **T29** |
| **F30** | **🔴 The subscription paywall is inert.** `RequireActiveSubscriptionMiddleware` is registered for `styles/(.*)`, `visits/(.*)`, `reward-rules/(.*)` and matches **none** of the real paths. With the merchant forced to **`SUSPENDED`**, `GET /styles` still returned 200 and `POST /styles` still returned **201 and created the row** — a revenue control that does nothing. Same class as [F3]. Its own `if (!req.merchantId)` guard **would have caught F29** had it ever run. → **T29** |
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

### R3 — M-Pesa/Daraja does not exist
The docx says its webhook "needs securing", implying it's built. There is **no M-Pesa code in the repo**. If the client expects a working integration, that's a from-scratch build that isn't priced.

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
