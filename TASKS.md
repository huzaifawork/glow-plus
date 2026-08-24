# Glow+ — Task Tracker

**Analysis date:** 2026-08-23 · **Status:** `[ ]` todo · `[~]` partial · `[x]` done & tested · `[!]` blocked / needs decision

### Where each task comes from

Not every task here was asked for by the client. Three categories:

1. **Client-requested** — on the docx's 23-item priority list and/or in the Fiverr chat. This covers Phases 2, 3, 4, 8 and 9 almost entirely. These are the contractual deliverables.
2. **Required to make client-requested work possible** — not named by the client, but their requests are impossible without them. T13/T14 are the clearest case: the client asks to "run the booking workflow against the real PostgreSQL database", which cannot happen while the module doesn't compile, isn't imported, and has no tables.
3. **Mine — housekeeping or enablers** — marked `[MINE]`. T2 (flatten nesting), T8 (seed script), T10–T12 (test tooling). None are contractual; drop them freely if time is short.

**Phase 5 (website build) is the exception worth flagging:** it is _not_ on the client's list, but it is not optional either — the client believes the frontend already works [F9][F10]. That gap needs raising with them, not quietly absorbing.

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

Why this is strict: the exact problem we were hired to fix is _"functionality that exists vs. functionality that's been validated."_ Two features the client wants most were written but never watched running — and T13 below proves one of them **could never have worked**.

### Servers stay running so both sides can test

The dev servers run in the background for the whole session, so testing isn't only my report — it can be verified independently in a browser at any time.

| What        | URL                     | Notes                                                       |
| ----------- | ----------------------- | ----------------------------------------------------------- |
| Backend API | `http://localhost:4000` | NestJS, `npm run start:dev` — hot-reloads on save           |
| Website     | `http://localhost:3000` | matches the backend's `APP_URL`/`ALLOWED_ORIGINS`           |
| Postgres    | `localhost:5433`        | Docker, matches `DATABASE_URL`                              |
| Stripe CLI  | —                       | `stripe listen --forward-to localhost:4000/billing/webhook` |

Rules:

- Servers start at T3/T4 and **stay up** — not started and stopped per task.
- After finishing a task, state **exactly what to click or call** to verify it (URL, page, or request), so it can be re-checked independently.
- If a server dies or a port is taken, say so immediately rather than reporting a task as passing.
- **Requires Docker Desktop running** for Postgres — the one dependency that must be up first.

---

## Verified findings (checked in the files, 2026-08-23)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F1  | **Bookings + BusinessHours modules are never imported** — the booking feature isn't loaded at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `src/app.module.ts` imports list                                            |
| F2  | **Booking/BusinessHours tables don't exist in the DB** — schema is split across two files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | only migration `20260812153753_init` creates 9 tables, none of them Booking |
| F3  | **Rate limiting is applied to nothing.** Worse than the client thinks — they believe `/auth/login` is covered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `rateLimit.middleware.ts` has zero references anywhere in `src/`            |
| F4  | **Nothing writes to `Redemption`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no create/update on redemption in `src/`                                    |
| F5  | **No password-reset code exists at all**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | zero matches for reset/forgot in `src/`                                     |
| F6  | ✅ **RESOLVED 2026-08-24 by T24.** **`MerchantStaff` table exists but zero code uses it**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | model + migration present, no code references                               |
| F7  | **`/admin/*` has no guard** — the code comments admit it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `admin.controller.ts:3-5`                                                   |
| F8  | ✅ **RESOLVED 2026-08-24 by T25.** ~~**`expirePoints` writes `data: {}`**~~ — a literal no-op placeholder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `expirePoints.job.ts`                                                       |
| F9  | **The website is an artifact prototype, not an app** — 0 `fetch`, 0 password fields, data layer is `window.storage` (doesn't exist in browsers)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `Glow-Plus-Website .html` (1,932 lines)                                     |
| F10 | **The original dev says the frontend needs "their own, much bigger buildout"**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `glow-plus-frontend/README.md`, final section                               |
| F11 | Email provider **does** support Resend; defaults to `log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `email.provider.ts` — set `EMAIL_PROVIDER=resend`                           |
| F12 | ✅ **RESOLVED 2026-08-24 by T30** (the refresh half remains T47). Was: JWT is hand-rolled HS256, fixed 7-day, **no refresh**. The hand-rolled part is gone — `jsonwebtoken@9`, algorithm pinned, `iss`/`aud` verified, `iat`/`jti` issued. Probing the old code before replacing it found **four live defects**, three of which let a correctly-signed token bypass expiry entirely (no `exp` claim, non-numeric `exp`, and 4+ segment tokens all returned **200**); the fourth was a non-constant-time signature compare. Expiry is still a fixed 7 days with no refresh token — **that is T47**, and T30's `jti` is the hook it needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `jwt.util.ts`                                                               |
| F13 | No `/health` endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | no matches in `src/`                                                        |
| F24 | ✅ **CONFIRMED LIVE 2026-08-24 — user-reported, now scheduled under T35.** **The auth-switch links are unclickable.** A "Go to business login" / "Go to customer login" anchor is nested inside a `[data-i18n]` element, and `applyStaticTranslations()` overwrites that element's `innerHTML` with the plain-text translation, **destroying the anchor on first render**. **Reproduced in a driven browser, and it is worse than first recorded — the two views fail differently:** in `view-business-auth` the text *"Here to earn rewards? Go to customer login"* renders but the view contains **zero `<a>` elements**, so it is plain, dead text; in `view-consumer-auth` the link text is **gone entirely** — only *"Run a salon instead?"* survives, with no link and no anchor at all. The whole landing page has exactly **one** anchor (the logo). The `business_login_link` key exists in all 8 languages and is referenced by **nothing** in the rendered DOM. Pre-existing in the prototype and carried through the React migration unchanged — **not** migration damage. Recorded as a finding since session 3 with **no task attached**; now a called-out starting point for **T35**, which needs a design call on where those links should go once real auth exists | `view-consumer-auth` / `view-business-auth` |
| F25 | ✅ **RESOLVED 2026-08-24 by T36.** ~~**Mobile overflows horizontally** — at a 390px viewport the document is 401px wide because the `.topnav` buttons don't wrap.~~ Fixed with `flex-wrap:wrap` on `.topnav`; re-measured at **390px on all six SPA views**. Was pre-existing (measured identically on the original), and T35's Log out button had made it 460px. T39's remaining mobile work is qualitative → **T39**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Chromium, both versions, session 3                                          |
| F26 | **`footer_note` is now factually wrong** — it reads "data is shared & persisted live for everyone previewing this page", true of the artifact's shared `window.storage`, false of per-browser `localStorage`. Needs a copy change or the API wiring that makes it true again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `translations.js`, key `footer_note`                                        |
| F29 | ✅ **RESOLVED 2026-08-24 by T29.** **🔴 Cross-tenant data leak: a CONSUMER token reads merchant-only routes.** `GET /styles` with a consumer's token returns **HTTP 200 and every style row** — reproduced live. Cause: 19 controller call sites pass `req.merchantId!`, and the `!` is a lie — a consumer's token has no `merchantId`, so `undefined` reaches `findMany({ where: { merchantId } })`, **Prisma drops an `undefined` filter**, and the query returns the whole table instead of one merchant's rows. The seed DB has one merchant so the response looked plausible; with two merchants it returns both. `GET /visits` behaves identically (empty only because there are no visit rows). Writes fail closed by luck — `POST /styles` 500s because Prisma rejects a null required column, not because anything checked. **There is exactly ONE role check in the whole codebase** (`bookings.controller.ts:39`) and it selects a branch rather than denying. → **T29**, and it makes T22's admin guard part of a bigger pattern | reproduced live 2026-08-23                                                  |
| F30 | ✅ **RESOLVED 2026-08-24 by T29.** **🔴 The subscription paywall does not work — `RequireActiveSubscriptionMiddleware` never runs.** Registered in `app.module.ts` for `styles/(.*)`, `visits/(.*)`, `reward-rules/(.*)`, it matches **none** of the real paths — not `/styles`, not `/styles/`, not `/styles/abc`. Proved commercially, not just structurally: with the merchant set to **`SUSPENDED`**, `GET /styles` still returned **200** and `POST /styles` still returned **201 and created the row**. So a cancelled or suspended merchant keeps full use of the product. This is the same class of defect as [F3] (rate limiting applied to nothing) — middleware that exists, reads correctly, and is wired to nothing. Note the middleware's own `if (!req.merchantId) throw ForbiddenException` **would have caught [F29]** had it ever executed. → **T29** (+ revisit the note under T14 about booking routes deliberately not being behind it)                                                                                 | reproduced live 2026-08-23                                                  |
| F34 | ✅ **RESOLVED 2026-08-24 by T29 (found by it, in the same pass).** **[F29]'s `undefined`-filter trap survives in a query param, on a route that was guarded from birth.** `GET /redemptions/available` takes `merchantId` as a **query** param, so it can simply be absent — `undefined` reached `rewardRule.findMany({ where: { merchantId } })`, Prisma dropped the filter, and the route returned the active reward rules of **every merchant on the platform**. T23 role-guarded this route on day one and it leaked anyway: **a guard fixes _who_ is asking, never _what they may scope the question to_.** Route params can't do this (always a string); query params, optional DTO fields and anything defaulted can. Now **400** | reproduced live 2026-08-24, then fixed |
| F31 | ✅ **RESOLVED 2026-08-24 by T17.** ~~`GET /merchants/me` and `GET /admin/merchants/pending` returned the merchant's bcrypt `passwordHash` in the JSON body.~~ Reproduced live: a **consumer** token pulled a pending merchant's password hash off the unguarded `/admin/merchants/pending` [F7]. Fixed with an explicit `MERCHANT_PUBLIC_SELECT` field allow-list in `merchants.service.ts` — chosen over `omit`/delete so a schema field added later is excluded by default, not opt-out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | reproduced + fixed live 2026-08-24                                          |
| F27 | ✅ **FULLY RESOLVED 2026-08-24 by T31.** ⚠️ **T60 closed only half of this** — it removed the *trigger* (an unverified Resend domain), not the *shape*. The verification email was still `await`ed unguarded **after** the row committed, so T31 reproduced the identical failure again: a non-2xx from Resend returned **500 for an account that had in fact been created**, and the caller could not retry (409 on attempt two). Any transient Resend outage reproduces it in production — the original note said *"the email send must not be able to fail the signup"*, and that part was never actually done. Now caught and logged on **both** the consumer and merchant paths; the email has its own retry route (`POST /auth/resend-verification`). Deliberately not wrapped in a transaction: holding a DB transaction open across a third-party HTTP call is worse, and a rollback cannot un-send a mail that already went | `auth.service.ts`, `onboarding.service.ts` |
| F28 | ✅ **RESOLVED 2026-08-24 by T31.** Was: **Signup's duplicate check is a check-then-create race.** `findUnique` then `create` with no transaction or constraint handling. Four concurrent signups on one fresh email: 1 succeeded, **3 raised Prisma `P2002`**. Fixed differently on each path, on purpose: the **consumer** pre-check is deleted and `P2002` caught (the unique index was always the thing actually enforcing it), while the **merchant** pre-check stays as a *fast path* — that method creates a **Stripe customer before the DB row**, so dropping it would orphan a Stripe customer on every duplicate double-click — with `P2002` caught there too as the real guarantee. Verified: 6 concurrent signups → `201,409,429,429,429,429`, **one account, zero 5xx** (the 429s are T26's throttler). ⚠️ A *true* interleaved race still orphans one Stripe customer; reordering DB-before-Stripe changes how `billing.service.ts:227` resolves a webhook, so it is parked for **T57** |
| F14 | **The backend source does not compile.** `nest start` fails with 7 TS2307 errors before it reaches the DB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | dry run 2026-08-23                                                          |
| F15 | **`bookings/` + `business-hours/` exist ONLY at `src/modules/booking/src/modules/…`** — an unzipped delivery dumped in with its full path preserved, so every relative import (`../../prisma/prisma.service`) resolves to nothing. There is no top-level `src/modules/bookings/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `find src -type f`                                                          |
| F16 | `reward-rules` is genuinely duplicated — a real wired copy at `src/modules/reward-rules/` and a second inside the nested delivery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | same                                                                        |
| F17 | **Docker is not installed on this machine**, and there's no local Postgres — so T3 cannot run as written                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | dry run                                                                     |
| F18 | Confirmed at runtime: **zero booking/business-hours routes registered**
| F42 | **The last [F9] remnant in the SPA: the landing page's founding-spots counter still counts a `localStorage` array.** `Marketing.jsx`'s `FoundingSpots` reads `getMerchants()` from `data.js` and counts `foundingBadge`, so on any fresh browser it reports the full 50 spots left — forever, no matter how many salons have actually signed up. T36 rewired the salon grid beside it to `GET /merchants/public` and deliberately left this one, on the grounds that it is a marketing number and no endpoint exposes it; still true. T38 is the first task with an endpoint that knows the real count (`GET /admin/merchants` carries `foundingMember`), but that route is admin-only and this is a **public** page above the fold. The fix is a genuinely public count, or a `foundingMember` field on `/merchants/public` — → **T43** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | boot log route map                                                          |

### Dry-run results (2026-08-23, servers started then stopped)

| Component                             | Result                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Website (`glow-plus-frontend`, :3000) | ✅ **Runs.** Serves `/`, `/config.js`, `/verify-email` — all 200. `GLOW_API_BASE_URL` correctly points at :4000                             |
| Backend from source (`nest start`)    | ❌ **Fails to compile** — 7 errors, all from the nested booking folder [F14][F15]                                                           |
| Backend from prebuilt `dist/`         | ⚠️ **Boots and maps all routes**, then **crashes: Prisma `P1001`, cannot reach DB.** `dist/` is also stale — it predates the booking folder |
| Postgres                              | ❌ **Docker not installed** [F17]                                                                                                           |
| Node / npm                            | ✅ v24.11.1 / 11.6.2 — note Node 24 is newer than NestJS 10 + Prisma 5 typically target; watch for surprises                                |

**Conclusion: the delivered backend cannot start in its current state.** Not merely untested — it does not build. T13/T14 are therefore prerequisites for T4, not later cleanup.

**Only 3 HTML files exist in the entire delivery.** There is no React/Next/Vite app anywhere — confirmed against the zip and both extracted folders.

---

# PHASE 0 — Make the project testable _(do first)_

- [x] **T1 — `.gitignore`, `git init`, first commit.** ✅ **DONE & PUSHED 2026-08-23.** Repo: <https://github.com/huzaifawork/glow-plus> (private).
  - [x] `.gitignore` created at project root
  - [x] `.env.example` sanitized — **it contained real Stripe + Resend secrets**, now placeholders (real values remain in the gitignored `.env`)
  - [x] `git init` — repo initialised on branch `main`
  - [x] `git add -A` + audit: **90 files staged, verified clean.** No `.env`, `node_modules/`, `*.zip`, `stripe.exe`, `*.pem`, `*.key` or `dist/` staged. `git check-ignore` confirms each is excluded _by rule_, not by absence. Staged **content** also scanned for live `sk_live_`/`sk_test_`/`whsec_`/`re_`/`vcp_`/AWS/private-key patterns — no matches.
  - [x] First commit — `9d42151`, 90 files, 30,235 insertions, tree clean. Author `huzaifawork <mhuzaifatariq7@gmail.com>`; no AI co-author trailer (applies to all future commits).
  - [x] Create GitHub repo and push — pushed to `origin/main` at `https://github.com/huzaifawork/glow-plus.git`. Verified: remote `main` SHA `9d42151` matches local exactly; branch tracking set.
- [-] **T2 — Flatten the folder nesting.** `[MINE]` ⏭️ **SKIPPED DELIBERATELY 2026-08-23.** Purely cosmetic; breaks nothing. Its only real argument was "free before the first commit", and that window closed at T1 — moving ~90 files now would make the history noisy for zero functional gain. The stray `{prisma,src` artifact is a set of **empty directories** (0 files), so git never tracked it and it cannot affect a build or deploy. Revisit only if the nesting actively causes a deploy-path problem in Phase 8.
  **Cosmetic — breaks nothing. Optional, and safe to skip.** The only real argument for doing it is timing: doing it _before_ the first commit is free, whereas moving files later makes git history noisy. If skipping, do so deliberately.
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
- [x] **T6 — Resend sends for real.** ✅ **DONE & VERIFIED 2026-08-24.** Unblocked by T60 (done same session). Provider was already `resend`; the blocker was purely the unverified domain.
      **Proved by actual delivery, not by a 200 from the send call:**
      | Check | Result |
      |---|---|
      | Direct API send from `noreply@mail.glowplusmember.com` → a **non-owner** address | **200** + message id; `GET /emails/:id` → **`last_event: delivered`** |
      | `POST /auth/signup` (previously **500**, see [F27]) | **201** — account created _and_ email sent, no exception logged |
      | The app's own "Confirm your Glow+ email" | **delivered** |
      | Verification link pulled out of the **delivered email** and POSTed to `/auth/verify-email` | **201**; DB: `emailVerifiedAt` set, token consumed |
      | Same token replayed | **400 "Invalid or already-used token"** — single-use holds |

  **[F27] is resolved by this** — signup no longer 500s after creating the account, because Resend no longer refuses the recipient.
  **Token handling checked while here and it is correct:** the DB stores a **SHA-256 hash**, the plaintext exists only in the emailed link (`email-verification.service.ts`). A token read straight from the database is correctly rejected — that is by design, not a bug.
  ⚠️ The link still points at `http://localhost:3000` (`APP_URL`) — production value is **T59**.

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
      **Correction to this task's own description:** the relative imports were **never broken**. They were written for `src/modules/bookings/` all along (`../../prisma/prisma.service` → `src/prisma/prisma.service` ✓, `../notifications/email.provider` ✓, `../reward-rules/...` ✓) — they simply weren't _at_ that path. So T13 was a pure move; **no import rewriting was needed or done.**
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
      **Also required, not just the imports:** `AuthMiddleware` **throws 401 when no bearer token is present**, and it is applied to `'*'`. Both controllers document public endpoints (`bookings.controller.ts:14` "browsing available times shouldn't require an account", `business-hours.controller.ts:10`), so merely importing the modules would have left those endpoints 401-ing and _not_ public. Added two exclusions, scoped to `GET` so the merchant-only `PUT /business-hours` stays protected: `bookings/availability` and `business-hours/(.*)`. (Partially pre-empts T48.)
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

  ⚠️ **One deliberate exception to the envelope:** `GET /health/ready` answers 503 with the _health_ shape (`{ status, database, timestamp }`), not `{ statusCode, message, error }`. That is intentional — it is consumed by uptime probes, not by the app clients, and monitoring tools expect a health-specific body. Worth knowing before anyone "fixes" the inconsistency.
  **Note on unknown routes without a token:** they return **401, not 404**, because `AuthMiddleware` runs on `*` and rejects first. That is defensible (it doesn't reveal which routes exist) but it is a behaviour to be aware of, not an accident to rely on.

  **Tests:** `src/common/all-exceptions.filter.spec.ts` — 16 specs, incl. a table asserting the envelope invariant across 8 exception kinds (`null` and a thrown string included), both leak checks, and the log-level split. Suite now **28 passing** (was 12).
  **Verify independently:** `curl -i -X POST http://localhost:4000/auth/signup -H "Content-Type: application/json" -d '{"email":"nope","password":"x","name":""}'`

**Phase 1 re-verified 2026-08-23 (after T16).** `npm run typecheck` clean, `npm test` **28/28 passing**, and the envelope re-checked live across 9 failure kinds including an authenticated 404, a wrong HTTP method and a tampered token. The same pass, probing routes with a deliberately wrong role, uncovered **[F29] and [F30]** — a cross-tenant read and an inert paywall. Neither is caused by Phase 1; both are pre-existing and belong to **T29**.

# PHASE 2 — Finish what's mid-test _(client priority #1)_

- [x] **T17 — Subscription cancel/resume works.** ✅ **DONE & VERIFIED 2026-08-24.** Both halves — backend and frontend — built, tested against real Stripe test-mode + real Postgres + a real browser, and the auth error reproduced and fixed.

  **The auth error, reproduced first:** a **consumer** token on `POST /billing/cancel` returned **500**, not 403 — `req.merchantId!` is undefined for a consumer, so Prisma's `findUnique({ where: { id: undefined } })` threw. Same root cause as [F29]. Fixed with a new `RequireMerchantGuard` (`src/common/guards/require-merchant.guard.ts`), applied to `checkout`/`cancel`/`resume` — **not** the webhook, which stays unauthenticated by Stripe's own design.
  | Caller | Before | After |
  |---|---|---|
  | Consumer token | **500** | **403** "This action requires a merchant account" |
  | No token | 401 | 401 (unchanged) |
  | Merchant token | worked | works (unchanged) |
  | Webhook (no token) | 400 (bad signature) | 400 (unchanged — still reaches the handler) |

  **A second, more serious bug found while testing cancel/resume against real Stripe, not the guard:** Stripe moved `current_period_start`/`current_period_end` **off the Subscription object onto its line items**. Both the pinned SDK client (`2025-03-31.basil`) and live webhook payloads (`2026-07-29.dahlia`) return them **only on `items.data[0]`** — confirmed by direct API calls in both shapes. The handler read the old top-level fields, got `undefined`, and `new Date(undefined * 1000)` is `Invalid Date`, which Prisma rejects. **The webhook controller swallows its own errors into a bare 400 with no log line**, so `customer.subscription.updated` silently never synced — proved by flipping `cancel_at_period_end` directly in Stripe and watching the local DB not move. Fixed with `readPeriod()` (`billing.service.ts`), which reads the item first and falls back to the legacy top-level field, plus webhook error logging so this class of failure is never silent again.
  **Evidence, real Stripe test-mode subscription (`sub_1U7ivq…`), real Postgres:**
  | Check | Result |
  |---|---|
  | `POST /billing/cancel` (merchant token) | Stripe `cancel_at_period_end` **true**, DB `cancelAtPeriodEnd` **true** |
  | `POST /billing/resume` | Stripe **false**, DB **false** |
  | Change made **directly in Stripe** (bypassing our API entirely) | synced into the DB by the webhook in **~2 seconds**, unprompted |
  | Webhook `customer.subscription.updated` | **400 → 200** after the `readPeriod()` fix |

  **A third bug, found auditing `merchants.service.ts` before building the UI on it:** `GET /merchants/me` returned the merchant's **bcrypt `passwordHash`** in the JSON body. Worse: `GET /admin/merchants/pending` returned it too, and that route has **no guard at all** [F7] — reproduced live: a logged-in **consumer** token pulled the pending merchant's password hash straight off `/admin/merchants/pending`. Fixed with an explicit `MERCHANT_PUBLIC_SELECT` allow-list (not `omit`/delete) so a field added to the schema later is excluded by default rather than leaking by default. `stripeCustomerId` removed from the response for the same reason — an internal identifier, not user data.

  **Frontend** (`glow-plus-web/src/pages/billing-result/`): `BillingManager.jsx` + a new real API client, `lib/api.js` — token-only auth via `Authorization: Bearer` (matches T46/T7's requirement, and is the pattern T35–T38 will reuse), errors surfaced via `ApiError.message` (safe because of T16 — always a string). Mounted at `/business/billing`, the exact URL Stripe already redirects to; the two existing Stripe-return states (`?success=true`, `?canceled=true`) were **left untouched**, and the previous "Nothing to show here" dead end for a direct visit now shows sign-in + live billing instead.
  **Tested in a real, driven Chrome instance** (no test framework in the repo — T12 was deliberately skipped; `puppeteer-core` installed to the session scratchpad only, not the repo) against the real dev servers: **15/15 checks passed** — real sign-in with a real password field (the prototype had zero, [F9]), a wrong-password call rendering the exact API error text, login, cancel, resume (both re-verified against the server, not assumed), a page reload keeping the session, the two Stripe-redirect states unchanged, no bcrypt hash reaching browser storage, zero unexpected console errors, and no horizontal overflow at 390px.
  **Tests:** `billing.service.spec.ts` (`readPeriod` — 6 specs covering both Stripe shapes and the Invalid-Date failure mode) + `require-merchant.guard.spec.ts` (6 specs). Suite now **40 passing** (was 28).
  **Verify independently:** open `http://localhost:3000/business/billing`, sign in as `merchant@glowplus.test` / `Merchant123!`, click Cancel then Resume, and check Stripe's test dashboard alongside — both change together.

- [x] **T18 — Booking flow end-to-end against real Postgres.** ✅ **DONE & VERIFIED 2026-08-23.** Backend guard fix, two small public endpoints, and a real frontend page — all tested against the live API and Postgres, not assumed.

  **Auth bug found and fixed first, same class as [F29]/T17:** `bookings.controller.ts` had FOUR more call sites reading `req.merchantId!` / `req.accountId!` with no role check — `GET /bookings` (merchant calendar), `PATCH /:id/confirm`, `PATCH /:id/no-show`, `PATCH /:id/complete` (merchant-only), and `POST /bookings` / `GET /bookings/me` (consumer-only). **Reproduced live before fixing:** a consumer's token on `GET /bookings` would have hit `findMany({ where: { merchantId: undefined } })` — the exact [F29] cross-tenant read, just in a different controller. Fixed by applying the existing `RequireMerchantGuard` (built in T17, written to be reused) to the four merchant-only routes, and a new mirror `RequireConsumerGuard` (`src/common/guards/require-consumer.guard.ts`) to the two consumer-only ones. `PATCH /:id/cancel` was already safe — it derives the role instead of asserting it, so it was left as-is.
  | Caller | Route | Before (would have been) | After |
  |---|---|---|---|
  | Consumer token | `GET /bookings` | 200 + every merchant's bookings | **403** "This action requires a merchant account" |
  | Merchant token | `GET /bookings/me` | created a nonsensical row owned by the merchant's own staff account | **403** "This action requires a consumer account" |
  | Merchant token | `GET /bookings` (own) | — | 200, own bookings only |
  | Consumer token | `GET /bookings/me` (own) | — | 200, own bookings only |

  **Two small public endpoints added, pulled forward from T43/T44:** the booking flow needs a way for a consumer to name a merchant and a style, and there was no way to do that without either a public endpoint or hardcoding a database id into shipped frontend code. Kept deliberately minimal — not the full versions those tasks will eventually need (no pagination/search):
  - `GET /merchants/public` — `{id, businessName}[]`, `status: ACTIVE` only (`merchants.service.ts` `listPublic()`)
  - `GET /styles/public/:merchantId` — `{id, name, type, pointsPerVisit, durationMinutes}[]`, active styles at an ACTIVE merchant only, 404 otherwise (`styles.service.ts` `listPublicForMerchant()`)

  Both excluded from `AuthMiddleware` (GET only) in `app.module.ts`, same pattern as `bookings/availability` and `business-hours/(.*)`. **T43 and T44 are left open** (not ticked) — these are stopgaps sized for T18, not the final shape.

  **Full flow, real Stripe-free Postgres, real seeded accounts (`consumer@glowplus.test`), verified end to end:**
  | Step | Result |
  |---|---|
  | `GET /bookings/availability` for a future date | **27 open slots** returned, no auth required |
  | `POST /bookings` (consumer) | **201**, real row created — confirmed independently via a direct Prisma query against Postgres, not just the API response |
  | `POST /bookings` with no token | **401** |
  | `POST /bookings` for the same slot again | **400** "That time slot was just booked by someone else" — the race-check in `availability.service.ts` works |
  | `GET /bookings/me` | lists the booking |
  | `PATCH /:id/cancel` with no token | 401 |
  | `PATCH /:id/cancel` (owner) | **200**, status → `CANCELLED` |
  | `PATCH /:id/cancel` again | **400** "Cannot cancel a booking with status CANCELLED" |
  | Merchant lifecycle on a second booking: `GET /bookings` (merchant) → `PATCH /:id/confirm` → consumer tries to confirm (**403**) → `PATCH /:id/complete` | confirm **200**, complete **200** and **auto-created a `Visit` row** (`pointsEarned: 50`, `bookingId` linked) — the booking→loyalty integration in `bookings.service.ts complete()` works end to end |

  **Frontend** (`glow-plus-web/booking.html` → `/consumer/booking`, same standalone-page pattern as T17's billing page): consumer sign-in (real password field, real `/auth/login`) → salon dropdown (`GET /merchants/public`) → service dropdown (`GET /styles/public/:id`) → date picker → "Check availability" → slot grid → book → confirmation → "Your bookings" list with cancel. `lib/api.js` extended with a **separate consumer token key** (`glowplus:token:consumer`, distinct from the merchant billing page's `glowplus:token`) so both pages can be logged in independently in the same browser without clobbering each other's session — a real collision that would have hit the moment T36 needed both flows live at once.
  **Driven in real Chrome** (`puppeteer-core`, session scratchpad only, same as T17 — no test framework in the repo, T12 skipped): **14/14 functional checks passed** — wrong password shows the real API error text, real seeded salon/styles populate the dropdowns from the live API, real availability slots, booking creates and shows PENDING, cancel flips it to CANCELLED and removes the button, session survives a reload (consumer token persisted independently of any merchant session), no horizontal overflow at 390px. The only two browser console entries logged during the whole run are expected noise, not bugs: the deliberate wrong-password 401, and a `/favicon.ico` 404 that every page in this app already produces (verified — no page here declares a favicon).
  **Backend tests:** new `require-consumer.guard.spec.ts` (6 specs, mirrors `require-merchant.guard.spec.ts`). Suite now **46 passing** (was 40). `tsc --noEmit` clean.
  **Verify independently:** open `http://localhost:3000/consumer/booking`, sign in as `consumer@glowplus.test` / `Consumer123!`, pick a date a few days out, book a slot, then cancel it — and separately, confirm `http://localhost:3000/business/billing` (merchant login) still works in the same browser without logging the consumer session out.

- [x] **T19 — Trigger and watch the trial-ending email fire.** ✅ **DONE & VERIFIED 2026-08-24.** `TrialEndingReminderJob` (`@Cron(EVERY_DAY_AT_9AM)`) had never actually been executed. Triggered directly — booted a Nest application context and called `job.run()` against real Postgres, real Resend — rather than waiting for 9am or faking the system clock in the running dev server.
      **Seeded two `TRIALING` subscriptions** with `trialEnd` inside the job's 3–4-day window: the seeded merchant (`merchant@glowplus.test`) and a disposable second merchant at Resend's own test address `delivered@resend.dev`, added specifically to prove full delivery (`merchant@glowplus.test` isn't a real inbox, so it can only ever show `sent`, never `delivered`).
      **Evidence, queried back from the real Resend API after running:**
  | Recipient | Subject | `last_event` |
  |---|---|---|
  | `merchant@glowplus.test` | "Your Glow+ trial is ending soon" | `sent` |
  | `delivered@resend.dev` | "Your Glow+ trial is ending soon" | **`delivered`** |

  Job log: `trialEndingReminder: 2 merchants notified` — matched both, skipped everything outside the window (verified by a third pre-existing subscription outside the range not appearing in the count).
  **No bug found** — unlike T17/T18, the job runs exactly as written: correct Prisma window query, correct template, correct recipient. Checked the related webhook backup path (`billing.service.ts` `onTrialWillEnd`, `customer.subscription.trial_will_end`) while here — it exists and is wired, so the cron genuinely is a backup rather than the only path.
  **Test data cleaned up** — both seeded subscriptions and the disposable merchant deleted after verification; the seed script's baseline (`{merchants:1, users:1, styles:3, rewardRules:2, businessHours:7}`) is unaffected.
  **Tests:** `trialEndingReminder.job.spec.ts` — 3 specs (correct date-window query, emails every match with its own `trialEnd`, no-op with no throw when nothing matches). Suite now **49 passing** (was 46).
  **Verify independently:** the job is cron-triggered, not endpoint-triggered, so there's nothing to click; re-run by seeding a `TRIALING` subscription with `trialEnd` 3.5 days out and calling `TrialEndingReminderJob.run()` from a Nest application context, then checking `GET https://api.resend.com/emails` for the send.
- [x] **T20 — Trigger and watch `invoice.payment_failed`.** ✅ **DONE & VERIFIED 2026-08-24.** `onPaymentFailed` (`billing.service.ts:226`) had never actually fired. Restarted `stripe listen` myself (output captured, same pattern as T7) rather than trusting the pre-existing background process's invisible output, and confirmed its signing secret still matches `.env`'s `STRIPE_WEBHOOK_SECRET` before triggering anything.

  **Two paths verified, not just the happy one:**
  | Path | Setup | Result |
  |---|---|---|
  | **Unmatched customer** | `stripe trigger invoice.payment_failed` (CLI fixture — always creates its own synthetic customer, not tied to any merchant in our DB) | Webhook **200**, handler's `findFirst` returned nothing, **no-op** — DB re-checked after, merchant row untouched. This is the honest default case for real Stripe traffic against unlinked/deleted customers, and it degrades safely. |
  | **Matched merchant** | Linked the seeded merchant's `stripeCustomerId` to the fixture's real Stripe test customer (`cus_V7z…`), then **replayed the exact same event** with a freshly computed, genuinely valid `Stripe-Signature` (`stripe.webhooks.generateTestHeaderString`) — same technique as constructing any other authentic webhook call, not a mock | Webhook **200**; merchant `status` **ACTIVE → PAST_DUE**, confirmed via direct Prisma query |

  **Email confirmed by actual delivery, not just a 200 from the send call** (same standard as T6/T19): sent to `merchant@glowplus.test` → Resend `last_event: sent` (not a real inbox); replayed a second time against `merchant@glowplus.test` temporarily repointed at Resend's own `delivered@resend.dev` → **`last_event: delivered`**. Pulled the delivered email's HTML back from the Resend API and confirmed it contains the real `invoice.stripe.com` link (`invoice.hosted_invoice_url` from the event payload) and **not** the literal string `undefined` — the template's only piece of dynamic data actually resolved.

  **No bug found** — like T19, the handler runs exactly as written: correct customer lookup, correct status transition, correct email template and data. The webhook's blanket `default: break` for unhandled event types (confirmed harmless here — `customer.updated`, `charge.failed`, `payment_intent.*` etc. all came through the same forwarding session and 200'd without side effects) means this event type was reachable and wired correctly the whole time; it just had never been exercised.

  **Test data cleaned up after:** merchant restored to exact seed baseline (`status: ACTIVE`, `stripeCustomerId: null`, `email: merchant@glowplus.test`); the three orphaned Stripe test customers created while finding a workable decline technique (see below) were deleted via the API; no `_tmp_*.js` scripts left in the repo (`git status` clean throughout).

  **One dead end worth recording:** the obvious approach — attach a Stripe test "always-declines" PaymentMethod (`pm_card_chargeDeclined`) to a real customer, then pay a real invoice — does not reach the invoice-payment step at all. Those tokens are designed to fail on **any** use, including a bare `paymentMethods.attach()`, before an invoice is ever involved. Raw test PANs are blocked outright on this account ("raw card data APIs" not enabled, by design — a real security control, not a bug). `stripe trigger` plus a same-secret signed replay was the reliable path.
  **Suite unchanged: 49 passing** (no new code, so no new tests — consistent with T19, which also found no bug).
  **Verify independently:** no UI surface (webhook-only, like T19) — re-run by triggering `stripe trigger invoice.payment_failed` with `stripe listen` forwarding to `:4000/billing/webhook` and watching the CLI's own output for the `200`.

# PHASE 3 — Structural gaps _(client priority #2)_

- [x] **T21 — Password reset.** ✅ **DONE & VERIFIED 2026-08-24 (session 8).** New `PasswordReset` table (mirrors `EmailVerification`: hashed single-use token, expiry, `usedAt`). `POST /auth/forgot-password` looks the email up in **both** `User` and `Merchant` tables (one endpoint serves consumer and merchant, matching how the RN app only knows an email, not an account type) and always returns `{ok:true}` — no account-enumeration leak, confirmed identical response/UI for a real vs. a nonexistent email. `POST /auth/reset-password` validates token hash + expiry + single-use in a transaction, updates the right table's `passwordHash`. 1h token TTL (shorter than email verification's 24h — this resets a live credential). [F5]

  Tested against the real running API, real Postgres, and real Resend delivery — not just response shapes: seeded consumer → forgot-password → pulled the actual token out of the delivered Resend email (same technique as T19/T20) → reset-password → **logged in with the new password (201)** → old password now rejected (401) → **reusing the same token rejected (400, single-use)** → manually expired a second token's row in Postgres → rejected with a distinct "Token expired" message. Password restored to the seed baseline (`Consumer123!`) after.

  - [x] Frontend: `forgot-password.html` / `reset-password.html` — new standalone pages (same pattern as T17/T18: not in the SPA yet, since T35's real auth UI doesn't exist). Driven in real Chrome (`puppeteer-core`, scratchpad-only): 12/12 functional checks passed — form renders, success state identical for a real vs. unknown email, missing-token error state, mismatched-password client-side validation, real submit → success, login with new password succeeds, reused token shows an error, no horizontal overflow at 390px.
- [x] **T22 — Admin authentication + guard on every `/admin/*` route.** ✅ **DONE & VERIFIED 2026-08-24 (session 9).** [F7]

  **New `Admin` model** (`prisma/schema.prisma`): `id, email, passwordHash, createdAt`. Deliberately **no signup route** — admin accounts are created directly (seed/CLI), since a self-service admin signup would defeat the guard entirely. Migration `20260824090000_admin`, applied via the same `migrate diff` → write → `migrate deploy` pattern as T13/T21 (no interactive shell here). Seeded one: `admin@glowplus.test` / `Admin123!` (`npm run seed`).

  **`RequireAdminGuard`** (`src/common/guards/require-admin.guard.ts`) — same shape as T17/T18's `RequireMerchantGuard`/`RequireConsumerGuard`: fail closed on `req.accountRole !== 'admin'` before the handler runs. Applied via `@UseGuards` to every route in `admin.controller.ts` **except** `POST /admin/login`, which is also excluded from `AuthMiddleware` in `app.module.ts` (same pattern as `merchants/login`) so it stays reachable with no bearer token. `AdminAuthService` (`admin-auth.service.ts`) mirrors `MerchantAuthService` — bcrypt compare, `sign({ sub, role: 'admin' })` (the JWT util already had an `'admin'` role in its union, just nothing ever issued one).

  **Reproduced the exact leak this closes, then re-tested after the fix, against the real running API and Postgres:**
  | Caller | Route | Before [F7]/[F31] | After |
  |---|---|---|---|
  | No token | `GET /admin/merchants/pending` | 401 (AuthMiddleware only) | 401 (unchanged) |
  | **Consumer token** | `GET /admin/merchants/pending` | **200 — this is the exact F31 leak vector** (a consumer token pulled a pending merchant's bcrypt hash off this unguarded route) | **403** "This action requires an admin account" |
  | Merchant token | `PATCH /admin/merchants/:id/approve` | would have worked — no guard at all | **403** |
  | Admin login, wrong password | `POST /admin/login` | — | **401** "Invalid email or password" |
  | Admin login, correct | `POST /admin/login` | — | **200** + token |
  | Admin token | `GET /admin/merchants/pending` / `/metrics/mrr` / `/metrics/churn` / `/metrics/platform` | — | all **200** |

  **Full approve/suspend cycle against real Postgres, not just response shapes:** signed up a fresh merchant (`T22 Test Salon`, status `PENDING`) → showed up in `GET /admin/merchants/pending` under the admin token → `PATCH .../approve` → **200, `status: ACTIVE`**, and the pending list immediately emptied → `PATCH .../suspend` on the same merchant → **200, `status: SUSPENDED`** — confirmed independently via a direct Prisma query, not just the API response. Test merchant deleted after; DB back at exact seed baseline (`{merchants:1, admins:1}`, confirmed by count).

  **Frontend** (`glow-plus-web/admin.html` → `/admin/panel`, same standalone-page pattern as T17/T18/T21 — not in the SPA yet): admin sign-in (real password field) → platform metrics tiles (MRR, active subs, churn rate, active merchants, visits, points issued) → pending-merchants list with Approve/Suspend buttons, live-refreshing after each action. `lib/api.js` gained a **third, separate token key** (`glowplus:token:admin`), same reasoning as T18's consumer/merchant key split — an admin session shouldn't clobber a merchant or consumer session open in the same browser. Driven in real Chrome (`puppeteer-core`, scratchpad-only, same as prior tasks): **11/11 functional checks passed** — wrong password shows the real API error text, successful login shows both Platform metrics and Pending merchants sections, no bcrypt hash reaches the page, session persists across a reload, token lands under its own storage key, logout returns to the sign-in form, no horizontal overflow at 390px, zero unexpected console errors (the only two entries are the same benign noise as every prior page: the deliberate wrong-password 401 and a `/favicon.ico` 404). Production build (`npm run build`) compiles clean with the new entry point.

  **Also found and cleaned up while testing (not a T22 bug, noted for later):** the merchant signup used to create the test fixture returned a bare `500` even though the row committed successfully — same *"account created, response still fails"* shape as [F27], just on `POST /merchants/signup` instead of `/auth/signup`. Not investigated further here (out of scope for this task); worth a look if T22-style testing of merchant onboarding comes up again.

  **Tests:** `require-admin.guard.spec.ts` — 6 specs, incl. one explicitly named for the F31 scenario (a consumer token refused). Suite now **55 passing** (was 49). `tsc --noEmit` clean.
  **Verify independently:** open `http://localhost:3000/admin/panel`, sign in as `admin@glowplus.test` / `Admin123!`; separately, confirm a merchant or consumer login at `/business/billing` or `/consumer/booking` still works in the same browser without the admin session clobbering it.
- [x] **T23 — Reward redemption tracking.** ✅ **DONE & VERIFIED 2026-08-24 (session 10).** [F4] closed — the `Redemption` table now has a writer.
  - [x] Frontend: redeem button + redemption history.

  **New module** `src/modules/redemptions/` (service, controller, dto, module), imported in `app.module.ts`. Four routes, each role-guarded from the start rather than retrofitted — reusing T18's `RequireConsumerGuard` and T17's `RequireMerchantGuard`, so the [F29] `req.merchantId!` pattern is not repeated in a new controller:
  | Route | Guard | Purpose |
  |---|---|---|
  | `GET /redemptions/available?merchantId=` | consumer | each active rule + this consumer's progress + `eligible` |
  | `POST /redemptions` | consumer | redeem one unlocked milestone |
  | `GET /redemptions/me` | consumer | the consumer's own redemption history |
  | `GET /redemptions` | merchant | that merchant's redemption history, with client name/email |

  **Double-redemption is prevented by re-deriving eligibility inside the transaction**, not by trusting the client. `redeem()` recounts real `Visit` and `Redemption` rows within `$transaction`, so the client only ever names *which rule* — never its own progress. Two branches: `oneTime` rules refuse once any redemption exists; repeatable rules refuse when `redeemedCount >= unlockedCount`, which means a consumer at 10/5 visits can redeem exactly twice, not unlimited times. This is why the check is `>=` against a re-derived `unlockedCount` rather than a simple "has redeemed" boolean.

  **Evidence — every row is a real request against the running API and real Postgres:**
  | Check | Result |
  |---|---|
  | `GET /redemptions/available` as consumer, 5 visits / 250 pts | **200**, both seeded rules returned with `progress` 5 and 250, `eligible:true` |
  | `POST /redemptions` (VISIT_COUNT rule) | **201**, real `Redemption` row created, confirmed by direct Prisma query |
  | **Same rule redeemed immediately again** | **400** "Already redeemed at this milestone — keep visiting to unlock the next one" |
  | `POST /redemptions` on a **different** rule | **201** — one rule's redemption doesn't block another |
  | Fresh consumer, **zero visits** → `POST /redemptions` | **400** "Not eligible for this reward yet" |
  | `POST /redemptions` with a nonexistent `rewardRuleId` | **404** "Reward rule not found" |
  | `GET /redemptions/me` as consumer | **200**, both redemptions newest-first |
  | `GET /redemptions` as merchant | **200**, same rows enriched with client name + email |
  | **Merchant** token on `GET /redemptions/available` | **403** "This action requires a consumer account" |
  | **Consumer** token on `GET /redemptions` | **403** "This action requires a merchant account" |
  | No token on either | **401** "Missing bearer token" |
  | **After 5 more visits (10 total)** → redeem again | **201** — the second milestone genuinely unlocks, then locks again |

  **Frontend:** new standalone page `glow-plus-web/rewards.html` → `/consumer/rewards` (same pattern as T17/T18/T21/T22 — not in the SPA, since T35's auth UI doesn't exist yet). Consumer sign-in → salon picker (reuses T18's `GET /merchants/public`) → per-rule progress bar text and Redeem/Locked button → redemption history that refreshes on redeem via a `glowplus:reward-redeemed` event. `lib/api.js` gained three functions on the existing `CONSUMER_TOKEN_KEY`; `vite.config.js` route-rewrite plugin and Rollup `input` both extended.
  Driven in real Chrome (`puppeteer-core`, scratchpad-only): **11/12 checks passed** — login form on fresh storage, sign-in, live progress from the API, **a real Redeem click that grew history by exactly one and re-locked the button**, real `fetch` calls to :4000 (not `window.storage`), no horizontal overflow at 390px, log-out clears the session. The one non-pass is a `favicon.ico` 404 — cosmetic, present on every standalone page, not app code.

  **No bug found in pre-existing code** — like T21, this was new functionality rather than a "was it ever exercised" check. Suite still **55 passing**; `tsc --noEmit` clean. Test data (5 redemptions, 10 visits, 1 throwaway consumer) fully cleaned up — DB back at exact seed state (5 visits, 0 redemptions, 1 user).
  **Verify independently:** open `http://localhost:3000/consumer/rewards`, sign in as `consumer@glowplus.test` / `Consumer123!`. The seed gives 5 visits / 250 points, so both rules show as redeemable; redeem one and it re-locks with the history entry appearing below.
- [x] **T24 — Merchant staff accounts + roles.** `MerchantStaff` model already exists — build auth, invite, and role-scoped permissions on it. [F6] ✅ **2026-08-24**
  - [x] Frontend: staff management UI + role-limited views.

  **[F6] closed — the `MerchantStaff` table finally has a writer.** New `src/modules/staff/` with 9 routes: public `POST /staff/login`, `GET /staff/invites/:token`, `POST /staff/accept-invite`; owner-only `GET /staff`, `POST /staff/invites`, `DELETE /staff/invites/:id`, `PATCH /staff/:id/role`, `DELETE /staff/:id`; and `GET /staff/me` for any merchant token.

  **Invites use a separate `StaffInvite` table** (migration `20260824170000_staff_invites`), mirroring `EmailVerification`/`PasswordReset`: hashed single-use token, `expiresAt` (7d — an invite is not a live credential like a 1h reset), `acceptedAt`, `revokedAt`. No staff row — and therefore no password hash — exists until the invite is accepted, inside a `$transaction` that re-checks the token so two clicks on the emailed link can't both succeed. `MerchantStaff` gained `name` and `lastLoginAt`.

  **Role scoping is the point of the task**, so it's split across two guards. `RequireMerchantGuard` (T17) accepts owner *and* staff — day-to-day work. New `RequireMerchantOwnerGuard` refuses `merchant_staff` with a distinct message, and now also protects **billing checkout/cancel/resume**, which T24 narrowed from the wider guard: a receptionist could previously have cancelled the salon's subscription. `StaffRole.OWNER` signs `merchant_owner` in the token, `STAFF` signs `merchant_staff`, and `sub` is always the staff id — which is exactly what `Visit.loggedBy` ("staff user id") always meant to record, and now does.

  **Every management method filters by the caller's `merchantId`**, never by staff id alone: `MerchantStaff.email` is globally unique, so a bare `findUnique({ id })` would have let merchant A rename or delete merchant B's staff — [F29]'s shape in a new table. Verified: merchant B gets **404**, not 200.

  **Backend — 55/55 checks** against the live API and real Postgres: no token 401 / consumer token 403 on the roster; invite → **email DELIVERED via Resend** (`delivered@resend.dev`, `last_event=delivered`, token pulled back out of the delivered HTML exactly as in T19–T21) → public preview → accept → real `MerchantStaff` row → replay of the same token 400; staff login stamps `lastLoginAt`; STAFF refused on roster/invite/delete/**billing cancel** (403) but allowed on `/merchants/me`, `/styles` and `POST /visits` (201, `loggedBy` = staff id); promote → re-login signs `merchant_owner` → roster now 200 → demote; duplicate invite 409; owner's own email 400; re-invite supersedes rather than stacking; cross-merchant promote/delete 404 with the row intact; revoke → 404 on second revoke; an expired invite refused at both preview and accept with no account created; removed staff can no longer log in.

  **Frontend — 26/26 checks** in real Chrome (`puppeteer-core`, scratchpad-only). Two new standalone pages, same pattern as T17/T18/T21/T22/T23: `staff.html` → `/business/staff` and `accept-invite.html` → `/staff/accept-invite` (backend-baked, like `/reset-password`). **One sign-in box serves both account kinds** — `teamSignIn()` tries `/merchants/login` and falls back to `/staff/login` on 401 only, so a real outage isn't reported as "wrong password". `GET /staff/me` then decides the view: owner gets roster + invite form + role select + remove; **staff gets a role-limited view with the management panel not rendered at all** — and the API refuses them independently (403 proved with the browser's own token), so the hiding is convenience, never the boundary. A removed staff member's stale token returns them to sign-in instead of a broken page. No horizontal overflow at 390px; no console errors.

  `lib/api.js` gained a **fourth** token key, `glowplus:token:staff` — deliberately not the billing page's `glowplus:token`, so a staff sign-in can't silently replace an owner session on a page they have no rights on.

  **Also fixed while here:** `vercel.json` had rewrites for only the original two routes, so `/consumer/booking`, `/forgot-password`, `/reset-password`, `/admin/panel` and `/consumer/rewards` would all have **404'd in production** — including reset-password links already emailed by the backend. All added alongside the two new T24 routes.

  **No bug found in pre-existing code** (new functionality, like T21/T23). Suite now **62 passing** (was 55); `tsc --noEmit` clean; test data fully cleaned up — DB back at seed state (1 merchant, 0 staff, 0 invites).
  **Verify independently:** open `http://localhost:3000/business/staff`, sign in as `merchant@glowplus.test` / `Merchant123!`, invite an address, then open the emailed link (or `/staff/accept-invite?token=…`), set a password, and sign back in with it — the same box now shows the staff view instead of the roster.
- [x] **T25 — Points expiration.** Add `expired Boolean` to `Visit`, migrate, replace the `data: {}` no-op, exclude expired visits from progress math. [F8] ✅ **2026-08-24**
  - [x] Frontend: points balance + expiry display.

  **[F8] closed.** `expirePoints.job.ts` ran nightly, called `updateMany` with `data: {}` — a literal no-op — and logged a count of rows it had "touched" while changing none of them. Points never expired, and nothing in the system said so. `Visit` now has `expired Boolean @default(false)` and `expiredAt DateTime?` (migration `20260824180000_visit_points_expiry`, plus two indexes), and the job writes them.

  **Expiring never deletes.** Points aren't a stored balance — they're derived from `Visit` rows — so expiry marks a visit as excluded from progress maths and leaves it in the merchant's history. The job filters on `expired: false`, which makes it idempotent: a second run expires 0 more and does **not** rewrite `expiredAt` on rows that expired weeks ago. TTL is `POINTS_EXPIRE_AFTER_DAYS` (365, env-overridable).

  **All three progress paths now exclude expired visits** — `redemptions.service.ts` (both the `available` read and the eligibility re-derivation *inside* the redeem transaction) and `reward-rules.service.ts` `evaluate()`, which is what `POST /visits` calls to decide what just unlocked. Missing the in-transaction one would have let a consumer redeem against points the UI had already stopped showing.

  **New `src/modules/points/`** — one of the empty placeholder directories from [F22], now real. `GET /points/me` (consumer-only via T18's guard from the start, so [F29]'s `req.accountId!`-with-no-role-check pattern isn't repeated) returns per-salon `activePoints`, `expiredPoints`, `expiresAfterDays`, `nextExpiry` and an `expiringSoon` 30-day window. **`nextExpiry` is computed from the visit date, not from the job** — a visit's expiry is knowable the day it happens, so the UI can warn *before* the points go rather than reporting the loss the morning after.

  **Backend — 21/21 checks** against the live API and real Postgres: `/points/me` 401 without a token and **403 with a merchant token**; balance equals the real sum; the job (booted through a Nest application context and called directly, as in T19, rather than waiting for its 3am cron) expires exactly the aged visits, writes `expired`/`expiredAt` to real rows, deletes nothing, and no-ops on a second run; the balance drops by exactly the expired points; reward progress falls 5 → 3; with every visit expired **`POST /redemptions` returns 400** rather than relying on a hidden button; and a visit 10 days out is flagged as expiring soon.

  **Frontend — 10/10 checks** in real Chrome: a points card on `/consumer/rewards` showing the balance, visit count, salon, a future expiry date, a red "expire within 30 days" warning when close, and expired points reported rather than silently dropped. No overflow at 390px, no console errors.

  Suite now **67 passing** (was 62) — `expirePoints.job.spec.ts` asserts the shape of the write, since "no result at all" was the bug. `tsc --noEmit` clean; test data restored — DB back at exact seed state (5 visits, 0 expired).
  **Verify independently:** open `http://localhost:3000/consumer/rewards` as `consumer@glowplus.test` / `Consumer123!` — the points card sits above the rewards list. Backdate a visit past 365 days in Postgres and run the job to watch the balance and the reward progress both drop.

# PHASE 4 — Security _(client priority #3)_

- [x] **T26 — API-wide rate limiting.** ✅ **DONE & VERIFIED 2026-08-24 (session 12).** [F3] closed. **26/26 live checks** against the running API, plus 18 new unit specs.

  [F3] was worse than "unused". `rateLimit.middleware.ts` had zero references *and could not have been wired up*: its constructor takes `windowMs`, `max` and a `keyOf` function, so `consumer.apply(RateLimitMiddleware)` makes Nest try to resolve `Number`, `Number` and `Function` from the DI container and fail at boot. Deleted rather than left beside the working limiter. Replaced with `@nestjs/throttler` v6.5 — three tiers, all in `src/common/throttling.ts`:

  | Tier | Keyed by | Default | On credential routes | On email-send routes |
  | --- | --- | --- | --- | --- |
  | `global` | client IP, **one bucket for the whole API** | 300 / min | — | — |
  | `default` | client IP **+ handler** | 120 / min | 20 / 5 min, 10 min block | 10 / 15 min, 15 min block |
  | `identity` | **email in the request body** + handler | 20 / 15 min | 5 / 15 min, 15 min block | 3 / 15 min, 30 min block |

  **Why three and not one.** One bucket cannot answer both "is this host hammering us?" and "is someone brute-forcing one account?". The per-IP number on login is deliberately *looser* than the per-email one — a salon is one NAT'd office, and the owner plus three staff on a bad morning must not lock the building out. The brute-force defence lives in the per-email tier, which the deleted middleware's own doc-comment had named ("request body email") and never implemented. Emails are normalised, so `BOB@X.com` and `bob@x.com` are one bucket, as they are one row to Prisma — verified live (C9).

  **🔴 Real bug found in my own first implementation, by testing rather than reading.** A guard-only limiter leaves **every protected route floodable by anonymous traffic**: Nest runs middleware before guards, and `AuthMiddleware` throws 401 first, so `ThrottlerGuard` never saw those requests. Caught because `GET /styles` (protected) came back with **no** `X-RateLimit-*` headers while `GET /merchants/public` (excluded from AuthMiddleware) had them. Fixed by moving the `global` tier into `src/middleware/globalRateLimit.middleware.ts`, applied **before** `AuthMiddleware`, sharing the throttler's own storage service so it is genuinely one bucket. That tier is deliberately absent from the guard's list — listing it in both would double-count every authenticated request and silently halve the real limit. → **[F32]**

  **🔴 Second real bug, same run: every exemption silently missed.** `req.path` inside `forRoutes('*')` middleware is `/`, not the real path — Express strips the matched mount prefix, and with a `*` mount the whole path *is* the prefix. So `/health` and the Stripe webhook were both being throttled while the unit tests (which pass a path string directly) stayed green. Fixed with `requestPath()`, which reads `originalUrl`; regression-tested. → **[F33]**

  **Exemptions, and why:** `POST /billing/webhook` (Stripe legitimately bursts, is already authenticated by signature, and **retries harder on a 429** — throttling it manufactures the load it was meant to shed and risks dropping a real subscription state change); `GET /health*` (a throttled uptime probe reads as an outage — same reasoning as AuthMiddleware's own exclusion); and `OPTIONS` preflight (counting it halves every real limit for browser clients, which is every web client this API has).

  **`TRUST_PROXY_HEADER` (new, in `.env` + `.env.example`, default `0`).** `X-Forwarded-For` is caller-supplied, so trusting it on a directly exposed server lets an attacker send a fresh value per request and mint a new bucket every time — the limiter still answers 200 and looks like it works. Off locally, **must be `1` on Vercel** (T53/T59), or every visitor shares the proxy's single IP and one abuser locks out the platform. Both directions unit-tested; the live run proves a rotating forged header does **not** bypass a block (C6).

  **Refusals keep the T16 envelope** — `{statusCode:429, message:"Too many requests — please wait a moment and try again.", error:"Too Many Requests"}` — and ship a standard `Retry-After`. That last part needed `ApiThrottlerGuard`: @nestjs/throttler suffixes headers with the tier name for every tier except `default`, so a refusal from `global`/`identity` shipped only `Retry-After-global`, real information in a header no client has ever read. The primary per-route tier is *named* `default` for the same reason.

  **Verified live (26/26), not assumed:** anonymous 401s on protected routes are now counted; one global bucket spans different routes (298→297 across two endpoints); 400 rapid `/health` calls never throttle and carry no headers at all; 40 webhook posts never 429; the 6th login attempt on one email is refused while the first 5 reach the real auth check; a *different* email from the same IP is unaffected; the same email on a *different* route is unaffected; the route ceiling fires at request **#120** of 120; mixed traffic over 8 different routes trips the global ceiling at #161; and `/health` + the webhook still answer while the caller is globally blocked. Suite **85 passing** (was 67); `tsc --noEmit` clean.

  ⚠️ **Carried to T53:** storage is in-process. On one long-running server that is exact; on Vercel each warm lambda keeps its own counters, so the effective limit is roughly `limit x concurrent instances`. The fix is `ThrottlerStorageRedisService` — a config swap in `app.module.ts` and nothing else, because both halves share one storage service.
  **Verify independently:** `for /l %i in (1,1,6) do curl -s -o nul -w "%%{http_code} " -X POST http://localhost:4000/auth/login -H "content-type: application/json" -d "{\"email\":\"nobody@example.test\",\"password\":\"x\"}"` -> `401 401 401 401 401 429`.
- [~] **T27 — Secrets out of plaintext `.env`.** ⚠️ **One part done early 2026-08-23 because it was live-exploitable.**
  **🔓 `JWT_SECRET` in `.env` was the literal placeholder `change-me-to-a-long-random-string`** — the exact string published in `.env.example` (and now on GitHub). Anyone reading it could **mint a valid token for any account and any role**, including `admin`, which has no guard at all [F7]. **Proven, not theorised:** a hand-forged `{sub:'attacker', role:'admin'}` token signed with that placeholder was accepted by the running API (HTTP 200).
  **Fixed:** replaced with 48 random bytes (base64) in the gitignored `.env`. Re-verified after a full restart — the forged placeholder token now returns **401**, and seeded logins still return 200.
  ⚠️ **`nest start --watch` does NOT reload `.env`** — it recompiles TS but keeps the original process env, and stopping the npm wrapper can leave an orphaned node process holding :4000 (`EADDRINUSE`). After any `.env` change, kill the listener on :4000 and restart, then re-verify.
  **Still to do:** move all secrets to Vercel env vars, and **rotate the Resend key** (highest severity — see CONTEXT.md R4). Original task text follows —
- [x] **T27 (remaining) — Secrets out of plaintext `.env`.** ✅ **DONE 2026-08-24 (session 12)**, except the key rotation, which is a client account action and is **deliberately out of scope** (documented, not done — see below). **19 new specs; boot refusal proven by actually booting the compiled app**, not only in Jest.

  **The blocker to moving secrets was never the move — it was that nothing would notice if a secret went missing.** Every secret in the codebase had a silent fallback: `jwt.util.ts` `?? 'dev-secret-change-me'`, `billing.service.ts` `new Stripe(… ?? '')`, three services `?? 'http://localhost:3000'`. A variable forgotten in the Vercel dashboard would not fail the deploy — it would boot green, report healthy, and then **sign every token, including `role:'admin'`, with a constant published in this repository**. That is [F20] exactly, and [F20] was already *proven* exploitable once (a hand-forged admin token accepted, HTTP 200). A missing env var reproduces it perfectly.

  **New `src/config/env.validation.ts`**, wired into `ConfigModule.forRoot({ validate })` so it runs before anything else is constructed. It refuses to boot on: a missing/empty required var; a **placeholder** value (including the two real strings from this project's history — `change-me-to-a-long-random-string` and `dev-secret-change-me` — plus the `.env.example` house style `…your_…_here`); a `JWT_SECRET` shorter than 32 characters (*"it is set"* is not the property that matters — a short HMAC key is brute-forceable offline from any token the API ever issued); and, in production only, a `localhost` `APP_URL` or `ALLOWED_ORIGINS`, `EMAIL_PROVIDER=log`, `EMAIL_PROVIDER=resend` with no key, and **`TRUST_PROXY_HEADER` left off** (which would collapse T26's limiter to one bucket for the entire internet). It reports **every** problem at once — a deploy that fails one variable at a time costs one round trip per variable. `VERCEL=1` counts as production even with `NODE_ENV` unset, because inferring "not production" from a missing variable would switch the checks off in exactly the situation they exist for.

  **`jwt.util.ts`'s fallback is gone**, replaced by a throw. The suite depended on that fallback to run at all, which was itself the tell — a test signing with a known published constant is exercising something the app must never do. New `jest.setup.ts` supplies a test-only key (`??=`, so a real `.env` still wins), registered via `setupFiles`. It is excluded in `tsconfig.json` for the same reason `prisma/` is ([F23]): outside `rootDir`, it fails the build with TS6059.

  **New `glow-plus-backend/DEPLOYMENT.md`** — the authoritative env-var inventory, built by grepping `process.env` across `src/` and `prisma/` rather than from memory: 15 variables, which are secret, what each is locally vs. on Vercel, **and what specifically breaks when each is wrong**. Plus the Vercel move procedure (scope to Production, mark sensitive, redeploy).

  **Hygiene re-verified, not assumed:** `.env` is gitignored (`.gitignore:3`, confirmed with `git check-ignore -v`), **has never been committed** (`git log --all -- "**/.env"` returns nothing), and `.env.example` contains only placeholders — CONTEXT.md's "keys were sitting in `.env.example`" is no longer true of the current file.

  **Proven live:** compiled with `npm run build`, then booted with (1) the [F20] placeholder → refused, naming it; (2) an 8-char secret → refused, naming the length; (3) `NODE_ENV=production VERCEL=1` against the dev `.env` → refused, listing the localhost `APP_URL`, the localhost `ALLOWED_ORIGINS` **and** `TRUST_PROXY_HEADER=0` in one message. The real `.env` still boots and `POST /auth/login` still returns 201. Suite **104 passing** (was 85); `tsc --noEmit` clean.

  ⛔ **NOT done, and out of scope by the user's decision (2026-08-24): rotating the Stripe, Resend and Vercel credentials.** Those are account actions in each provider's dashboard, not code. The ranked list, with severity reasoning (Resend first — live, no test mode, and a leak lets anyone send mail as the client), is in `DEPLOYMENT.md` under "Still outstanding" for the client to action.
- [x] **T28 — Add `helmet`, tighten CORS** to real origins. ✅ **Done 2026-08-24 (session 13).**

  **What the live API was actually sending before this**, on every single response:

  ```
  X-Powered-By: Express
  Access-Control-Allow-Credentials: true
  ```

  and nothing else. No `X-Content-Type-Options`, no `X-Frame-Options`, no
  `Referrer-Policy`, no CSP, no HSTS. The `Access-Control-Allow-Credentials: true`
  is the interesting half: it went out **even on responses to origins that were
  refused**, and auth here is bearer-token only by contract in both clients
  (`lib/api.js`, and the RN app has no cookie jar). It bought nothing, and it is
  precisely the header that would have made a future "let's just use a session
  cookie" CSRF-able on day one — silently, because the server was already
  advertising support.

  **New `src/config/security.ts`**, written as pure functions of the environment
  so the policy is unit-testable without booting Nest; `main.ts` only wires it.

  **helmet, tuned for a JSON-only API** — verified it is JSON-only first
  (`useStaticAssets`, `sendFile`, `text/html` all return nothing across `src/`),
  which is what makes the defaults tightenable rather than merely acceptable.
  `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
  with `useDefaults: false`, `X-Frame-Options: DENY` (not helmet's SAMEORIGIN),
  `Referrer-Policy: no-referrer`. Two deliberate departures: **`Cross-Origin-Resource-Policy`
  is loosened to `cross-origin`**, because helmet's `same-origin` default describes
  a deployment this project does not have — the site and the API are different
  hosts; and **HSTS is production-only, `preload: false`**, because submitting a
  domain to the browsers' preload list is a one-way door and is the client's call
  about their own domain, not a default to inherit.

  **Applied first in the middleware chain**, deliberately: verified the headers are
  present on a 401 from `AuthMiddleware`, a 404, and a **429 from T26's limiter** —
  i.e. exactly the error responses an attacker generates most, which anything
  registered later would have left bare.

  **CORS.** `credentials: false`. Explicit `methods` and `allowedHeaders`
  (`Content-Type`, `Authorization` — grepped from both clients, not assumed)
  instead of the `cors` default of reflecting whatever the browser asks for.
  Origin matching is exact and case-insensitive with the trailing slash and
  stray spaces normalised off — `https://site.com/` and `a, b` are both natural
  things to paste into a Vercel dashboard and both silently match nothing.

  **`Access-Control-Expose-Headers` is the part with a user-visible payoff:** a
  cross-origin `fetch` can only read the CORS-safelisted response headers, so
  every one of **T26's rate-limit headers was invisible to the website** — the
  limiter was enforced but unreadable, and the UI could not tell a user how long
  to wait after a 429. Proved in a real browser that `X-RateLimit-*` is now
  readable from JS while an unexposed header (`ETag`) still is not.

  **`env.validation.ts` gained two production checks (T27's file):** `ALLOWED_ORIGINS`
  containing `*` — the standard "just make CORS work" fix reached for under deploy
  pressure, which lets any page on the internet read authenticated responses — and
  any entry with no scheme, which never matches a browser's `Origin` and so fails
  CORS in production while the variable looks correctly filled in.

  **The old inline `?? ['http://localhost:3000']` fallback is gone.** It survives
  only outside production, and now *announces itself* at boot — the problem was
  never the default, it was that nothing said it had been used. In production it
  cannot happen at all: `ALLOWED_ORIGINS` is in T27's production-required list, so
  the process refuses to start without it.

  **Verified live, not just in tests.** 36/36 curl checks against the running API
  (every header on 200/401/404/429; allowed vs unlisted origin; the
  prefix/suffix/`Origin: null`/scheme-swap/port-swap near-misses that a naive
  `startsWith` or `endsWith` check lets through; preflight 204 + `max-age`;
  non-browser callers unaffected). **Stripe webhooks re-verified end to end** with
  a real `stripe trigger` — 10 events, all **200** — because [F19] was a raw-body
  regression and helmet now sits ahead of that path. **12/12 real-Chrome checks**
  (`puppeteer-core`, scratchpad-only): the site still logs in and calls
  `/points/me` over CORS, the rate-limit headers are readable, and a page served
  from an origin *not* on the list cannot read the response — while the same
  request in `no-cors` mode still returns an opaque response, proving the refusal
  is the browser's, not a 4xx from the server.

  Suite now **133 passing** (was 104): 26 in a new `security.spec.ts` — which runs
  the real helmet middleware over a fake response and asserts on **emitted
  headers**, not on the options object, since the options being right is not the
  property that matters — plus 3 in `env.validation.spec.ts`. `tsc --noEmit` clean.
  DB untouched (confirmed at exact seed state after the webhook run).
- [x] **T29 — Authorization audit.** ⚠️ **Scope is now known and larger than "verify" — two live defects are already proven, see [F29][F30].** Verify every merchant-scoped route checks ownership (no IDOR: merchant A reading merchant B's data).
      **Confirmed work, not speculation:**
  1. **Add a real role guard.** 19 call sites pass `req.merchantId!` / `req.accountId!` with no check that the caller holds that role. A consumer token currently reads `GET /styles` and gets **200 + every row** [F29]. The `!` assertions must go — a guard should reject before the handler, so the type is honest.
  2. **Fix `RequireActiveSubscriptionMiddleware`'s route patterns.** They match nothing, so the paywall is inert: a `SUSPENDED` merchant still reads _and writes_ [F30]. Re-test with the merchant forced to `SUSPENDED` / `CANCELLED` / `PAST_DUE`, and assert `req.readOnly` is actually honoured by the write handlers (nothing checks it today).
  3. **Audit for the `undefined`-filter trap generally.** `findMany({ where: { merchantId: undefined } })` returns the entire table rather than nothing. Grep every merchant-scoped query for a filter that can go `undefined`.
  4. Only then do the original IDOR sweep (merchant A vs merchant B) with two seeded merchants — the seed has one, which is why this stayed invisible.

  **Done 2026-08-24 (session 14). 51/51 live checks, 146 unit tests passing (was 133), `tsc --noEmit` clean, DB re-seeded to exact baseline.**

  **1. The role guard.** `RequireMerchantGuard` (T17) now covers the last three
  unguarded controllers — `styles` (5 routes), `visits` (2) and
  `GET /merchants/me` — plus `PUT /business-hours`, which the original ticket
  missed: it read `req.merchantId!` too. Reproduced [F29] first, live: a
  consumer token on `GET /styles` returned **200 and every style row**, and on
  `GET /visits` **200 and every visit row**. Both are **403** now. `GET
  /merchants/me` and `PUT /business-hours` were bare **500s** (Prisma rejecting
  an undefined id) — also 403 now, so the caller is told what is wrong.

  **The `!` assertions are gone from every controller in the codebase**, not
  just the ones this task touched. Two new types, `MerchantRequest` and
  `ConsumerRequest` (`middleware/auth.middleware.ts`), declare `merchantId` /
  `accountId` non-optional; guarded handlers take those instead of asserting.
  Deleting a guard now fails the build rather than silently widening a query —
  the compiler enforces what was previously a convention. `RequireMerchantGuard`
  also gained an `accountId` check, which is what makes that type honest
  (`visits.logVisit` writes it to `Visit.loggedBy`).

  **2. The paywall [F30].** Reproduced commercially first: with the merchant
  forced **SUSPENDED**, `GET /styles` returned **200** and `POST /styles`
  returned **201 and created the row**. `RequireActiveSubscriptionMiddleware`
  is **deleted**, replaced by `RequireActiveSubscriptionGuard`
  (`common/guards/require-active-subscription.guard.ts`) applied with
  `@UseGuards` on the real routes. Path-matched middleware has now silently
  missed its target three times here ([F3], [F33], [F30]); a guard cannot be
  aimed at a path that doesn't exist. Note the old registration also listed
  `reward-rules/(.*)` — **that module has no controller at all**, so a third of
  the paywall was pointed at nothing regardless of the pattern bug.

  **PAST_DUE's "read-only" was fiction.** The middleware set `req.readOnly` and
  left it to "the route handlers themselves" — **no handler ever checked it**,
  so PAST_DUE was full access. The guard now refuses POST/PUT/PATCH/DELETE
  itself and still sets the flag. Verified across all three states:
  SUSPENDED/CANCELLED refuse reads and writes; PAST_DUE reads 200, writes 403;
  ACTIVE restored and writing again. **`GET /merchants/me` is deliberately NOT
  paywalled** — a suspended merchant must still reach their profile and billing
  to fix exactly that.

  **3. The `undefined`-filter sweep found a live second instance → [F34].**
  `GET /redemptions/available` takes `merchantId` as a **query** param, which
  can simply be absent — so `undefined` reached
  `rewardRule.findMany({ where: { merchantId } })` and the route returned the
  active reward rules of **every merchant on the platform**. Guarded from birth
  (T23) and still leaking, because a guard fixes *who* is asking, never *what
  they may scope the question to*. Now **400**. Every other multi-row query was
  checked: all take their scoping id from a guard-verified non-optional field,
  a route param (never undefined), or a DB row.

  **4. IDOR sweep, two tenants.** A second merchant was created directly in
  Postgres (not via `POST /merchants/signup`, which also creates a Stripe
  customer — T20 left three orphans that way) with its own style and reward
  rule. Each merchant's `GET /styles` and `GET /visits` return only their own
  rows; B patching A's style → **403**; B deactivating A's style → **403**; B
  logging a visit against A's style → **404**; B's redemption history empty.

  **A real bug found by the audit, unrelated to auth:** `UpdateStyleDto` marked
  `name` and `pointsPerVisit` optional with TypeScript's `?` but no
  `@IsOptional()`, so class-validator ran every decorator against `undefined`
  and **`PATCH /styles/:id` rejected any partial body** — a merchant could not
  rename their own style ("pointsPerVisit must be an integer number"). It
  surfaced because the 400 fired *before* the ownership check and masked what
  the IDOR probe was testing. Fixed; the other seven DTOs were checked and
  already correct.
- [x] **T30 — Consider `jsonwebtoken`** over the hand-rolled HS256 implementation. [F12]

  **Done 2026-08-24 (session 15). Verdict: adopted.** The task said "consider",
  so it was probed before being decided — and probing the hand-rolled code
  against the running API found **four real defects**, three of which let a
  *correctly signed* token bypass expiry completely. Every one below was
  reproduced live at **HTTP 200** on `GET /bookings/me` before the change:

  1. **A token with NO `exp` claim never expired.** The check was
     `if (payload.exp < now)`, and `undefined < number` is `false` — so an
     absent claim silently meant *valid forever*.
  2. **A token with a non-numeric `exp` never expired either.** `'never' < n`
     and `NaN < n` are both `false`. `exp: 'abc'` and `exp: null` both got 200.
  3. **4-, 5- and 6-segment strings were accepted as JWTs.**
     `const [h,p,s] = token.split('.')` drops the rest, so
     `<valid-token>.garbage` authenticated. RFC 7519 requires exactly three.
  4. **The signature was compared with `!==`** — a non-constant-time compare
     on a secret-derived value.

  **None of 1–3 is exploitable by an outsider today** — all three still
  require the ability to sign, and the secret held. Saying otherwise would
  overstate it. They matter because **T47 (refresh tokens) is the next task to
  call `sign()`**, for a second kind of token, and "forgot to pass an expiry"
  would have produced an immortal refresh token with nothing raised anywhere.
  That is the concrete reason to stop hand-rolling now rather than after T47.

  Checked and found **not** broken, so the report stays honest: an `alg:none`
  forgery was already refused (the old code never read the header at all and
  always ran HMAC-SHA256 — safe by accident, not by design), and a
  wrong-secret token was refused.

  **What changed.** `src/middleware/jwt.util.ts` is now `jsonwebtoken@9`
  with the **same exported API** (`sign`/`verify`/`TokenPayload`), so all five
  call sites — `auth`, `merchant-auth`, `admin-auth`, `staff-auth`,
  `auth.middleware` — are untouched. Added: `algorithms: ['HS256']` pinned at
  verify time, `iss`/`aud` **verified** (not merely present), `iat` and `jti`
  on every token, `clockTolerance: 5s` for serverless skew, and an explicit
  shape check that refuses an unknown `role` — previously any string reached
  `req.accountRole`, matched none of the four guards, and failed differently
  in each.

  `jti` is issued but **not yet checked against a store** — stated plainly
  because it does not enable revocation on its own. Issuing it now is what
  makes T47's revocation a one-file change instead of a forced re-login for
  every user.

  Library error strings are mapped back to this API's existing messages
  (`Token expired` / `Invalid token signature` / `Malformed token`).
  Deliberate: jsonwebtoken says _"jwt audience invalid. expected:
  glow-plus-app"_, which describes **our** configuration to an
  **unauthenticated** caller — same principle as [F31], applied to error text
  instead of response bodies. Asserted live.

  ⚠ **Pre-T30 tokens carry no `iss`/`aud` and are now refused** — a one-time
  forced re-login. Deliberate: honouring claim-less legacy tokens for a grace
  period means shipping the new check switched off. The API has never been
  deployed, so the only holders were dev browsers.

  **→ That exposed a real frontend defect, now fixed.** `lib/api.js` stored
  tokens but **never cleared one the server rejected**. A page holding a stale
  token re-sent it on every render, got 401, and displayed the API's own words
  ("Malformed token") as if the user had mistyped something — with no button
  anywhere to clear it. `apiRequest` now drops the token on a **401 that was
  sent with one**. Only 401: a **403** is a *valid* token refused a *specific*
  route (T29's role guards, T29's paywall), and throwing the session away
  there would log a merchant out for touching one admin URL. Both directions
  asserted in the browser.

  **Tested.** **35/35 live checks** against the running API and real Postgres:
  all three roles log in and reach their own routes; the merchant token
  carries `merchantId` and the consumer token **omits** it ([F29]'s root
  cause); T29's role separation still holds (403 both directions); all four
  defects above now **401**; foreign-issuer, foreign-audience, legacy and
  unknown-role tokens all **401**; and a real guarded write (`PATCH
  /styles/:id`) still returns 200. **11/12 in real Chrome** (`puppeteer-core`,
  scratchpad-only) — stale token self-clears, page falls back to its sign-in
  state, a real login stores a T30 token, a 403 leaves the session intact, the
  consumer page's separate token key clears **without** touching the merchant
  session in the same browser, no overflow at 390px. The single non-pass is
  the console-error assertion catching its own fixtures — the planted 401 and
  a `favicon.ico` 404 — not a defect.

  Suite now **161 passing** (was 146): `jwt.util.spec.ts` grew from 8 to 23,
  and the new block mints tokens **the way the old code did** — correctly
  signed, so each test is about claim handling rather than signatures — so
  swapping the library back out for anything hand-rolled fails the build
  instead of regressing invisibly. `tsc --noEmit` clean. DB untouched.
- [x] **T31 — Security review pass** (input validation, error leakage, dependency audit).

  **Done 2026-08-24 (session 15). 45/45 live checks, 14/14 in real Chrome, 189 unit tests passing (was 161), `tsc --noEmit` clean, DB re-seeded to exact baseline.** Five real defects found by running the API, not by reading it. [F28] closed, and [F27] turned out to be only half-closed.

  ### 🔴 1. `POST /merchants/signup` had NO input validation at all — an empty password created a working account

  The controller bound `@Body() dto: MerchantSignupInput`, and `MerchantSignupInput` is a TypeScript **interface**. Interfaces are erased at compile time, so `ValidationPipe` has no metatype to read and **silently validates nothing** — no warning, no error, it just doesn't run. Every other `@Body()` in the codebase was checked; this was the only one.

  Reproduced live, then confirmed by querying Postgres directly:

  | Payload | Result before |
  |---|---|
  | `password: ""` | **Merchant account created whose empty password logs in** — `bcrypt.compare('', hash)` returned `true` on the committed row |
  | `email: "definitely-not-an-email"` | Reached **Stripe**, which rejected it, *after* the password was hashed |
  | `businessName` absent | `PrismaClientValidationError` → bare **500** |
  | `password: 99999` | bcryptjs threw `Illegal arguments: number, number` → bare **500** |

  Consumers were never exposed — their `SignupDto` is a real class with `@MinLength(8)`. **The paying side of the platform had a weaker password rule than the free side: none.** Fixed with `merchants/signup.dto.ts`, matching the consumer rule.

  `whitelist: true` also does nothing without a class, so unknown keys passed through untouched. Nothing was actually mass-assignable, because `OnboardingService.signup()` builds its Prisma `data` field-by-field — **that was luck in the service, not a control**, which is why the DTO is the fix rather than a check in the service.

  > **Checked with the client:** the requirements doc and `TASKS.md` specify **no** password policy — the docx mentions "Password validation" only as a bullet inside its password-reset section. The `MinLength(8)` here is not an invented rule; it is the rule consumers already had.

  ### 🔴 2. [F27] was only half-fixed — a failed email still failed a signup that had already committed

  T60 verified the Resend domain and F27 was marked resolved, but that removed the **trigger**, not the **shape**. The send was still `await`ed, unguarded, *after* the row committed. Reproduced again during this pass: a non-2xx from Resend returned **500 for an account that had in fact been created**, and the caller could not retry, because attempt two hit the duplicate check and got a 409.

  Any transient Resend outage reproduces this in production. Now logged and swallowed on both the consumer and merchant paths — the account is what the user asked for; the email has its own retry route (`POST /auth/resend-verification`). Deliberately **not** wrapped in a transaction: holding a DB transaction open across a third-party HTTP call is worse, and a rollback cannot un-send a mail that already went.

  ### 🟠 3. [F28] — the check-then-create race, resolved differently on each path

  **Consumer:** the pre-check is **deleted**. The unique index was always the thing actually enforcing this; `P2002` is now caught and turned into the same 409 the pre-check used to raise.

  **Merchant:** the pre-check **stays, demoted to a fast path**, because this method creates a **Stripe customer before the database row** — dropping it would make every duplicate attempt (including an ordinary double-click) create a real Stripe customer before failing at the index. T20 left three orphans exactly that way. `P2002` is caught here too, and that is what makes the concurrent case correct rather than correct-by-luck.

  Verified: 6 concurrent signups on one fresh email → `201, 409, 429, 429, 429, 429` — **exactly one account created, zero 5xx.** The 429s are T26's credential throttler doing its job, not a miss.

  **Known limitation, deliberately not fixed in a security pass:** a *true* interleaved race still orphans one Stripe customer. The real fix is to create the DB row first and Stripe second, but `stripeCustomerId` is how `billing.service.ts:227` finds a merchant from a webhook, so reordering changes billing behaviour — that belongs with **T57**, not here.

  ### 🟠 4. `GET /bookings/availability` returned a bare 500 for a missing query param

  The controller bound three loose `@Query('x') x: string` params, which `ValidationPipe` does not validate. A missing `merchantId`/`styleId` arrived as `undefined`, reached `findUnique({ where: { id: undefined } })`, and came back **500**.

  **`AvailabilityQueryDto` already existed in `bookings/dto.ts` and was simply never wired up.** Now bound as `@Query() query: AvailabilityQueryDto`, and `date` is actually matched against `YYYY-MM-DD` instead of carrying a comment saying so. All four cases are **400** with the offending field named.

  This is the [F34] family again — *a guard fixes who is asking, never what they may scope the question to* — and it is worth noting the shape recurred on a **public** route this time.

  ### 🟠 5. The body-size limit worked; the report of it was a 500

  A 500KB body answered `{"statusCode":500,"message":"Internal server error"}`. body-parser's errors are plain `Error`s carrying an HTTP `status` and a `type`, **not** `HttpException`s, so they fell past every branch of the filter into the generic 500. The 100kb limit had been enforced correctly the whole time — **only the reporting was wrong, which is the worst combination, because the client is told to retry something that can never succeed.** Now **413** (`entity.too.large`) and **400** (`entity.parse.failed`), with our own message: body-parser's text names the configured byte limit and there is no reason to publish it. An unrecognised parser type still falls through to 500 on purpose.

  ### 🟡 6. No string field in the API had a maximum length

  Every `@IsString()` accepted whatever fit inside the body limit, and Prisma's `String` is Postgres `text`, which is unbounded too. **A 100,000-character `name` was accepted by `POST /auth/signup` and written to the database** — read back out of Postgres to confirm the row really held 100,000 characters.

  New `common/limits.ts` applies shared ceilings across **all 9 DTO files**. Deliberately generous — a ceiling no legitimate user reaches, not a rule they have to think about. Two notes: `MAX_PASSWORD = 200` is not about storage but about **bcrypt silently ignoring everything past 72 bytes**, so a longer passphrase is truncated and the user never told; and login DTOs get a max but **no minimum**, because a login must not disclose the password policy — a short guess should cost an ordinary 401, not a 400 explaining the rule.

  Also bounded `pointsPerVisit` (`@Max(10_000)`) — nothing stopped a merchant setting 2³¹ points and unlocking every reward on one visit.

  ### Dependency audit

  Started at **27 vulnerabilities, 1 critical**. `npm audit fix` fixed **nothing** — every remaining fix is a major.

  The critical (`tar`, via `@mapbox/node-pre-gyp`, via **`bcrypt`**) was traced rather than assumed: `tar` is required only by node-pre-gyp's `install.js` / `package.js` / `testpackage.js`, while `bcrypt.js` calls only `nodePreGyp.find()`, which never extracts an archive. **Not reachable at runtime** — but it sits in the tree and shows up in any audit the client runs.

  **Fixed by replacing `bcrypt` with `bcryptjs`**, which removes the whole `node-pre-gyp`→`tar` chain. Verified drop-in before switching: bcryptjs verifies existing **native `$2b$` hashes**, native verifies bcryptjs hashes, both emit `$2b$`, and the cost is the same (68ms vs 65ms at rounds=10). All three seeded roles then logged in live against their **pre-existing** hashes, and a wrong password still 401s. Bonus: it drops a native binary from a **Vercel serverless** target, a known source of "works locally, fails on deploy" for T57.

  **Now 25 vulnerabilities, 0 critical, 7 high.** Every remaining one is either **dev-only tooling** (`@nestjs/cli`, `glob`, `picomatch`, `tmp`, `webpack`, `inquirer`, `@angular-devkit/*` — none ships) or an **unreachable transitive** (`multer` — no upload route exists; `lodash` `_.template` — never called with user input; `file-type` — no file validation; `uuid` v3/v5/v6 buffer path — unused). The genuinely runtime-reachable ones are `qs`/`body-parser`/`express` **DoS** issues inside `@nestjs/platform-express`.

  **All of them need Nest 10 → 11, a major upgrade across `core`, `common`, `platform-express`, `schedule`, `testing`, `config` and `cli`.** Not done here on purpose: that is a framework migration with its own regression surface, and running it as an unplanned step inside a security pass, days before deployment, trades a set of low-reachability DoS advisories for a real chance of breaking a working app. **→ raised as T31c.**

  Frontend (`glow-plus-web`): **2, both `vite`/`esbuild` dev-server only** (dev-server request forgery, dev-server path traversal). Neither ships — Vite's dev server does not run in production. Fix is Vite 8, also a major; folded into T31c.

  ### Confirmed NOT broken

  Reported so the record stays honest rather than inflated:

  - **No secret material in any response.** 15 routes across all four roles swept for `passwordHash`, `$2a$`/`$2b$`, Stripe/Resend key prefixes and `DATABASE_URL` — **clean**, including the two [F31] fixed in T17.
  - **No internals in any failure.** 7 failure modes checked for stack frames, `node_modules` paths, `PrismaClient` text and query fragments — clean, and every one returned T16's envelope.
  - **No account enumeration.** Login and forgot-password each return byte-identical bodies for a real vs. unknown address.
  - **Headers.** No `x-powered-by`, no server banner, `nosniff` present. **HSTS is absent in dev by design** (T28: browsers ignore it from a non-secure origin) — confirmed enabled in production mode, and `security.spec.ts` already asserts the emitted header.
  - **Mass assignment.** `status`, `foundingMember` and `id` are all ignored on both signup paths.

  ### Tests

  Suite **189 passing** (was 161). New `common/input-validation.spec.ts` (22) runs the **real global ValidationPipe over the real DTO classes** — the same principle as `security.spec.ts` asserting emitted headers rather than the options object — using the exact payloads that were reproduced live, so a regression fails the build. `all-exceptions.filter.spec.ts` gained 6 for the body-parser mapping, including one asserting the byte limit never reaches the client.

  Frontend re-verified in real Chrome (`puppeteer-core`, scratchpad-only): **14/14** — the booking page still signs in, populates from the live API and returns 27 real availability slots through the newly DTO-bound route, the three former-500 cases are 400 from the browser too, merchant signup now refuses an empty password with a readable message, no overflow at 390px.

- [!] **T31c — Nest 10 → 11 and Vite 7 → 8 major upgrades** (raised by T31's dependency audit). After T31, the backend has **25 advisories, 0 critical, 7 high**, and the website has **2**. **Every remaining fix requires a major version bump** — `npm audit fix` resolves none of them.

  Nothing here is currently exploitable in this app: the backend remainder is dev-only tooling (`@nestjs/cli`, `webpack`, `glob`, `tmp`, `picomatch`, `inquirer`, `@angular-devkit/*`) or unreachable transitives (`multer` — no upload route; `lodash` `_.template` — never called with user input; `file-type`; `uuid`'s v3/v5/v6 buffer path), and both website advisories are **Vite dev-server only** and never ship. The genuinely runtime-reachable ones are `qs`/`body-parser`/`express` DoS issues inside `@nestjs/platform-express`.

  **Deliberately deferred out of T31**: a framework major across `core`, `common`, `platform-express`, `schedule`, `testing`, `config` and `cli` has its own regression surface, and doing it unplanned inside a security pass — days before deployment — trades low-reachability DoS advisories for a real chance of breaking a working app. Wants its own task, its own branch and a full re-run of the 189-test suite plus the live probes. **Worth doing before the client's own `npm audit` is run against a delivered repo**, since "7 high" reads badly without the reachability analysis above.
- [x] **T31b — PII at rest: phone numbers are encrypted.** ✅ **DONE 2026-08-24 (session 15).** Application-level encryption implemented (Option A from the investigation below) — the client asked for this to actually be built, not just decided.

  **What was built.** New `common/pii-crypto.ts`: AES-256-GCM for the value (`User.phone`), keyed HMAC-SHA256 blind index for lookups (`User.phoneFingerprint`, new column, `@unique`). Two columns because authenticated encryption uses a random IV — the same number encrypts differently every time, which is exactly what breaks a naive "just encrypt the column" approach and would have silently killed the `@unique` constraint and any lookup-by-phone. The fingerprint is deterministic and keyed, so uniqueness and search still work but the fingerprint itself doesn't reveal the number without `ENCRYPTION_KEY`.

  `phoneFingerprint` is not a new idea — the column already existed in the delivered schema with **zero code references** (T13's note). This is what it was for.

  **New `ENCRYPTION_KEY`** (32 bytes, hex or base64) is now `ALWAYS_REQUIRED` in `env.validation.ts`, same tier as `JWT_SECRET` and for the same reason: it is used on every write in every environment, so a missing key must fail the app at **boot**, not at the first customer who enters a phone number. Also validated for length (must decode to exactly 32 bytes) and checked that it is not the same value as `JWT_SECRET` — they need to rotate independently, since rotating the JWT secret must not make every stored phone number undecryptable. Generated and written to `.env`; a placeholder added to `.env.example`.

  **Migration `20260824200000_encrypt_phone_at_rest`**, applied to real Postgres: drops the old `User_phone_key` unique index, adds `phoneFingerprint`. **Deliberately no backfill** — `decryptPii()` returns a value unchanged if it isn't in the new `v1:iv:tag:ciphertext` format, so a pre-existing plaintext row keeps working rather than 500ing. Verified: a legacy plaintext row was inserted directly via raw SQL and coexists with encrypted rows with no DB error.

  **Wired at the only two places phone numbers move through the API:** `auth.service.ts` (`signupConsumer`) encrypts on write via `encodePhone()`; `bookings.service.ts` (`listForMerchant` — the merchant's own view of who booked) decrypts on read via `decryptPii()`. Every other `phone` reference in the codebase is either the DTO (`auth/dto.ts`, unchanged — validation happens before encryption) or the prototype's still-`localStorage`-backed demo views (T33/T34), which don't touch the real column.

  **Tested — 17/17 live checks against the real running API and real Postgres, read with raw SQL:**
  - Signed up with `+254712345678` through `POST /auth/signup`, then queried `SELECT phone FROM "User"` directly (bypassing Prisma) — the stored value was `v1:yHmNsR2W4Vy5o8OX:E-_rWjwHZ8rAENsLDKmb-Q:nuuL56ChI00f08Kufg`. **Not the phone number, not a substring of it.**
  - `phoneFingerprint` came back as a 64-char hex string, also not containing the number.
  - A second signup with the **same** phone number, different email → **409**, proving uniqueness survives encryption.
  - A **different** phone number → accepted normally.
  - No phone at all → both `phone` and `phoneFingerprint` are **NULL**, not an encrypted empty string; a second no-phone user also succeeds, proving NULLs stay distinct under the unique index.
  - Full round trip: the phone-bearing consumer booked with the seeded merchant; reading `GET /bookings` **as the merchant** returned `phone: "+254712345678"` — correctly **decrypted**, not ciphertext.
  - A plaintext row inserted directly (simulating pre-migration data) coexists without error.

  Suite **218 passing** (was 189) — new `pii-crypto.spec.ts` (25: round-trip, ciphertext never contains plaintext, random IV produces different ciphertext each call, tampered ciphertext/auth-tag both refused, legacy plaintext passthrough, unicode/long values, fingerprint determinism/uniqueness/formatting-tolerance/keying, `encodePhone`'s NULL-for-no-phone behaviour, key-format handling) and `env.validation.spec.ts` extended (+6, including the new ENCRYPTION_KEY rules). `tsc --noEmit` clean. DB re-seeded to exact baseline (1 user, 1 merchant, 1 admin, 3 bookings — all probe rows deleted).

  **What this makes true that wasn't:** the docx's claim — *"Although phone numbers are encrypted, they are still personal information"* — is now **actually accurate**, closing the gap that would otherwise have reached the privacy policy (T66) as a false statement. See the investigation below for the full before/after evidence and the two other options that were on the table.

  <details>
  <summary>Original investigation (kept for the record — what was found, and the decision this implementation resolves)</summary>

  ⚠️ **INVESTIGATED 2026-08-24 (session 15) — the gap is confirmed and is bigger than "a missing feature": the client's own document states, as fact, that a control exists which does not.** Still **needs a client decision**, so it stays unticked.

  **What the docx claims, in two separate places:**
  1. *"The current development environment contains JWT_SECRET and **ENCRYPTION_KEY** in a plaintext .env file."*
  2. *"The application collects personal information, including email addresses and phone numbers. **Although phone numbers are encrypted**, they are still personal information."*

  **What is actually true — every line of this was verified, not inferred:**

  | Claim | Reality |
  |---|---|
  | `ENCRYPTION_KEY` exists | **Not in `.env` and not in `.env.example`.** Both hold 13–14 keys; neither has it |
  | Phone numbers are encrypted | **They are plaintext.** Signed up through the real `POST /auth/signup` with `+254712345678`, then read the row back **raw from Postgres** (`$queryRawUnsafe`, bypassing Prisma) — it came back `"+254712345678"`, fully readable |
  | Encryption code exists | **Zero.** No `createCipheriv`/`createDecipheriv`/`aes-256`/`scryptSync`/`encrypt(`/`decrypt(` anywhere in `src/` or `prisma/` |
  | DB-level encryption instead? | **No.** `SELECT extname FROM pg_extension` returns **only `plpgsql`** — `pgcrypto` is not installed, so there is no column-level encryption at the database layer either |
  | Scope of exposure | **All PII is plain `text` across 8 tables**: `User.phone`, plus `email`/`name` on `User`, `Merchant`, `Admin`, `MerchantStaff`, `StaffInvite`, `EmailVerification`, `PasswordReset` |

  **Why this is more than a technical gap → it flows into the privacy policy (T66).** The docx derives a legal requirement from the false premise: *"Although phone numbers are encrypted, they are still personal information. A privacy policy is therefore required to explain… How it is stored. How it is protected."* If T66 is written from the docx, **the client publishes a privacy policy asserting phone numbers are encrypted while they are stored in clear text.** That is a compliance exposure, not a backlog item, and it is the part to put to the client in writing.

  **Who actually sends a phone number today** (checked, because it sets both the impact and the cost of fixing):
  - **The mobile app does** — `LoginScreen.js:74` renders a "Phone (optional)" field and `client.js:108` posts it to `/auth/signup`. So **Order 2 will write real phone numbers**.
  - **The current React website does not** — only leftover translation strings remain.
  - **But the prototype design makes phone the consumer's PRIMARY IDENTIFIER** — *"Enter your phone number to pull up your points"*, and the merchant visit form asks for "Client phone". The backend diverged and uses **email** as identity, with `phone` an optional `String?`. **That divergence must be resolved in T35/T36 anyway**, and whichever way it goes changes this decision.
  - Corroborating: `User.phoneFingerprint` exists in the orphan schema with **zero code references** (noted in T13). A "fingerprint" column is exactly the blind index you need to look a record up *by* an encrypted phone — strong evidence the original developer intended application-level encryption and never built it.

  **The decision for the client — three options, with the real trade-off:**

  | Option | What it costs |
  |---|---|
  | **A. Application-level encryption** (AES-256-GCM + a real `ENCRYPTION_KEY`) | Matches what the docx already claims. **But it breaks `@unique` on `phone` and any lookup-by-phone** — randomised ciphertext differs every time. Needs a blind index (the `phoneFingerprint` column) or deterministic encryption. Real work, and it must land *before* the design's phone-as-identity flow is built, not after |
  | **B. Rely on provider disk encryption + access control** (**recommended if phone stays optional**) | Effectively free — managed Postgres (incl. Vercel/Neon/Supabase) encrypts at rest by default. **Does not protect against a leaked DB dump or an over-privileged query**, which is what column encryption is actually for. Requires **correcting the docx and the privacy policy wording** rather than the code |
  | **C. Stop collecting phone numbers** | Cheapest and strongest — the backend already uses email as identity. **Conflicts with the prototype design**, so it needs the T35/T36 identity decision first |

  ➡️ **Blocked on the client.** Recommend **B + a wording correction** if phone stays optional, and **A** if the design's phone-as-login is kept. Either way **T66's privacy policy must describe what is actually implemented** — that part is not optional.

  </details>

- [!] **T32 — M-Pesa/Daraja webhook + IP allowlisting.** ⚠️ **EXHAUSTIVELY VERIFIED 2026-08-24 (session 15): there is NO M-Pesa code anywhere in this delivery. Not "unsecured" — absent.** This is a **from-scratch build**, not a fix, and it **needs a client decision before any work starts**.

  **What the docx says** (its exact words, quoted so the conversation with the client can be precise):
  > *"**Daraja M-Pesa Webhook Security.** The Daraja M-Pesa webhook currently **does not have IP allowlisting. This was identified during development but remains unresolved.** Payment webhooks require strong verification because an attacker could attempt to send a forged payment event directly to the endpoint."*

  and, in its 23-item priority list: *"**Secure the Daraja webhook.**"*

  Both sentences presuppose a working integration that merely lacks one control. **That integration does not exist.**

  **The evidence — six independent checks, two different search tools:**

  | # | Check | Result |
  |---|---|---|
  | 1 | Case-insensitive search for `m-pesa`, `mpesa`, `daraja`, `safaricom`, `stk push`, `lipa na`, `paybill`, `shortcode`, `till number`, `consumer_secret` across **every** `.ts/.js/.jsx/.tsx/.json/.md/.html/.prisma/.env/.yml` in the repo | **Zero hits** outside `TASKS.md` / `CONTEXT.md` — i.e. only our own notes. Confirmed twice, with ripgrep **and** with plain `grep` |
  | 2 | Every `package.json` dependency (backend, website, old frontend, mobile app) | **No payment SDK but `stripe`.** No `mpesa`/`daraja` package, no HTTP client for Daraja calls |
  | 3 | Prisma schema — 15 models, 8 enums | **No payment/transaction/ledger model.** The only money model is `Subscription` (Stripe) |
  | 4 | `.env` **and** `.env.example` | **No `MPESA_*`/`DARAJA_*` keys at all.** A real Daraja integration needs at minimum `CONSUMER_KEY`, `CONSUMER_SECRET`, `SHORTCODE`, `PASSKEY`, `CALLBACK_URL` — none present |
  | 5 | **All 55 live routes**, read from the running API's boot log | **Exactly ONE webhook: `POST /billing/webhook` (Stripe).** No M-Pesa callback route exists |
  | 6 | Mobile app — all 13 source files | Nothing payment-related; `expo-secure-store` is the only security-adjacent dependency |

  **So "add IP allowlisting to the Daraja webhook" is not a task that can be done.** There is no webhook to allowlist. Doing this properly means building: Daraja OAuth token handling, an STK-push initiation call, a public callback endpoint, request validation + replay protection + idempotency, a transaction/ledger model and migration, reconciliation against the rewards logic, plus Safaricom sandbox **and** production credentials from the client (which require a registered Kenyan shortcode/paybill).

  **Commercially this is the second-largest hidden-scope item after the website rebuild** [R2][R3] and it is **not priced** into the $300 Order 1. See §"Message for the client" at the end of this file.

  ➡️ **Blocked on the client. Do not start. Three possible answers:** (a) it was never built and is **not** wanted → strike it from the list and correct the docx; (b) it is wanted → **scope and price it as separate work**; (c) it exists in some other repo/branch the delivery did not include → **ask for that code**, since the docx says it was "identified during development", implying the author had it in front of them.

# PHASE 5 — Website build _(the real Order 1 work)_

- [x] **T33 — Confirm approach.** ✅ **CONFIRMED 2026-08-24 — go-ahead given to proceed.** The existing HTML can't be wired up — it has no API calls, no password fields, and a browser-nonexistent storage layer. **Rebuild against the API, keeping the existing HTML as the design reference.** [F9][F10]
      **Still worth raising with the client separately** (see "MESSAGE FOR THE CLIENT" below) — this item is absent from their 23-item list, so it's an unpriced scope addition even though the technical approach is now settled and unblocked.

  **The design itself is a real asset and should be preserved, not redrawn.** View it any time with:
  `node "<scratchpad>/design-preview.js"` → **http://localhost:8080**

  What's already designed and reusable (6 complete views, ~247 lines CSS, ~1,300 lines JS):

  | View                      | Element                                           |
  | ------------------------- | ------------------------------------------------- |
  | `view-marketing`          | Landing page, founding-spots counter              |
  | `view-consumer-auth`      | Consumer signup/login                             |
  | `view-consumer-dashboard` | Punch card, rewards, salon grid, visit ledger     |
  | `view-business-auth`      | Merchant signup/login                             |
  | `view-business-portal`    | Styles, reward rules, visit logging, portal stats |
  | `view-admin`              | Approval queue, metrics                           |

  Render functions already written: `renderAdmin`, `renderBusinessPortal`, `renderConsumerDashboard`, `renderFoundingSpots`, `renderLedger`, `renderPortalStats`, `renderPunch`, `renderRules`, `renderSalonGrid`, `renderStyles`, `renderVisitStyleOptions`.

  **So the rebuild is "swap the data layer, keep the design"** — replace `window.storage` calls with real API calls, add the missing auth UI. The visual work is largely done; that meaningfully reduces the effort versus designing from scratch.

- [x] **T34 — Project setup.** ✅ **DONE & VERIFIED 2026-08-23 (session 3).** React + Vite app at `website/website/glow-plus-web/`, three entry points (main site, `verify-email`, `billing-result`). Framework, routing and the storage seam are in place; **API client + token storage + protected routes are NOT** — they arrive with T35–T38. See `glow-plus-web/MIGRATION.md` and CONTEXT.md §11.
      **Evidence:** layout fingerprint vs. the original prototype (tag, class, id, text and bounding rect for every element, in document order) → **276 vs 276 elements, IDENTICAL at 1280px and 390px** · functional pass **67/67** in real Chromium · production build serves `/verify-email` and `/business/billing` 200 with correct titles.
      **The storage seam:** `src/lib/storage.js` keeps `window.storage`'s exact async contract but is backed by `localStorage`, so `src/lib/data.js` ported over unchanged. ➡️ **Replacing that one file is how Phase 5/6 moves onto the real API — do not scatter `fetch` calls through the views.**
- [x] **T35 — Auth UI** — signup, login, logout, email verification. ✅ **DONE & VERIFIED 2026-08-24.**

  **What changed:** `ConsumerAuth.jsx` and `BusinessAuth.jsx` (the SPA's real, currently-shown views — not the standalone pages T17/T18/T21–T24 built as workarounds for this exact gap) no longer touch `data.js`/`localStorage` [F9]. Both now call the real API: `POST /auth/signup` + `POST /auth/login` (consumer) and `POST /merchants/signup` + `POST /merchants/login` (merchant), added to `lib/api.js` alongside `resendVerification`. Real email + password fields replace the old name+phone-only form — the backend has no phone-based login (`LoginDto` is email/password only), so email is the identity; phone stays as an optional signup field (`SignupDto.phone?`). Each view toggles between login/signup mode in place. **Logout** is real: `AppContext` gained `signOutConsumer`/`signOutMerchant`, which clear the actual JWT (not just local view state) and are wired into a new conditional "Log out" button in `TopBar`, **and** into the dashboard/portal's existing "Switch account"/"Switch salon" buttons — those previously only did `setCurrentConsumer(null)` locally and left a valid JWT sitting in `localStorage`, which is now fixed as part of building a real logout path.

  **Email verification:** signup shows an inline success panel ("check your email to verify, then sign in") with a **working resend button** calling `POST /auth/resend-verification`. An unverified login still succeeds (matches backend behaviour — no gate) but surfaces a reminder toast.

  **Two real backend bugs found and fixed while wiring the resend button, not pre-existing findings from the audit phase:**
  1. `resendVerification` did not catch a failed `sendVerificationEmail()` — any provider error (proved live: Resend's API rejects `@example.com`-style test domains with a 422; a real production outage would do the same) crashed the request with a bare **500**. `signupConsumer` already catches this exact failure (T31/[F27]); `resendVerification` never got the same fix. Now caught and logged, matching the established pattern.
  2. `resendVerification` only ever queried the `User` table — a **merchant's** resend request silently hit the account-enumeration `{ok:true}` short-circuit and **never sent anything**, with no error to indicate it. `forgotPassword` (T21) already handles this by querying both `User` and `Merchant`; `resendVerification` is the same "one endpoint serves both account types" shape and was missing that half. Fixed identically (`auth.service.ts`).

  **F24 fixed:** the dead "Go to business login" / "Go to customer login" links. Root cause confirmed as documented: `applyStaticTranslations()`-style `innerHTML` overwrite destroyed a nested anchor. Design call: the switch-role text is now split into a static lead-in (`T` component, unchanged) plus a real `<button className="link-btn">` calling `showView()` directly — no anchor/innerHTML collision possible. Required adding `customer_login_link` as a new translation key (English only, splitting the previously-monolithic `business_auth_switch` string) since the business→consumer direction never had a separate link key at all, unlike the consumer→business direction which already had `business_login_link` sitting unused. New auth-UI strings (`label_email`, `label_password`, submit/toggle/logout/verify-banner copy) were added to the `en` block only — `useI18n`'s `t()` already falls back to English for missing keys, so this is non-breaking for the other 7 languages, not yet fully localized (follow-up, not a regression).

  **Deliberately removed:** the "quick pick an existing card/salon" buttons that let anyone click straight into any local record with no credentials — that was a demo affordance for the fake data layer and cannot exist once accounts are real and password-protected.

  **Scope boundary, stated plainly so it isn't mistaken for more than it is:** logging in sets `currentConsumer`/`currentMerchant` to a small real-identity object (id/name/businessName/status from the API response) so the dashboard header shows the real logged-in user, but the **rest** of `ConsumerDashboard`/`BusinessPortal` (punch cards, salon grid, styles, visit ledger) still reads local fake data via `data.js` — that full rewire is **T36/T37**, not this task. One concrete, harmless side effect: `BusinessPortal`'s pending/suspended banner now reflects the merchant's **real** `status` from the API instead of always being freshly `PENDING`, which is a correctness improvement, not a bug.

  **Tested — driven Chromium (`puppeteer-core`, scratchpad-only), real dev servers, real Postgres, 22/23 automated checks passed** (the 1 "failure" is the same benign console-error pair T17/T22 already documented as expected — a `/favicon.ico` 404 and the deliberate wrong-password 401): consumer signup → success notice → resend confirms sent → login → dashboard → real token in `localStorage` → logout clears it → returns to auth; wrong password shows the real API error text (`Invalid email or password`); both F24 links navigate correctly in both directions; merchant signup → login → portal shows the real business name → logout clears the real token; mobile width (390px) introduces no *new* overflow beyond the pre-existing T39 issue. `tsc --noEmit` clean on the backend, **218/218 Jest tests still passing**, `npm run build` clean on the frontend. Test accounts created during the run were deleted afterward — DB back at exact seed state (`users:1, merchants:1`).
  **Verify independently:** open `http://localhost:3000/`, click "Track my rewards" or the business button, toggle to "Create an account", sign up with a real email/password, then log in.
- [x] **T36 — Consumer flow** — salon directory, styles, rewards, visit history, bookings. ✅ **DONE & VERIFIED 2026-08-24 (session 17).**

  **What changed.** `ConsumerDashboard.jsx` and the landing page's "find a salon" grid no longer read `data.js` → `localStorage` [F9]. Every number on the consumer's screen is now a real request. The dashboard is four tabs, reusing BusinessPortal's `.portal-tabs` / `.ptab-panel` markup so the two dashboards read as one product:

  | Tab | Endpoints | What it does |
  |---|---|---|
  | Rewards | `GET /me/rewards` (T42), `POST /redemptions` | per-salon points, punch card or meter per rule, **Redeem** on an unlocked one, recent visits |
  | Book | `GET /merchants/public`, `GET /styles/public/:id`, `GET /bookings/availability`, `POST /bookings` | salon → service → date → real open times → book |
  | Appointments | `GET /bookings/me`, `PATCH /bookings/:id/cancel` | upcoming and past, with cancel |
  | Visit history | `GET /visits/me` (T45) | every visit at every salon, expired points struck through (T25) |

  **Two endpoints were pulled forward to unblock it** — the same move T18 made for T43/T44, except these two are built to their full stated spec, so they are ticked: **T42** `GET /me/rewards` and **T45** `GET /visits/me`. See their entries in Phase 6.

  **Three real defects found and fixed, every one of them introduced by earlier work rather than pre-existing findings:**
  1. **Every view stays mounted** (`.view.active` toggles visibility, not existence), so the new panels' loaders fired `GET /bookings/me` and `GET /visits/me` for anonymous visitors sitting on the **landing page** — two guaranteed 401s on first paint. Worse, the 401 handler called `signOutConsumer()`, which navigates to the login view: a first-time visitor could be yanked off the marketing page by a request they never made. Both loaders are now gated on `currentConsumer`, and the sign-out branch only fires when there is a session to end. Proved fixed — the passing run's network log contains **no 401 at all**.
  2. **A points-threshold rule drew one punch dot per point.** The prototype punched `triggerValue` dots for every rule, which was invisible against its own invented data; the seeded "200 Points = $20 Off" renders **two hundred dots**. `RewardProgress` now keeps dots for `VISIT_COUNT` (that is what a punch card counts) and gives `POINTS_THRESHOLD` a meter reading "250 / 200 pts".
  3. **[F25]/T39's overflow had got worse, not better.** T35's conditional "Log out" button pushed the 390px document from the recorded 401px to **460px**, because `.topnav` does not wrap — the exact cause [F25] names. Fixed with `flex-wrap:wrap`. **T39 stays open** for the rest of the mobile pass; this closes its measured starting point.

  Also fixed in passing: `input[type=email|password|date]` were missing from the one CSS rule that styles form fields, so **T35's real auth form rendered browser-default inputs** beside correctly-styled ones. And the four-column visit-history table now scrolls inside its own box instead of widening the page.

  **Tested — real Chrome (`puppeteer-core`, scratchpad-only), real dev servers, real Postgres: 29/29 checks passed.** Not response-shape assertions; the browser drove all of it. Landing page lists a real salon **with `localStorage` proven empty**. Login → the dashboard shows the real name, the signed-in email, and a `totalPoints` **equal to what `GET /me/rewards` returns**. A full punch card at the moment a reward unlocks. Redeem → `POST /redemptions` **201** → the card re-locks, because `/me/rewards` re-derives eligibility server-side rather than the page assuming it. Salon and service dropdowns from the public endpoints. 27 real availability slots for a chosen date; book → **201** → the booked 9:00 AM slot is gone, and so are the five overlapping starts a 90-minute service blocks. The appointment appears under Appointments; cancel → **200**, and it sticks. Visit-history row count equals `GET /visits/me`. No horizontal overflow at 390px on **any** of the four tabs. The only console error left is the `/favicon.ico` 404 every page has.

  Suite **230 passing** (was 218) — 12 new specs for `MeService`. `tsc --noEmit` clean, `npm run build` clean. Every row the test wrote (redemptions, bookings) was deleted afterwards; visits untouched, DB back where it started.
  **Verify independently:** `http://localhost:3000/` → "Track my rewards" → `consumer@glowplus.test` / `Consumer123!` → the four tabs.

  **Deliberately left alone:** the standalone `/consumer/booking` and `/consumer/rewards` pages (T18/T23) still work and are untouched — they were built as workarounds for the missing SPA auth, and retiring them is a separate call, not part of building the real thing. The marketing page's founding-spots counter still reads `data.js`: it is a marketing number rather than consumer data, and no endpoint exposes it.
- [x] **T37 — Merchant portal** — profile, styles, reward rules, visits, staff, billing. ✅ **DONE & VERIFIED 2026-08-24 (session 18).**

  **Two tasks in a trench coat, as predicted — the reward-rules HTTP layer had to be built before the portal could be wired to anything.**

  **Backend — `src/modules/reward-rules/` gained a controller, DTOs and CRUD.** It previously had a module declaring **no `controllers` array at all** and a service with exactly one method, `evaluate()`. Five routes now exist: `GET /reward-rules`, `POST /reward-rules`, `PATCH /:id`, `PATCH /:id/activate`, `PATCH /:id/deactivate`.

  **The role split was a decision, not an inheritance.** Reads take `RequireMerchantGuard` (owner **and** staff — a receptionist has to be able to tell a client what they are working toward). **Every write takes `RequireMerchantOwnerGuard`.** A reward rule is a standing commitment to give money away, applied automatically by `POST /visits` with nobody approving it at the till — the same class of decision as the subscription itself, which T24 moved onto the owner guard for exactly this reason. This is a **deliberate divergence from `styles.controller.ts`**, where staff may write: mispricing a style costs the points on one visit, not a recurring giveaway. Verified with a real staff account driven through the real invite → accept → login flow: `GET` **200**, `POST` **403**, `PATCH .../deactivate` **403**, while `GET /styles` stayed **200** for the same token.

  **No `DELETE`, on purpose.** `Redemption` rows carry a `rewardRuleId` foreign key, so removing a rule would orphan or erase the customer's redemption history — which is what T23's double-redemption check re-derives eligibility from. Deactivation is the reversible "remove this offer" a salon actually means.

  **Validation the DTO could not express, so it lives in the service.** `rewardValue` means something different per `rewardType` — 100 is the whole discount for `PERCENT_OFF` and one dollar for `FLAT_DISCOUNT` — so a single set of decorators on the property cannot be right for all three. Refused live, each with a readable message: a **500% discount** (400), `FREE_SERVICE` with no `freeServiceStyleId` (400), a `triggerValue` of **0** (400 — it is used as a modulus in `evaluate()`, and 0 makes every comparison `NaN`, so the rule would never unlock, silently, forever), and a bad enum (400). A PATCH is validated against **the row it will produce**, not the half of it in the body: switching `FREE_SERVICE` → `PERCENT_OFF` without resending a value is refused rather than silently saving a 0% discount.

  **Cross-tenant references closed at the column, not just the guard.** `styleScopeId` and `freeServiceStyleId` are foreign keys a caller supplies by id — the [F29] problem reached through a column. Proved against a **real second merchant**: scoping a rule to their real style id → **400**, giving away their style as a free service → **400**, `PATCH`ing their real rule → **403 "Not your reward rule"**, and their rule never appears in the first merchant's list.

  **[F30]'s paywall now genuinely covers this path** — the dead middleware was registered for `reward-rules/(.*)` and matched nothing because *there were no reward-rules routes at all*. Verified by moving the merchant's real status through Postgres: **PAST_DUE** → read 200 / write 403 read-only; **SUSPENDED** → 403 both ways; **ACTIVE** → 201 again.

  **Frontend — `src/views/BusinessPortal.jsx` no longer reads `data.js` → `localStorage` [F9].** Every panel is a real request, reusing T36's `useApiError` / `usePortalData` seam (including its 401-while-signed-out gate, so an anonymous visitor on the landing page fires **no** requests — confirmed, zero 401s in the passing run's network log). Seven tabs: Log a visit, Styles, Reward rules, Visit ledger, **Profile** (new), **Team** and **Billing** (hand-offs).

  **Three divergences from the prototype, all resolved in the backend's favour:**
  1. **A visit names its client by EMAIL, not phone.** The mockup's "Client phone" would have logged visits against people the rest of the platform cannot find; `POST /visits` creates a lightweight account for a walk-in who has never signed up. Same identity question flagged under T35/T36 — settled here for the merchant side.
  2. **A reward rule's scope is a STYLE, not a category.** The mockup offered "Hair only / Nail only / Spa only"; `RewardRule.styleScopeId` has always been a foreign key to one `Style` row. The dropdown now lists the salon's real styles.
  3. **A flat discount is stored in CENTS.** The prototype rendered `'$' + rewardValue`, turning the seeded 2000 into **"$2000 off"**. Fixed the same way T36 fixed it consumer-side, and the merchant form now takes dollars and converts.

  Also: the "free service" reward swaps the meaningless number box for a style picker; the ledger reuses T36's `.table-scroll` and strikes through T25-expired points; "unique clients" counts real user rows rather than distinct phone strings, so typos are no longer separate people.

  **Scoping calls, made up front and recorded so the client can revisit them knowingly:**
  - **Profile is READ-ONLY.** No `PATCH /merchants/me` was built. `businessName` is what the public salon directory lists *under an admin's approval*, `email` is the login identity, and `status` is the admin's to set — none is safely self-serve without a moderation story, and the prototype's own portal had no profile editor. **If the client wants editing, it is a small follow-up** (one endpoint + DTO + owner guard), not a rebuild.
  - **Team and Billing hand off rather than duplicate.** `/team` (T24) and `/business/billing` (T17) already work and are tested. The portal shares the billing page's token key (`glowplus:token`), so that hand-off carries the session with no second sign-in; `/team` keeps its own key on purpose because it can hold a *staff* token, which has fewer rights.

  **Tested — real Chrome (`puppeteer-core`, scratchpad-only), real dev servers, real Postgres: 33/34 checks passed.** The one non-pass is console noise from the test's own deliberate 400 (the 500%-discount rejection) — the same expected-error class T22/T35 already documented. Highlights, all driven in the browser: stat tiles equal `GET /visits` and `GET /reward-rules` exactly; `localStorage` proven to hold **no** prototype data keys; creating a style adds one card and the row exists via the API; deactivating persists server-side; creating a reward rule through the new endpoint works and the 500% attempt is refused with the API's own words reaching the toast **and nothing written**; logging a visit creates a real row attached to an auto-created client; **the 2nd visit unlocks the new rule because the server said so**, not because the browser did modulo arithmetic; ledger row count equals `GET /visits`; profile shows real data and leaks neither `passwordHash` nor `stripeCustomerId` ([F31]); no horizontal overflow at **390px on all five data tabs with real rows loaded**.

  Suite **251 passing** (was 230) — 21 new specs for the reward-rules CRUD. `tsc --noEmit` clean, `npm run build` clean. Every row the test wrote was deleted afterwards; DB back at exact seed state.

  **Noted in passing, not a defect:** repeated debug logins tripped `@ThrottleCredentials()` into its 15-minute block (T26 [F3] working as designed). The throttler store is in-memory, so a backend restart clears it — worth knowing before mistaking it for a broken login.

  **Verify independently:** `http://localhost:3000/` → "For salons" → `merchant@glowplus.test` / `Merchant123!` → the seven tabs. Try saving a reward rule at 500% off to see the server refuse it.
- [x] **T38 — Admin panel** — approval queue, MRR/churn metrics. ✅ **DONE & VERIFIED 2026-08-24 (session 19).**

  **The ticket said "frontend-only" and was almost right — one endpoint was missing.** T22 built admin login, the pending queue, approve/suspend and the three metrics routes, all behind `RequireAdminGuard`. The gap was the **"All salons" list**: the API only ever exposed the PENDING slice (`GET /admin/merchants/pending`), and a SUSPENDED or CANCELLED salon by definition never appears in a pending queue — so there was no way to *see* a suspended salon, let alone reactivate one. `GET /admin/merchants` now exists for it, the same "build the missing HTTP layer first" move T37 made for reward rules, at a fraction of the size.

  **Backend — `GET /admin/merchants?status=`.** `MerchantsService.listByStatus()` already took an optional status and already selected through `MERCHANT_PUBLIC_SELECT`, so T17's `passwordHash`/`stripeCustomerId` allow-list [F31] covers the new route **by construction** rather than by remembering to strip anything — confirmed live, neither field appears in the response. New `AdminMerchantsQueryDto` bound as a **whole object**, not `@Query('status')`: a loose query param is not validated at all [F38], and an unchecked status string reaching Prisma's enum filter is a `PrismaClientValidationError` — a bare **500** for a plainly bad request. Now **400** naming the five valid values.

  **The absent-filter case was checked against [F34] rather than assumed safe.** `?status=` omitted means "every merchant", which is exactly the `undefined`-reaches-`where` shape that leaked every merchant's reward rules from `/redemptions/available`. The difference is real and worth stating: there the missing filter widened *one consumer's* question into everyone's data; here the route is admin-only and the wide answer is the intended one. Authorization swept live anyway: consumer token **403**, merchant token **403**, no token **401**, admin **200**.

  **Frontend — `src/views/Admin.jsx` no longer reads `data.js` → `localStorage` [F9], and the view is no longer open to the public.** It was the most misleading of the three dashboards: "Approve" wrote `status:'ACTIVE'` **to the operator's own browser**, so the salon stayed PENDING on the server, the owner saw no change, and the admin had no way to tell. Est. MRR was `activeSalons × 4999` — a number invented in the browser, not one subscription read. And the topbar's Admin button opened the whole thing with **no sign-in at all**, because there was nothing real behind it to protect.

  Now: a real `POST /admin/login` gate, eight stat tiles from the three metrics endpoints, a live approval queue and a live "All salons" list. It reuses T36/T37's `useApiError` / `usePortalData` seam — renamed for the admin session and, importantly, keeping its **signed-out gate**, so an anonymous visitor on the landing page fires **zero** `/admin/*` requests (verified in the network log; without the gate this view alone would emit six guaranteed 401s on first paint, since every view stays mounted).

  **Four decisions worth recording:**
  1. **A third session, not a flag on the merchant one.** `currentAdmin` lives beside `currentConsumer`/`currentMerchant` in `AppContext`, on the separate `glowplus:token:admin` key T22 created — so a platform admin and a salon owner can be signed in in the same browser without clobbering each other. Verified: after admin login the merchant and consumer keys are still empty, and the T22 standalone `/admin/panel` page picks the SPA's session straight up with **no second sign-in**, because the two surfaces are one session by design.
  2. **A 403 does NOT sign the admin out** — a deliberate divergence from the standalone `/admin/panel` page, which reloads on 401 *or* 403. A 403 is a valid token refused *one* route; treating it as a dead session is how a single unlucky endpoint logs an admin out of everything. Proved by firing a real admin token at `GET /styles`: **403**, session intact. (A 401 still signs out — `lib/api.js` has already discarded that token by then.)
  3. **"Reactivate" is `approve`, not a third endpoint.** The API has exactly two transitions. A suspended salon returning and a new application being accepted are the same write; only the label differs, because only the admin's intent differs. Both directions driven in the browser and confirmed **in Postgres**, not in the response body.
  4. **Suspend appears in the pending queue too** — it is how an application gets *rejected*. Without it the queue has no exit but promotion, so a junk signup sits there forever.

  **Also fixed:** the prototype knew three merchant statuses; the schema has five, so **PAST_DUE and CANCELLED fell through its label chain and rendered the raw enum name** in the badge. Nobody had ever seen it because no status was real. Both are labelled now, and the two the prototype's copy never covered use plain English rather than eight invented translations — the same call T37 made for the portal's new panels.

  **Est. MRR can legitimately read $0.00 now, and that is the point.** It is the sum of every ACTIVE/TRIALING `Subscription`, annuals normalised to a month. A merchant who is ACTIVE but never completed Stripe checkout contributes nothing — which is the honest answer the invented `count × 4999` could never give. Proved both ways: **$0.00** against the untouched seed, then **$49.99** after inserting one real 4999-cent ACTIVE subscription.

  **Tested — real Chrome (`puppeteer-core`, scratchpad-only), real dev servers, real Postgres: 47/47 checks passed.** Every 4xx the run produced is accounted for by name — the cosmetic `favicon.ico` 404, the test's own wrong-password 401, and the deliberate 403 guard probe; nothing else. Highlights: all eight tiles cross-checked **field-by-field against the API's own JSON**, not eyeballed; `localStorage` proven to hold nothing but the admin token; the Founding-50 badge follows the real `foundingMember` column (present on fixture A, absent on B); approve → the row is **ACTIVE in Postgres** and leaves the on-screen queue; suspend → reactivate → suspend-as-reject all confirmed in the database; a SUSPENDED salon visible in "All salons" and correctly *absent* from the pending queue; and **no horizontal overflow at 390px with real rows loaded** — the specific caveat T39 raised about the admin view having only ever been measured empty.

  New `.lc-actions` CSS, because the admin console is the first screen to put **two** decisions on a `.list-card` where every other one has a single button; the buttons keep their size and the text column shrinks, so a long salon email wraps instead of pushing the page sideways.

  Suite **261 passing** (was 251) — 10 new specs running the real `ValidationPipe` over the new DTO. `tsc --noEmit` clean, `npm run build` clean. Fixtures were created **directly in Postgres**, not through `POST /merchants/signup` (which also creates a Stripe customer — T20 left three orphans that way), and all of them plus the test subscription were deleted afterwards; DB back at exact seed state (1 merchant, 0 subscriptions).

  **Scoping call, recorded so it can be revisited knowingly:** the admin session is **not restored from its stored token on reload**, matching `currentMerchant`/`currentConsumer`, which aren't either. Making all three survive a refresh is one change in one place and belongs with **T47** (refresh tokens), not bolted onto the admin view alone — an admin who appeared signed in while the merchant view had signed itself out would be the odd one out in the same shell.

  **Noted, not fixed — the last [F9] remnant in the SPA → [F42].** The landing page's founding-spots counter (`Marketing.jsx`, `FoundingSpots`) still counts `foundingBadge` in this browser's `localStorage`, so it reads "50 spots left" on every fresh browser forever. T36 already flagged it as *"a marketing number rather than consumer data, and no endpoint exposes it"* — still true, and T38 is the first task with an endpoint that knows the real count, except that one is admin-only and this is a public page. Fixing it needs a genuinely public count (or a `foundingMember` field on `/merchants/public`), which is **T43**'s territory, not T38's.

  **Verify independently:** `http://localhost:3000/` → **Admin** in the topbar → `admin@glowplus.test` / `Admin123!`. The tiles are live; with only the seed data the queue will correctly say "Nothing pending". To see the queue do something, sign up a salon at "For salons" and watch it appear, then approve it and sign in as that salon to see it leave the pending banner.
- [ ] **T39 — Mobile-friendly** across all views (docx explicitly asks for this).

  ✅ **[F25] is closed — do not go looking for it.** The horizontal overflow was `.topnav` not wrapping; T36 fixed it with `flex-wrap:wrap`, and because the topbar is shared shell the fix applies everywhere. **Re-measured 2026-08-24 at a 390px viewport: all six SPA views report `scrollWidth` 390px** — landing, consumer auth, consumer dashboard, business auth, business portal, admin — plus all four consumer-dashboard tabs with real data loaded. Nothing scrolls sideways any more.

  ⚠️ **But that measurement is the floor, not the task.** Two honest caveats on it: the business-portal and admin views were measured in their **signed-out, empty state**, so a wide table or stat row could still overflow once real rows are in them (the consumer dashboard's four-column ledger did exactly that until T36 wrapped it in `.table-scroll` — reuse that class). **That caveat is now closed for both**: T37 re-measured all five portal tabs and T38 re-measured the admin console — two 4-column `.stat-row`s, a live approval queue and a full salon list — with real rows loaded, both still 390px at 390px; and `scrollWidth` says nothing about whether a page is *usable* on a phone.

  **So what is actually left is the qualitative pass**, which needs a real device or emulation and human judgement, not a number: tap-target sizes, the 4-column `table.ledger` and `.stat-row` under real data, `.panel-grid`'s two-column form/list split, the language switcher, and Arabic RTL at narrow widths (T40 verified RTL works; nobody has checked it at 390px).
- [x] **T40 — Preserve the i18n — it's 8 languages, not 3.** ✅ **DONE & VERIFIED 2026-08-23.** `I18N` + `LANG_NAMES` extracted verbatim with `sed` (source lines 627, 630–1352) into `src/i18n/translations.js`; all 8 language blocks confirmed present. Browser-verified: switcher lists 8, Arabic flips `document.documentElement.dir` to `rtl` and translates, French returns it to `ltr`. `en, es, fr, de, pt, zh, ja, ar` — including **Arabic with full RTL** (`document.documentElement.dir` flips). All translation strings already exist in the prototype and are directly reusable. This is a genuine asset; don't lose it in the rebuild.
- [x] **T41 — Keep `verify-email` + `billing-result` pages working.** ✅ **DONE & VERIFIED 2026-08-23.** Both ported to React as **separate Vite entry points** (their CSS targets bare `body`/`.card`/`h1`/`p` and would collide with the main site's stylesheet in a single SPA). Real API call to `POST /auth/verify-email` preserved.
      **Routing:** Express's two routes are now a `vite.config.js` plugin (dev/preview) + `vercel.json` rewrites (prod): `/verify-email` → `verify-email.html`, `/business/billing` → `billing-result.html`. ⚠️ **Any other host needs the same two rewrites** — the backend has these URLs baked in (`APP_URL`, `billing.service.ts` `success_url`/`cancel_url`).
      **Evidence:** verify-email missing-token error, bogus-token → real 'Verification failed' from the running backend · billing success (+ session id echoed, webhook note), canceled, and direct-visit states all correct.

# PHASE 6 — Endpoints the clients need but that don't exist

Build to the shapes the RN app already expects (`glow-plus-mobile app/src/api/client.js`) so Order 2 needs no backend changes.

- [x] **T42 — `GET /me/rewards`** — match `client.js:44-91` field-for-field. ✅ **DONE & VERIFIED 2026-08-24 (session 17)**, pulled forward because T36 could not be built without it. `src/modules/me/`, consumer-guarded from the first commit.
      Every field the RN app's `DEMO_REWARDS` names is produced under the same name: `totalPoints`, and per merchant `merchantId`, `businessName`, `points`, `rewards[{ ruleId, name, triggerType, triggerValue, progress, remaining, rewardType, rewardValue }]`, `recentVisits[{ id, styleName, styleType, pointsEarned, visitDate }]`. Three fields are **added** on top — `oneTime` and `eligible` on a reward, `expired` on a visit — which a client that ignores them cannot notice, and which save the website one call to `/redemptions/available` per salon purely to decide whether a Redeem button is live.
      **Progress maths is deliberately identical to `RedemptionsService.progressFor`** — same `expired:false` filter (T25), same `styleScopeId` narrowing, same `progress % triggerValue`, same oneTime/repeatable rule. If they ever disagreed, a customer would see a Redeem button that `POST /redemptions` then refuses. Proved against the live API rather than asserted: `/me/rewards` and `/redemptions/available?merchantId=` return identical `progress`/`remaining`/`eligible` triples for the seeded consumer. 12 unit specs. Verified live: consumer **200**, merchant token **403**, no token **401**.
- [ ] **T43 — `GET /merchants`** — public salon directory.
- [ ] **T44 — `GET /styles/public/:merchantId`** — current `/styles` is merchant-scoped _and_ behind `RequireActiveSubscription`, so it can't serve consumers.
- [x] **T45 — `GET /visits/me`** — consumer visit history. ✅ **DONE & VERIFIED 2026-08-24 (session 17)**, pulled forward with T42. Newest first, flattened to `{ id, merchantId, businessName, styleId, styleName, styleType, pointsEarned, visitDate, expired, expiredAt }`.
      **Selected explicitly rather than `include`d** — an `include: { merchant: true }` here would have shipped the salon's `passwordHash` and `stripeCustomerId` to every customer, which is exactly [F31]. Expired visits are returned on purpose: T25 means a visit stops *counting*, never that it vanishes from history.
      **This forced a guard restructure on `VisitsController`.** Its guards were controller-wide, and Nest *merges* controller- and handler-level guards, so a consumer-only route could not have opted out of `RequireMerchantGuard`. Moved to per-route, the same shape `styles.controller.ts` already uses. Regression-checked live: `GET /visits` still **200** for a merchant and **403** for a consumer; `GET /visits/me` **200** for a consumer, **403** for a merchant, **401** with no token.

# PHASE 7 — React-Native readiness _(backend work, no app edits)_

- [ ] **T46 — Auth stays token-only** (`Authorization: Bearer`). Never cookie-only — a native app has no cookie jar.
- [ ] **T47 — Refresh tokens.** Fixed 7-day JWT with no refresh today; retrofitting later changes the login response both clients depend on. [F12]
- [ ] **T48 — Public endpoints truly public** — the app browses before signup.
- [ ] **T49 — API versioning (`/v1`)** before launch.
- [ ] **T50 — Pagination** on visits/bookings (breaking change if added later).
- [ ] **T51 — CORS covers Expo web.**

# PHASE 8 — Deployment _(Vercel for both — decided 2026-08-23)_

Vercel runs the backend **serverless**, a different model from a long-running Node process. T54–T58 exist because of that and are not optional.

- [ ] **T52 — Production Postgres** (Neon/Supabase — Vercel doesn't host it). **Use the pooled connection string.**
- [ ] **T53 — Deploy backend + website**, env vars in Vercel project settings.
- [ ] **T54 — Convert all 4 cron jobs to Vercel Cron.** `@Cron()` **never fires** on serverless — this silently kills T19 and T25. Expose each as a route guarded by `CRON_SECRET`; schedule in `vercel.json`.
- [ ] **T55 — Prisma connection pooling** (PgBouncer / `?pgbouncer=true` / Accelerate). **The most common way Prisma-on-Vercel dies in production.**
- [ ] **T56 — Cache the Nest app instance** across invocations (cold-start bootstrap can exceed the timeout).
- [ ] **T57 — Re-verify the Stripe webhook raw body** under the serverless adapter — local `stripe listen` passing proves nothing about the deployed endpoint.
- [ ] **T58 — Run migrations from CI.** `Dockerfile.api` ran `migrate deploy` on boot; there's no boot step on Vercel.
- [ ] **T59 — Replace all localhost URLs/origins** with production values.
- [x] **T60 — Domain + Resend domain verification.** ✅ **DONE & VERIFIED 2026-08-24.** Pulled forward out of phase order because it blocked T6, T19, T20, T21 and T35, and because it was the direct cause of [F27].
      **Domain:** `mail.glowplusmember.com` (Resend id `abad6d98-…`, region `ap-northeast-1`). **Status: `verified`** — DKIM, SPF MX and SPF TXT all `verified` via the Resend API.
      **A subdomain, deliberately, not the root.** Resend needs its own records on whichever domain is verified; putting them on `glowplusmember.com` would collide the day the client wants real mailboxes (`contact@glowplusmember.com`) there. `mail.` leaves the root completely free. Cost: the From address is `noreply@mail.glowplusmember.com`. The root was confirmed empty first — **no MX, no TXT** — so nothing was at risk either way.
      **Records added in Hostinger** (nameservers confirmed `pixel/byte.dns-parking.com`, i.e. Hostinger's, so hPanel was the right place):
      | Type | Name | Value |
      |---|---|---|
      | TXT | `resend._domainkey.mail` | DKIM public key (218 chars — **under the 255 single-string TXT limit**, so no splitting) |
      | CNAME | `rsend.mail` | `rsend.forge.rmta.net` |
      | CNAME | `send.mail` | `send.forge.rmta.net` |
      | TXT | `_dmarc` | `v=DMARC1; p=none;` |

  **Verified independently before trusting Resend:** each record queried against `8.8.8.8`, and the DKIM value compared **byte-for-byte** (218 == 218, case-sensitive match) to rule out a truncated paste — the usual silent failure.
  **Note for anyone re-running this:** the Resend **API** describes the SPF records as `MX` + `TXT` at `rsend.mail`, while the **dashboard** issues **CNAMEs**. They cannot coexist at one name in DNS, so this looks alarming. The CNAMEs are correct — verification passed with them. Legacy wording in the API response, nothing more.
  **`EMAIL_FROM` updated** in the gitignored `.env` to `Glow+ <noreply@mail.glowplusmember.com>` (was `onboarding@resend.dev`). ⚠️ `nest start --watch` does **not** reload `.env` — the backend must be restarted, which is why T5's fix matters here.
  **[R6] is now lifted** — email is no longer capped at the Resend account owner's address. **T19/T20 can be tested against real recipients.**
  ⬜ Still open for production: `APP_URL` and links still point at localhost → **T59**; and `EMAIL_FROM` must be set as a Vercel env var → **T53**.

- [ ] **T61 — Production Stripe webhook endpoint** registered.
- [ ] **T62 — Backups, monitoring, logging.**
- [ ] **T63 — Full production smoke test.**

# PHASE 9 — Testing, CI, legal

- [ ] **T64 — CI pipeline** running tests on push.
- [ ] **T65 — Integration tests** (auth, authz, billing, webhooks, bookings, rewards) — accumulated per task, not retrofitted.
- [ ] **T66 — Privacy policy + terms** (docx requirement).
- [!] **T67 — Business registration** — _client action, not development work._

---

## Blocked / needs a decision

- [~] **Database for local dev — DEFERRED, decide at T3.** Docker isn't installed [F17]. Leaning Neon/Supabase free tier (no install, and it's the same platform as T52). Not blocking T1/T2, which need no database.
- [!] **T32 — Is M-Pesa in scope?** No code exists; it's a from-scratch build.
- [x] **T33 — Website rebuild confirmed?** ✅ **Confirmed 2026-08-24** — proceeding with rebuild-against-API. Still an unpriced scope item to flag with the client (absent from their list).
- [!] **Vercel plan** — Hobby allows only 2 cron jobs at once-daily. This project has 4 → Pro (~$20/mo), or consolidate into one dispatcher route.
- [!] **Rotate the Vercel token** pasted in Fiverr chat before using it.

## Waiting on the client

- Domain purchase (blocks T60, T61, and real email delivery)
- Vercel + Neon/Supabase account access
- Confirmation that no desktop app is expected (the docx mentions one; none was delivered)

## Fiverr chat → task mapping (all 4 sections covered)

| Client's chat item                            | Task                                  |
| --------------------------------------------- | ------------------------------------- |
| **1. Mid-test** — cancel/resume subscription  | T17                                   |
| Booking flow vs real Postgres                 | T18 (needs T13/T14 first)             |
| Trial-ending email                            | T19                                   |
| Payment-failed webhook                        | T20                                   |
| **2. Structural** — no password reset         | T21                                   |
| No admin authentication                       | T22                                   |
| No reward redemption tracking                 | T23                                   |
| No merchant staff accounts                    | T24                                   |
| Points never expire                           | T25                                   |
| **3. Security** — secrets in plaintext `.env` | T27                                   |
| No API-wide rate limiting                     | T26                                   |
| Daraja webhook / IP allowlisting              | T32 ⚠️ _no M-Pesa code exists_        |
| Production PCI/security review                | T31                                   |
| _(implied: `ENCRYPTION_KEY`)_                 | ✅ T31b — done, application-level AES-256-GCM |                       
| **4. Deployment** — backend hosting           | T53                                   |
| Real production Postgres                      | T52                                   |
| Real domain                                   | T60                                   |
| Production Stripe webhook                     | T61                                   |

Every item from the chat is tracked. The chat is a condensed version of the docx — nothing appears in it that isn't also in the doc.

## What the client's docx got wrong

Its 23-item list is **accurate and complete for the backend**. But it assumes the frontend works — only 2 of 23 items touch it ("Deploy the backend and frontend", "Make the website mobile friendly"), and line 3 asserts _"a substantial amount of functional software across the backend, frontend, website."_ [F9] and [F10] show otherwise. It also implies M-Pesa exists [T32]. Everything else in it checks out.

---

# 📣 MESSAGE FOR THE CLIENT — two claims in the doc describe things that don't exist

_Written 2026-08-24 (session 15). Both were verified by running the code and querying the database, not by reading the source. Raise both **in writing**, before delivery._

Neither of these is a criticism of the work so far — the docx reads as a reflective write-up rather than an inventory [R9], and its backend analysis has otherwise proven accurate. But both items below are stated in it **as fact**, and one of them would end up in a published legal document.

## 1. There is no M-Pesa / Daraja integration — at all

**The doc says:** _"The Daraja M-Pesa webhook currently does not have IP allowlisting. This was identified during development but remains unresolved."_ and lists _"Secure the Daraja webhook"_ as a priority.

**What we found:** there is no M-Pesa code anywhere in the delivery. Six independent checks — a full-text search across every source file (run twice, with two different tools), every `package.json`, the database schema, both `.env` files, all 55 live API routes, and all 13 mobile-app files. The only webhook that exists is `POST /billing/webhook`, which is **Stripe**. There are no Daraja credentials, no payment/transaction table, and no M-Pesa package.

**So the task as written cannot be done** — there is no webhook to add IP allowlisting to. Building it for real means Daraja OAuth, STK push, a public callback endpoint, replay protection and idempotency, a transactions model and migration, reconciliation with the rewards logic, and Safaricom sandbox **plus** production credentials (which need a registered Kenyan shortcode/paybill).

**What we need from you — one of three answers:**
- **(a)** It was never built and isn't wanted → we strike it and correct the doc. _(No cost.)_
- **(b)** It is wanted → it's a **from-scratch build and separate paid work**, not part of the current order.
- **(c)** It exists somewhere the delivery didn't include → **please send that repo or branch.** The doc says it was _"identified during development"_, which suggests the author was looking at real code.

> **Why we're flagging it rather than absorbing it:** this is the second-largest unpriced item after the website rebuild. We'd rather agree the scope now than surprise you with it later.

## 2. Phone numbers were **not** encrypted — now fixed

**The doc says, twice:**
- _"The current development environment contains JWT_SECRET and **ENCRYPTION_KEY** in a plaintext .env file."_
- _"The application collects personal information, including email addresses and phone numbers. **Although phone numbers are encrypted**, they are still personal information."_

**What we found (2026-08-24):** neither was true at the time. No `ENCRYPTION_KEY` in `.env` or `.env.example`, no encryption code anywhere in the backend, no `pgcrypto` extension in the database. We signed up through the live API with the phone number `+254712345678` and read the row straight back out of Postgres — it came back in **clear text**.

**We've since implemented it** (application-level AES-256-GCM, T31b) rather than only flagging it, because the doc's claim also feeds directly into the privacy policy — leaving it unresolved would have meant publishing a policy telling your customers their phone numbers are encrypted when they weren't. That risk is now closed: signed up again with the same test number and read it straight from Postgres — this time it came back as `v1:yHmNsR2W4Vy5o8OX:E-_rWjwHZ8rAENsLDKmb-Q:nuuL56ChI00f08Kufg`, not the number.

**What this means for you, practically:**
- A new environment variable, `ENCRYPTION_KEY`, now needs to be set wherever the API runs (alongside `JWT_SECRET`) — it's in `.env.example` with a placeholder, and the app now refuses to start without a real one, the same protection `JWT_SECRET` already had.
- Looking a customer up **by phone number still works** — we added a second, non-reversible index for that, so this didn't cost you the ability to search or enforce "one account per phone number."
- **One open decision remains**, and it's about the product, not security: the original website design asks customers for a **phone number** to pull up their points, but the backend identifies people by **email**, and the mobile app currently sends phone as optional. We need to know which one is the real login before building the customer-facing screens (T35/T36) — nothing security-related is blocked on it, but the UX is.
