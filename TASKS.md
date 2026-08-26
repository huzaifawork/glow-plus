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
| F25 | ✅ **RESOLVED 2026-08-24 by T36.** ~~**Mobile overflows horizontally** — at a 390px viewport the document is 401px wide because the `.topnav` buttons don't wrap.~~ Fixed with `flex-wrap:wrap` on `.topnav`; re-measured at **390px on all six SPA views**. Was pre-existing (measured identically on the original), and T35's Log out button had made it 460px. T39's remaining mobile work is qualitative → **T39, now closed 2026-08-25**. Note what that fix cost: wrapping removed the *horizontal* overflow and created a **vertical** one — the wrapped nav spilled out of `.topbar`'s fixed `height:52px` — which T39 found and fixed with `min-height`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Chromium, both versions, session 3                                          |
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
| F42 | ✅ **RESOLVED 2026-08-25 by T43.** ~~The last [F9] remnant in the SPA: the landing page's founding-spots counter still counts a `localStorage` array.** `Marketing.jsx`'s `FoundingSpots` reads `getMerchants()` from `data.js` and counts `foundingBadge`, so on any fresh browser it reports the full 50 spots left — forever, no matter how many salons have actually signed up. T36 rewired the salon grid beside it to `GET /merchants/public` and deliberately left this one, on the grounds that it is a marketing number and no endpoint exposes it; still true. T38 is the first task with an endpoint that knows the real count (`GET /admin/merchants` carries `foundingMember`), but that route is admin-only and this is a **public** page above the fold. The fix is a genuinely public count, or a `foundingMember` field on `/merchants/public` — → **T43**.~~ `GET /merchants/founding-spots` now serves it, counting merchant ROWS rather than badges because that is what `OnboardingService.signup` gates the offer on. |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | boot log route map                                                          |
| F43 | **18 i18n keys exist only in the `en` block, so 7 of the 8 languages fall back to English across the whole auth form.** `src/i18n/translations.js` — `label_email`, `label_password`, `auth_logout`, `auth_continue`, `auth_signup_success`, `auth_verify_banner`, `auth_toggle_to_login`/`_signup`, `auth_resend_verification`/`_sent`, `consumer_login_submit`/`_signup_submit`, `business_login_submit`/`_signup_submit`, `added`, `card`, `salon`, `unlocked`. All were added by **T35** *after* T40 was signed off, so T40 was correct when ticked and this is drift since. Separately the consumer dashboard's four tab labels (`ConsumerDashboard.jsx:577`) and the portal's `Profile`/`Team`/`Billing` (`BusinessPortal.jsx:763-770`) are hardcoded English literals, not keys at all. Select العربية and the page mirrors correctly but the login form stays in English. Belongs to **T40**, not T39 — a translation task, not a layout one | Real Chrome at 390px, en + ar, session 20 (T39) |
| F44 | **The merchant portal's founding-member banner could never render.** `BusinessPortal.jsx` picks between `pending_banner_founding` and `pending_banner_standard` on `currentMerchant.foundingBadge` — a field name only the localStorage prototype ever used. `BusinessAuth.jsx` builds `currentMerchant` from the login response, which carried no founding field under **any** name, so the test was always `undefined` and every PENDING salon was shown the standard-trial text. The salons actually owed the extra free month were the ones not told about it. Same `foundingBadge`/`foundingMember` split as [F42]. ✅ **RESOLVED 2026-08-25 by T43** — `POST /merchants/login` returns `foundingMember` (additive) and both branches were verified in a real browser | `BusinessPortal.jsx:757`, `merchant-auth.service.ts` |
| F45 | **The public directory sorts case-sensitively.** `ORDER BY businessName` under Postgres' default `C`-ish collation puts every lowercase-initial salon after every uppercase-initial one, so `glow bar downtown` lands after `Zenith Hair` — verified with real rows. Cosmetic, but a *directory* is the one place people scan alphabetically. Prisma has no column-collation attribute, so fixing it in the schema means raw SQL that `prisma migrate` will then fight. The clean fix is a case-insensitive ICU collation chosen when the production database is created — → **T52**, which picks the Postgres provider anyway. Search is unaffected (`mode: 'insensitive'` already) | `merchants.service.ts` `listPublic()` |
| F46 | **`Access-Control-Expose-Headers` set in a handler REPLACES the global CORS list, it does not append.** T43's `GET /merchants` called `res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')` so that the browser could read its total — and in doing so overwrote all nine of `EXPOSED_HEADERS`, so on that one route every rate-limit header was **sent but unreadable from JS**. Verified live: the response carried `X-RateLimit-Remaining: 119` under `Access-Control-Expose-Headers: X-Total-Count`. That is precisely the "enforced but invisible cross-origin" failure the constant's own comment says it exists to prevent. Latent, not live — nothing in the website reads those headers yet, and a **429 never reached the handler** (the throttler guard answers first), so backoff was never actually broken. ✅ **RESOLVED 2026-08-25 by T44** — `X-Total-Count` moved into `EXPOSED_HEADERS` and both per-route calls deleted; a header is only exposed on responses that send it, so listing it globally costs nothing. Found by replaying the SPA's cross-origin request with an `Origin:` header rather than a bare curl, which is why three sessions of testing this route had not shown it | `merchants.controller.ts`, `config/security.ts` |

| F60 | ✅ **RESOLVED 2026-08-26 (session 28, J3).** **The salon had no screen for redemptions.** `GET /redemptions` shipped in **T23**, role-guarded and tested, returning the salon's redemption rows enriched with the client's name and email (this file, line 387) — and **no client ever called it.** T23's only frontend was the standalone `/consumer/rewards` page, written that way because T35's auth UI did not exist yet (line 393); the merchant half of the same feature was never given a screen, and the portal built later in T37 had no tab for it. Not cosmetic: `POST /redemptions` writes a row and returns — it sends the salon nothing, and the customer's confirmation is a toast that disappears on the next render. So a customer redeemed 20% off and there was **nowhere in the product for the salon to check**; the reward was recorded and unclaimable, and the loyalty loop did not close at the counter. Same shape as [F52] and [F55]. **Fixed** — read-only **Redemptions** tab in `BusinessPortal.jsx` (date, client, reward, worth). Read-only deliberately: marking one "used at the counter" is a second state the table has no column for, and inventing one from a UI is a schema decision that belongs to the client | `redemptions.controller.ts`, `BusinessPortal.jsx` |
| F61 | ✅ **RESOLVED 2026-08-26 (session 28, J5).** **A walk-in could never become verified — ever.** `resetPassword()` changed the password and left `emailVerifiedAt` NULL, and the resend-verification button renders in **both** auth views solely off `signupNotice`, which is set only by a **successful signup** — which a walk-in cannot do, because `POST /visits` already made the account so signup answers them **409** [F56]. So a walk-in reset their password, got in, and carried the *"Verify your email to unlock everything"* banner **forever, with no control anywhere in the product able to clear it.** **Fixed** — consuming a reset token is the same proof of inbox control the verification link carries, so it now stamps `emailVerifiedAt`. Guarded as `updateMany … where emailVerifiedAt: null` so an account verified months ago keeps its **original** timestamp rather than having it rewritten by an unrelated password change. **Proved on the real walk-in account in J5.3**: `usedAt` and `emailVerifiedAt` written at the identical instant, and it reached the 200 points and two rewards it had been locked out of. 11 new specs incl. "an expired token must not verify the address as a side effect" | `password-reset.service.ts` |
| F62 | ✅ **RESOLVED 2026-08-26 (session 28, J3).** **`FREE_SERVICE` rewards rendered as "0 free".** Such a rule holds its value in a **style** (`freeServiceStyleId`) and leaves `rewardValue` at **0** — and neither `/me/rewards` nor `/redemptions/available` ever sent that id, so no client could name the service. Unlocked, the card read **`Ready — 0 free`** beside a Redeem button: a customer offered "0 free". The fix could not be frontend-only, because the id was never in the payload. **Fixed** — new `src/common/free-service.ts` resolves the name in **one** query and **none at all** when no rule is a FREE_SERVICE (the common case must not cost a round trip). Wired into `/me/rewards`, `/redemptions/available`, `GET /redemptions` **and** `GET /reward-rules` so all four agree. ⚠️ `freeServiceStyleId` is a bare `String?` with **no foreign key**, so a deleted style resolves to `null` and the clients say "a free service" rather than throwing. 8 new specs | `me.service.ts`, `redemptions.service.ts`, `reward-rules.service.ts`, `ConsumerDashboard.jsx` |
| F63 | ⚠️ **OPEN.** **Appointment times render in the BROWSER's timezone, not the salon's.** `helpers.js` `formatSlot()` and `formatDateTime()` call `toLocaleTimeString(undefined, …)`; `undefined` means the viewer's zone. On the dev machine (Asia/Karachi) the salon's **9:00 AM Toronto** slot displays as **6:00 PM**, and the last three chips of a Wednesday read `12:00 AM`/`12:15 AM`/`12:30 AM` — **times that appear to fall on the day after the one the customer selected.** [F57] fixed the *derivation* side (`SALON_TIMEZONE`, verified: 09:00 Toronto → 13:00Z); the *display* side was never fixed, so the customer and the salon end up holding **different times for the same appointment**. A physical appointment has exactly one meaningful clock — the salon's. **Calibrated severity:** Toronto salons mostly have Toronto customers, so browser zone = salon zone and it usually comes out right; it bites travellers, wrong device clocks, and anyone browsing from another zone. Real, worth fixing, not urgent. **The fix needs a backend piece**: `Merchant` has **no timezone column** and `SALON_TIMEZONE` is server-side, so the API must expose the zone — cleanest as an **additive field on the public merchant payload**, which the Book tab already loads. ⚠️ Do **NOT** change the availability endpoint's **bare-array** shape; T43/T44/T50 protect it for the RN app | `helpers.js`, `ConsumerDashboard.jsx` |
| F64 | ✅ **RESOLVED 2026-08-26 (session 28, J4).** **`POST /bookings` never consulted `BusinessHours` at all.** `create()` validated the merchant [F47], the style, the past and a clashing booking — and nothing else. `isSlotStillAvailable()` only looks for a conflicting row, so **opening hours were enforced by nothing but the slot grid the browser happened to render, and a grid the client draws is not a constraint the server may rely on.** Proved live, all **accepted with 201**: a booking on the salon's **closed Sunday**; one at **7:00 AM, two hours before opening**; one starting **4:30 PM for a 90-minute service**, running an hour past the 17:00 close; and one at **9:07 AM, off the 15-minute grid** (which also makes every later slot calculation ragged). Real outcome: a customer books 3 AM Sunday, is confirmed, and turns up to a locked door. **This is the mirror of the check already in that same function** — T48/[F47] re-validated merchant visibility there precisely *"because a client can POST straight to this one"*, and hours were never given the same treatment. **Fixed** — `AvailabilityService.assertBookable()`, with distinct messages for closed / before opening / past closing / off-grid. Grid alignment is expressed as **membership in the slots the generator itself would offer**, not a re-derived modulo, so the write path cannot drift from the read path. New `salonDateFor()` in `salon-time.ts` resolves which **salon** day governs an instant — asking the `Date` directly would answer in the process's zone, the exact defect [F57] closed on the read path. ⚠️ **The conflict check must run FIRST**: `assertBookable` also refuses taken slots, so ordering it first made *"That time slot was just booked by someone else"* unreachable and told someone who lost a race to "pick one of the offered times" — which is what they did. **12/12 probes correct, happy path still 201** | `bookings.service.ts`, `availability.service.ts`, `salon-time.ts` |
| F65 | ✅ **RESOLVED 2026-08-26 (session 28, J5).** **A spent or expired reset link still rendered the "Choose a new password" form.** `ResetPassword.jsx` checked only that a `token` query param was **present**, never that it meant anything, so a dead link produced the same confident form as a fresh one and the refusal arrived **only after** the customer had typed a password and pressed the button. Found by clicking a used link a second time in J5.2 — the form came back, and the natural reading was "the link still works". The wasted keystrokes are the small half; the real harm is that someone re-opening an old link sets what they believe is their new password, gets a generic error, and is locked out with no idea why the password they just chose does not work. **Fixed** — new `GET /v1/auth/reset-password/:token`, mirroring `GET /staff/invites/:token` which has had this from birth: same throttle tier, and the **same three rejections in the same order with the same wording** as `resetPassword()`, so the page and the POST cannot tell a customer two different stories about one token (a spec asserts that equality directly). The page validates on mount and shows "This link has expired" with a **Request a new link** button, and names the account being reset. ⚠️ A **network failure is deliberately not** treated as a dead token — that would send someone with a perfectly good link off to request another | `password-reset.service.ts`, `auth.controller.ts`, `ResetPassword.jsx` |
| F66 | ✅ **RESOLVED 2026-08-26 (session 28, J5).** **Every standalone page was a cul-de-sac.** The reset, forgot-password, verify-email and accept-invite pages are separate HTML entry points, so nothing on them belonged to the SPA's nav — and **not one had a link back into the site.** The only exit was the browser's Back button. The worst was the **success** card: a customer finishes setting a new password, the whole point of the flow, and lands on a screen with **nowhere to sign in**. Verify-email said *"You can close this tab and continue"*, which is an instruction rather than a way out — useless to someone who opened the link from their phone's mail app and has no other tab. Same defect [F49] fixed on the billing page in session 27 (*"there was no way back from the billing page except the browser"*), in **seven** more places. **Raised by the user during J5, not by a probe** — the journeys check what the server does, and this was only visible to someone actually trying to get somewhere. **Fixed** — the SPA now honours **`/?view=view-consumer-auth`** (and the business equivalent), read in `AppContext`. ⚠️ **Allow-listed, not trusted**: the value comes off the URL, so only the two **auth** views are linkable — a link must never be able to open the portal or the dashboard, which is what `VIEW_REQUIRES` guards on the restore path | `AppContext.jsx`, `ResetPassword.jsx`, `ForgotPassword.jsx`, `VerifyEmail.jsx`, `AcceptInvitePage.jsx` |
| F67 | ✅ **RESOLVED 2026-08-26 (session 28, J8).** **T39's tap-target fix was inert on half its targets.** `min-height` does **nothing** on a non-replaced **inline** element, and half of `.link-btn` are `<a>`, not `<button>`. A `<button>` is inline-block by default so T39's `.link-btn{min-height:44px}` bit; **every anchor silently ignored it** and stayed 16px tall. Measured in real Chrome at 390px: *"Forgot your password?"* **142×16** and *"Go to sign in"* **82×20** — both under **WCAG 2.2 AA 2.5.8**'s 24px floor, and on the two links a customer locked out of their account most needs to hit. [F56]'s forgot-password link was added in session 27, **after** T39 was signed off, so it was never measured. **Fixed** with `display:inline-block`, which is what makes the existing `min-height` apply — the declaration was inert without it. The standalone pages needed **their own copy**: they deliberately do not load the SPA's `global.css` (see the header note in `password-reset.css`), so `.link-btn` was not styled there at all and [F66]'s new links rendered as bare 20px anchors. Re-swept after the fix: **every clickable target clears 32px** | `styles/global.css`, `pages/password-reset/password-reset.css`, `pages/verify-email/verify-email.css` |
| F68 | ⚠️ **OPEN — belongs with [F43] under T40.** **The seven standalone pages are not internationalised at all.** `/forgot-password`, `/reset-password`, `/verify-email`, `/consumer/rewards`, `/business/staff`, `/business/billing` and `/admin` keep `html lang="en"` in **all eight languages** and carry **no `dir` attribute at all** — proved across 176 real-Chrome combinations in J8. So an Arabic-speaking customer who clicks a password-reset link **from their email** lands on an English, **left-to-right** page; the SPA mirrors correctly and these do not. They are separate Vite entry points that never used `I18nProvider`, because T17/T18/T21–T24 built them before T35's auth UI existed. Two are effectively superseded (`/consumer/rewards`, `/admin` — see the two-admin-surfaces note), but **reset, verify and staff are live and are reached from real transactional emails**, which is exactly where a language preference cannot be carried. Same family as [F43] — a **translation** task, not a layout one | `pages/*/main.jsx`, `i18n/I18nContext.jsx` |

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
- [x] **T39 — Mobile-friendly** across all views (docx explicitly asks for this). ✅ **DONE & VERIFIED 2026-08-25 (session 20).** CSS only — one file, `src/styles/global.css`, 39 lines added. No JSX, no backend, no API.

  **[F25] stayed closed, and the empty-state caveat stayed closed.** All 18 surfaces measured at a 390px viewport report `scrollWidth` **390px**, in English and again in Arabic: landing, consumer auth, consumer dashboard + its 4 tabs, business auth, portal + its 7 tabs, admin auth, admin console — all signed in against the real API with real rows. Nothing scrolls sideways.

  **But the qualitative pass found four real defects that `scrollWidth` structurally cannot see, and one of them was a side effect of [F25]'s own fix.**

  1. **`.topbar` had a fixed `height:52px` while its nav had grown to 107px.** T36 gave `.topnav` `flex-wrap:wrap` to close [F25]'s *horizontal* overflow — correct, but it converted the overflow into a **vertical** one nobody measured. At 390px the wrapped nav spilled ~28px above the bar (its first row lying across the promo bar) and ~28px below it (the "For salons" / "Log out" row floating over the page heading). Fixed with `min-height:52px` + `padding:6px 22px`. Measured: bar 52px → **103px**, nav fully inside it (`navTop` 60.8 > `barTop` 54.8, `navBottom` 150.8 < `barBottom` 157.8), page content now starting exactly at the bar's bottom edge. Identical signed-out and signed-in. **This is why a `scrollWidth` number was never going to finish this task** — it only ever looks sideways.
  2. **The language switcher rendered 302px wide** — a full-width form field lying across the promo bar, taking a whole nav row to itself. It is a `<select>`, so it inherited `width:100%` from the global form-field rule; `.navbtn` overrides that rule's colours, radius and font but never declares a width. Fixed with `.topnav select{width:auto;flex:0 0 auto;}` → **104px**. **Wrong at every width, not just mobile** — the desktop header had the same full-width select stacked above the nav buttons.
  3. **Tap targets.** `.link-btn` (the auth-flow switches — "New here? Create an account", "Go to business login") measured **16px tall**, which fails **WCAG 2.2 AA 2.5.8** outright — its floor is 24px. `.toggle` 31px, `.navbtn` 33–35px, `.brand` 28px, all under the 44px Apple's HIG and WCAG 2.5.5 AAA ask for. Fixed with `min-height:44px` inside the `≤860px` query only — a pointer has no such problem and growing the desktop chrome would be a design change, not a fix.
  4. **`.ptab` drew the browser-default `2px outset black` border on three sides**, because the rule only ever set `border-bottom`. On a phone the seven portal tabs wrap into a grid and the strip read as a broken table rather than as tabs. Fixed with `border:none` first. Also inherited and wrong at every width. Removing it dropped the tabs to 43px, so they and the narrow ones ("Book", 42px wide) get `min-height/min-width:44px` in the same mobile query.

  **Findings 2 and 4 are inherited from the prototype, not migration regressions** — verified by reading the original `Glow-Plus-Website .html`: same markup, same `select{width:100%}` rule (line 164), same `.ptab` rule (line 212). Its `.topnav` had **no** `flex-wrap`, which is exactly why finding 1 could not exist before T36.

  **Arabic RTL at 390px — the one thing T39 flagged that nobody had ever checked — works.** All 18 surfaces report `dir=rtl` with correct mirroring (stat row, form alignment, list cards, tab strip) and **zero** horizontal overflow. The defects found there were the same LTR ones, not RTL-specific.

  **Tested — real Chrome (`puppeteer-core`, scratchpad-only), real dev servers, real Postgres, signed in as all three roles.** Before → after at 390px: `< 24px` WCAG failures **2 → 0**; sub-44px targets **6–11 per surface → 0**; horizontal overflow **0 → 0** (already clean); nav containment **broken → contained**. Desktop re-measured at 1280px to prove nothing regressed: bar still exactly **52px**, nav now fully inside it (was spilling 72px out of 52px), select 453.9px → 104px, `.ptab` border `0px none`. `npm run build` clean, `tsc --noEmit` clean, suite **261 passing** (unchanged — this task changed no TypeScript). DB back at exact seed state (1 user, 1 merchant, 3 styles, 5 visits, 2 rules, 3 bookings, 0 redemptions, 1 admin); nothing was created or deleted.

  **One trade-off, recorded so it can be revisited knowingly:** the mobile header is now **103px** of a 844px viewport, permanently, because it is `position:sticky` and seven controls at 44px cannot fit one row at 390px. Containing it was the fix; making it *short* would mean collapsing the nav into a hamburger, which is a design change beyond "mobile-friendly" and would be the first departure from the prototype's shell. Dropping `flex-wrap` from `.topbar` itself (keeping it only on `.topnav`) already cut this from 153px to 103px by keeping the brand on the nav's first row.

  **T39b — the nav collapses behind a hamburger below 700px (2026-08-25, same session).** T39 as first delivered was *correct but not good*: containment cost height, so the header became **103px of a 844px viewport, sticky**, with the rows breaking wherever the width ran out — it read as a bug rather than as a design. On review the user asked for the mobile side to be made properly good, so the trade-off recorded above was taken rather than left standing.

  Below **700px** the nav is now a drop panel behind a toggle and the bar returns to **57px**. 700px, not the 860px the rest of the mobile query uses, is deliberate: between the two the seven controls still fit one row at a 44px target, and hiding a nav that fits would be a regression. **Above 700px nothing changed at all** — re-measured at 1280px, bar still exactly 52px, nav inside it, switcher 104px, `.ptab` border `0px none`.

  `TopBar.jsx` gained the toggle and `open` state. The panel closes on **selection**, on **Escape**, and on a **click outside** — all three matter: without the first, tapping "Home" leaves the panel covering the page it just navigated to; without the last, the only exit from an accidentally-opened menu is the toggle itself. `aria-expanded` / `aria-controls` / `aria-label` are wired, and **`nav_menu` was added to all 8 language blocks** — a string this change introduced, so translating it now is doing the new work properly rather than paying down [F43].

  Two things the review caught that measurement had not: plain `.navbtn` is borderless in the prototype (only `.ghost` outlines), which reads fine inline but made "My rewards" look like a gap between two pills when stacked — every panel row gets the outline now; and the switcher's centred label left its caret stranded at the far edge, because a `<select>` paints the caret against the inline-end edge. `text-align:start` fixes it and flips correctly under `dir=rtl` — and it needs the selector `select.navbtn`, not bare `select`, since the switcher carries `.navbtn` and the centring rule would otherwise outrank it. Its `padding` moved from an inline style into the stylesheet so the panel can widen it without fighting inline specificity.

  **Tested:** 8/8 behavioural checks in real Chrome at 390px — starts closed, toggle opens, toggle closes, Escape closes, click-outside closes, selecting an item closes the panel *and* navigates, bar 103px → **57px**. Toggle measures 44×44 with `aria-label` "Menu". Geometry swept at **390, 430, 600, 700, 760, 900 and 1280px**: the toggle appears at ≤700 and disappears above it, the panel always renders below the bar, and `scrollWidth` equals the viewport at every width. Both full audits re-run afterwards — 18 surfaces each in English and Arabic, **0** WCAG failures, **0** sub-44px targets, **0** overflow, all 18 Arabic surfaces `dir=rtl`. `npm run build` clean, **261 passing**, DB untouched.

  **Verify independently:** open `http://localhost:3000/` in Chrome, DevTools → device toolbar → iPhone 12 Pro (390px). Check the header does not overlap the black promo bar above it or the page heading below it, in signed-out and signed-in states; switch the language dropdown to العربية and confirm the whole page mirrors with no sideways scroll; then sign in as a salon and confirm the seven portal tabs read as tabs, not boxes.

  **Noted, not fixed — new finding [F43], and it belongs to T40, not here.** With Arabic selected, the entire auth form stays in English. **18 keys exist only in the `en` block** of `src/i18n/translations.js` — `label_email`, `label_password`, `auth_logout`, `auth_continue`, `auth_signup_success`, `auth_verify_banner`, `auth_toggle_to_login`/`_signup`, `auth_resend_verification`/`_sent`, `consumer_login_submit`/`_signup_submit`, `business_login_submit`/`_signup_submit`, `added`, `card`, `salon`, `unlocked` — so **all 7 other languages fall back to English** on the strings T35 added after T40 was signed off. Separately, the consumer dashboard's four tab labels and the portal's `Profile`/`Team`/`Billing` are hardcoded English string literals, not keys at all (`ConsumerDashboard.jsx:577`, `BusinessPortal.jsx:763-770`). T40 is ticked and was correct when it was ticked; this is drift since. Fixing it is a translation task, not a layout one, and folding it into T39 would have mixed two concerns in one commit.
- [x] **T40 — Preserve the i18n — it's 8 languages, not 3.** ✅ **DONE & VERIFIED 2026-08-23.** `I18N` + `LANG_NAMES` extracted verbatim with `sed` (source lines 627, 630–1352) into `src/i18n/translations.js`; all 8 language blocks confirmed present. Browser-verified: switcher lists 8, Arabic flips `document.documentElement.dir` to `rtl` and translates, French returns it to `ltr`. `en, es, fr, de, pt, zh, ja, ar` — including **Arabic with full RTL** (`document.documentElement.dir` flips). All translation strings already exist in the prototype and are directly reusable. This is a genuine asset; don't lose it in the rebuild.
- [x] **T41 — Keep `verify-email` + `billing-result` pages working.** ✅ **DONE & VERIFIED 2026-08-23.** Both ported to React as **separate Vite entry points** (their CSS targets bare `body`/`.card`/`h1`/`p` and would collide with the main site's stylesheet in a single SPA). Real API call to `POST /auth/verify-email` preserved.
      **Routing:** Express's two routes are now a `vite.config.js` plugin (dev/preview) + `vercel.json` rewrites (prod): `/verify-email` → `verify-email.html`, `/business/billing` → `billing-result.html`. ⚠️ **Any other host needs the same two rewrites** — the backend has these URLs baked in (`APP_URL`, `billing.service.ts` `success_url`/`cancel_url`).
      **Evidence:** verify-email missing-token error, bogus-token → real 'Verification failed' from the running backend · billing success (+ session id echoed, webhook note), canceled, and direct-visit states all correct.

# PHASE 6 — Endpoints the clients need but that don't exist

Build to the shapes the RN app already expects (`glow-plus-mobile app/src/api/client.js`) so Order 2 needs no backend changes.

- [x] **T42 — `GET /me/rewards`** — match `client.js:44-91` field-for-field. ✅ **DONE & VERIFIED 2026-08-24 (session 17)**, pulled forward because T36 could not be built without it. `src/modules/me/`, consumer-guarded from the first commit.
      Every field the RN app's `DEMO_REWARDS` names is produced under the same name: `totalPoints`, and per merchant `merchantId`, `businessName`, `points`, `rewards[{ ruleId, name, triggerType, triggerValue, progress, remaining, rewardType, rewardValue }]`, `recentVisits[{ id, styleName, styleType, pointsEarned, visitDate }]`. Three fields are **added** on top — `oneTime` and `eligible` on a reward, `expired` on a visit — which a client that ignores them cannot notice, and which save the website one call to `/redemptions/available` per salon purely to decide whether a Redeem button is live.
      **Progress maths is deliberately identical to `RedemptionsService.progressFor`** — same `expired:false` filter (T25), same `styleScopeId` narrowing, same `progress % triggerValue`, same oneTime/repeatable rule. If they ever disagreed, a customer would see a Redeem button that `POST /redemptions` then refuses. Proved against the live API rather than asserted: `/me/rewards` and `/redemptions/available?merchantId=` return identical `progress`/`remaining`/`eligible` triples for the seeded consumer. 12 unit specs. Verified live: consumer **200**, merchant token **403**, no token **401**.
- [x] **T43 — `GET /merchants`** — public salon directory. ✅ **DONE & VERIFIED 2026-08-25 (session 21).**
      **The route moved, and that was the point.** T18's stopgap lived at `GET /merchants/public`; the React Native app calls **`GET /merchants`** (`client.js:152`, `fetchSalons`). Leaving the stopgap where it was would have meant Order 2 could not talk to this backend without a change on one side or the other — the exact rework Phase 7 exists to prevent. `/merchants/public` is **gone**, not aliased: nothing is deployed yet (Phase 8 hasn't run), the only callers were in this repo, and two paths serving the same list is how you get two shapes that drift. Verified after the move: `GET /merchants/public` now **401**s, `GET /merchants/me` still **401**s without a token (the AuthMiddleware exclusion is the exact path `merchants`, deliberately not `merchants/(.*)`).
      **The body stays a bare array even though it now paginates.** `BookScreen.js:29` does `setSalons(await fetchSalons())` and maps the result, so an `{ items, total }` envelope would break Order 2 on the day it ships. The filtered total rides on **`X-Total-Count`**, with `Access-Control-Expose-Headers` set beside it — without that header the browser reads `null` even though the value is on the wire. Confirmed by reading it from JS in a real page: `"6"`.
      **Added on top of `{id, businessName}`, all additive:** `foundingMember`, `styleCount`, `styleTypes[]`. The last two kill an N+1 — T36's salon grid called `GET /styles/public/:id` **once per salon** purely to render "3 styles on the menu" and the tag row, so a 40-salon directory cost 41 round trips from the landing page above the fold. Measured with 6 ACTIVE salons live: **one** `/styles/public/*` call on the landing page, and it belongs to the consumer dashboard's style picker, not the grid — the count no longer scales with the directory. Two queries serve the page, scoped to the ids **on that page** (`groupBy` returns counts but not the distinct types; an `include` ships every style column for the whole page).
      **`?q=` / `?limit=` / `?offset=`, bound as a DTO not loose `@Query` params** [F38]. Verified live against real rows: `q=glow` and `q=GLOW` both match `Glow Salon (Seed)` **and** `glow bar downtown`; `q=Suspended` returns `[]` because the ACTIVE filter wins over the match; a blank or whitespace-only `q` is treated as **no filter**, not `contains: ''`; `limit=abc` / `limit=0` / `limit=1000000` / `offset=-1` are **400**, not 500; `?status=SUSPENDED` is stripped by `whitelist`. `X-Total-Count` describes the **filtered** directory — `6` unpaged, still `6` at `limit=2`, and `2` for `q=glow&limit=1` — because a paged search that reports the platform total gives the caller a number they can never page to.
      **Leak check:** the select is an explicit three-field allow-list and the response was grepped for `passwordHash`, `stripeCustomerId`, `email` and `status` — clean. This route is unauthenticated, so an accidental `include` here publishes every salon's bcrypt hash to the open internet [F31]; there is a test asserting the `select` itself, not just the fixture that comes back.
      **[F42] closed — the last `localStorage` read in the SPA is gone.** The landing page's founding counter asked `data.js` how many badges this browser had invented, so a fresh browser announced all 50 spots free forever. It now reads `GET /merchants/founding-spots` → `{ cap, taken, left }`. It counts **merchant rows, not badges, and not only ACTIVE ones**, because that is what `OnboardingService.signup` gates on (`merchant.count() < FOUNDING_MEMBER_CAP`) — a PENDING salon has already taken a spot, and a marketing page must not advertise one the signup route is about to refuse. The cap comes from the server too, via a new shared `founding.ts`, so the two cannot drift. Browser-verified at 1280px and 390px: the counter moved from a hardcoded 50 to **"42 of 50 founding badges left"** with 8 merchant rows present, and back to 49 once the test rows were deleted. With the API unreachable it holds its "Checking spots left…" placeholder rather than claiming the offer is either open or gone.
      **New finding [F44], found while closing [F42] and fixed here** — the portal's founding-member banner had never once rendered. See the findings table; both branches were then driven in a real browser by flipping `foundingMember` in the database.
      **Also cleaned up, as `data.js` itself asked:** with the counter migrated, that file's last non-language reader was gone, so the dead prototype getters/setters went with it and it is now the language preference and nothing else. `FOUNDING_BADGE_CAP` in `helpers.js` went too — the cap is the server's now.
      **Known and deliberately not fixed here: [F45]**, case-sensitive alphabetical ordering. It needs a collation decision that belongs with T52.
      **Tests: 19 new specs** (`merchants.service.spec.ts`), suite **261 → 280, all passing.** They pin the three things that fail differently: the RN contract (asserted on the *controller*, since the header-setting handler is exactly where a `passthrough: false` slip would swallow the body), the ACTIVE-only rule (asserted on the `where` Prisma is handed, because a fixture can be right while the query is not), and the founding count's agreement with signup — including the boundary row where the badge stops being earned.
      ⚠️ **`npx ts-node` inside the backend root emits a `.js` + `.js.map` beside the `.ts`, and `npm test` then OOMs** — jest's `moduleFileExtensions` includes `js` and its transform matches `^.+.(t|j)s$`, so ts-jest tries to compile the emitted file and follows its sourcemap. It presents as `FATAL ERROR: Zone Allocation failed`, which looks nothing like "you left a build artifact lying around". Delete the artifact, not the test config.
- [x] **T44 — `GET /styles/public/:merchantId`** — a salon's public menu. ✅ **DONE & VERIFIED 2026-08-25 (session 22).**
      **The path stays where it is, and that is the decision, not an omission.** T43 had to *move* the directory because the RN app calls `/merchants` while the stopgap sat at `/merchants/public`; here `client.js:157` (`fetchSalonStyles`) already calls this exact path, so the Order 2 contract is satisfied in place. Moving it for symmetry with the directory would have been a breaking change to an app we are not allowed to edit, bought with nothing.
      **The five fields were already right and are now pinned.** `{ id, name, type, pointsPerVisit, durationMinutes }` matches the RN app's `DEMO_STYLES` (`client.js:131-137`) field-for-field, and `BookScreen.js` renders `name · durationMinutes` and books on `id`. Body stays a **bare array** for the same reason T43's does — `setStyleList(await fetchSalonStyles(...))` then `.map()`. The unpaged total rides on **`X-Total-Count`**.
      **Validated params, which is what the ticket actually owed [F38].** `:merchantId` is bound as a **DTO**, not a bare `@Param('merchantId')` string — before this a 5,000-character id went into `merchant.findUnique()` on an **unauthenticated** route and only came back 404 after a database round trip; it is now **400** in the pipe. Deliberately a length bound (`MAX_ID`) and **not a cuid regex**: pinning the id *format* would make a future id scheme fail as a validation error on a public route rather than as a clean 404. `?limit=`/`?offset=` bound the same way — verified live: `limit=abc` / `limit=0` / `limit=1000000` / `offset=-1` are all **400**, `?active=false` is stripped by `whitelist` (it does **not** reach the query and un-hide retired styles), `offset=99` is `[]` at **200**.
      **`X-Total-Count` is the filtered total, and the two visibility rules were driven against real rows.** Deactivating `French Tip Gel` through the merchant API dropped the menu to 2 **and** the header to `2` **and** the directory card to `styleCount: 2, styleTypes: ['HAIR','SPA']` — the agreement that matters, since T43 counts `active: true` and a different rule here would make a card advertise a style its own menu cannot show. Merchant status was flipped in Postgres through all four values: `SUSPENDED`/`PENDING`/`CANCELLED` → **404**, `ACTIVE` → **200**. 404 rather than `[]` on purpose — "no services yet" and "not open to customers" must not look identical to the caller. A live salon with an empty menu still gets `[]`, not a 404.
      **Leak check:** the select is an explicit five-field allow-list (`STYLE_PUBLIC_SELECT`), and the live response was grepped for `merchantId`, `active` and `createdAt` — clean. Style holds nothing secret *today*, which is exactly the state in which an `include` gets added to an internet-facing route without anyone noticing [F31]; there is a test asserting the `select` itself, not just the fixture.
      **New finding [F46], found by replicating the browser's cross-origin request, and fixed here — it is T43's bug, not this route's.** `res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')` **replaces**; it does not append. `GET /merchants` was therefore answering with that one name and **silently hiding every rate-limit header from the browser** while still sending them — `X-RateLimit-Remaining: 119` on the wire, unreadable from JS. "Enforced but unreadable" is the precise failure `EXPOSED_HEADERS` was written to prevent (see the note above it in `config/security.ts`). Copying T43's line into T44 would have doubled it, so the exposure moved to the global list and both per-route calls are gone. Verified live on both routes: the full rate-limit list **and** `X-Total-Count` are now readable together. Latent rather than live — nothing in the website reads those headers yet, and the 429 path was never affected because the throttler guard answers before any handler runs.
      **Tests: 17 new specs** (`styles.service.spec.ts`, 16 + 1 in `security.spec.ts`), suite **280 → 297, all passing.** Three mutations were run to prove they bite rather than merely pass: dropping `active: true` from the `where` fails 2, returning `{ items, total }` instead of the array fails 1, and widening the select by one field fails 1. The two controller specs now assert `setHeader` is called **exactly once**, which is what would have caught [F46].
      **Deliberately not built:** no `?q=` (a menu is short enough to scan and neither client has a search box for it) and no `?type=` filter (no caller asks). The website's `listPublicStyles` was left untouched — the default page of 100 is far above any real salon menu, so nothing there changes.
- [x] **T45 — `GET /visits/me`** — consumer visit history. ✅ **DONE & VERIFIED 2026-08-24 (session 17)**, pulled forward with T42. Newest first, flattened to `{ id, merchantId, businessName, styleId, styleName, styleType, pointsEarned, visitDate, expired, expiredAt }`.
      **Selected explicitly rather than `include`d** — an `include: { merchant: true }` here would have shipped the salon's `passwordHash` and `stripeCustomerId` to every customer, which is exactly [F31]. Expired visits are returned on purpose: T25 means a visit stops *counting*, never that it vanishes from history.
      **This forced a guard restructure on `VisitsController`.** Its guards were controller-wide, and Nest *merges* controller- and handler-level guards, so a consumer-only route could not have opted out of `RequireMerchantGuard`. Moved to per-route, the same shape `styles.controller.ts` already uses. Regression-checked live: `GET /visits` still **200** for a merchant and **403** for a consumer; `GET /visits/me` **200** for a consumer, **403** for a merchant, **401** with no token.

### Findings from T48 (2026-08-25)

| # | Finding |
|---|---|
| **F47** | ✅ **RESOLVED 2026-08-25 by T48.** ~~The public browse-and-book path ignored merchant status.~~ `GET /business-hours/:merchantId` (200), `GET /bookings/availability` (200) and **`POST /bookings` (201, row written)** all served a SUSPENDED / PENDING / CANCELLED salon, while `GET /styles/public/:merchantId` correctly 404'd — so a salon suspended for non-payment kept taking appointments. One shared rule now, `common/merchant-visibility.ts`, applied first in all four. Proved by disabling it and watching a booking row appear for a suspended merchant. |
| **F48** | **A stray `.ts` in the backend ROOT silently breaks `nest start --watch`.** `rootDir` is `./src`, so a sibling file fails the build with TS6059 and the watcher keeps serving the **last good build** — an edit looks like it did nothing, and a mutation test looks like it passed. Same root cause as [F23] (which is why `jest.setup.ts` and `prisma/` are in `exclude`), and a sibling of the stray-`.js`-OOMs-jest trap from T43. Put throwaway scripts in `prisma/`. |

# PHASE 7 — React-Native readiness _(backend work, no app edits)_

- [x] **T46 — Auth stays token-only** (`Authorization: Bearer`). Never cookie-only — a native app has no cookie jar. ✅ **DONE & VERIFIED 2026-08-25 (session 23).**
      **This was a verification task that found a real defect, so it is not a no-op tick.** The API was already token-only by construction — no `cookie-parser`, no `express-session`, no `passport`, `credentials: false` in the CORS config since T28, and exactly **one** place in the whole backend parses a credential (`auth.middleware.ts:37`). All four login endpoints (`/auth/login`, `/merchants/login`, `/admin/login`, `/staff/login`) return `{ token, … }` in the **body** and set no cookie, which is the shape `client.js:99` (`await saveToken(result.token)`) already reads.
      **The defect: the scheme was matched case-SENSITIVELY.** `header.startsWith('Bearer ')` 401'd `bearer` and `BEARER`, and **RFC 7235 §2.1 makes the authentication scheme name case-insensitive** — so a spec-compliant client, or any intermediary that normalises the header, was refused by a backend that Order 2 is **not allowed to change from the app side**. That is the precise class of rework Phase 7 exists to prevent, which is why it was fixed here rather than noted. Now `/^Bearer +(.+)$/i`, which also tolerates the extra spacing a hand-built header picks up. It widens nothing — the token itself is still `jwt.verify`'d, and every negative case below still fails.
      **Verified by replaying the header the way a client might actually send it, not by reading the code** — that is the only reason it was found; the code reads correctly right up until you try `bearer`.
      **Live: 43/43 checks against the running API and real Postgres**, across four sections.
      • **A — every login returns the token in the body and sets no cookie.** All four endpoints, including `POST /staff/login`, exercised with a real staff account (invite row written directly with a known raw token, because `POST /staff/invite` only ever emails it; the **acceptance and the login both went through the real HTTP endpoints**). Rows deleted afterwards — DB is back at exact seed state.
      • **B — a cookie is not accepted as a credential.** A **valid** consumer token presented as `Cookie: token=` / `jwt=` / `session=` / `access_token=` / `Authorization=` / `connect.sid=` is **401** every time, as is a valid merchant token on `GET /merchants/me`. The token is genuinely good in each case, so these prove the channel is closed, not that the token was bad.
      • **C — Bearer works with no cookie jar involved**, on all five role-scoped routes: `/bookings/me`, `/me/rewards`, `/merchants/me`, `/staff/me`, `/admin/merchants`.
      • **D — no second credential channel exists.** `?token=`, `?access_token=`, a bare token with no scheme, `Basic`, `Token`, and `X-Auth-Token` are all **401**. A second channel is both a bypass and a second contract to keep in sync; there is deliberately one way in.
      • **E — CORS advertises no credential mode.** No `Access-Control-Allow-Credentials` on the preflight or on the actual request, while `authorization` **is** in `Access-Control-Allow-Headers` — the pairing that matters. • **F — no response anywhere in the run carried `Set-Cookie`**, checked across the four logins and five more routes.
      **Browser: 12/12 in real Chrome**, signing in on the SPA for real rather than curling. Every API request the page made was inspected: the login carried no `Cookie` header, **every** authenticated follow-up used `Bearer`, no request sent a cookie, no response set one, and `document.cookie` is **empty** after signing in. The token is held by the client in `localStorage` (`glowplus:token:consumer`).
      **One result was better than expected and is worth recording**: a `fetch(..., { credentials: 'include' })` from the signed-in page — the cookie mode — is **blocked by the browser at the CORS layer entirely** ("Failed to fetch"), not merely answered 401, because the API never sends `Access-Control-Allow-Credentials: true`. The response never becomes readable. That is what `credentials: false` actually buys, and it had never been observed from a browser before. The same request with no credential at all is a plain **401**, and with the `Bearer` header **200**.
      **Tests: 26 new specs** (`auth.middleware.spec.ts` — the middleware had none), suite **297 → 323, all passing.** Every negative case is written with a **valid** token, so a failure means the credential channel widened rather than that the fixture rotted. **Two mutations were run to prove they bite:** restoring the case-sensitive `startsWith` fails 3, and teaching the middleware to also read a `token` cookie fails 1. There is also an assertion that the middleware never calls `res.cookie()`, so "it issues no cookie" is a test and not a comment.
- [x] **T47 — Refresh tokens.** ✅ **DONE & VERIFIED 2026-08-25 (session 23).** [F12] closed. Backend + website, both halves, tested against real Postgres and a real browser.
      **The access token went from 7 days to 15 minutes, and that is the task, not a detail of it.** The old shape was the worst of both: it could not be revoked (nothing consults a store on the way in), so a leaked token was good for a week — and the user was *still* logged out abruptly at the end of it. There is now a 15-minute access token and a 30-day refresh token, and the refresh token is the half the server can actually end.
      **Nothing about the login response's existing shape changed**, which is the reason this had to land before deployment rather than after. `token` keeps its name and its position; `refreshToken` and `expiresIn` sit beside it, and the per-role blocks (`user`, `merchant`, `admin`, `staff`) are untouched. `client.js:99` does `await saveToken(result.token)` and reads nothing else, so **Order 2 keeps working as-is** — adding refresh to the RN app is app-side work, not backend rework. All four login paths mint a session: `/auth/login`, `/merchants/login`, `/admin/login`, `/staff/login`.
      **New: `POST /auth/refresh` and `POST /auth/logout`.** Both unauthenticated, and they must be — refresh is called exactly when the access token has expired, so requiring one would be circular. The refresh token in the body **is** the credential, bound as a DTO rather than read loose off `@Body()` for the same reason T44 bound its route param [F38]: these are public routes, and an unbounded string reaches a DB lookup. Verified live: an empty body is **400**, a number is **400**, a 5,000-character string is **400 in the pipe** rather than after a query.
      **Four properties, each with a test that fails if it is removed:**
      1. **Hashed at rest.** The row holds the SHA-256; the client holds the raw value. Proved against the DB, not asserted: a `findFirst` on the raw value returns **null**, and the row is found under its hash. Same treatment as `EmailVerification` and `PasswordReset` — a dump of this table must not be a set of working sessions.
      2. **Single-use, with rotation.** Every refresh marks the presented row `usedAt` and mints a replacement in the same `familyId`. That is what makes a replay *detectable* at all.
      3. **A replay revokes the whole family**, not just the row presented (OAuth 2.0 Security BCP §4.14.2). Driven end to end: refresh twice, then replay the first token — the token the *legitimate* holder was using stops working too, and every row in the family shows `revokedAt` in Postgres. **Logging the real user out is the intended outcome**, not collateral; the server cannot tell the thief from the victim, and the alternative is leaving the thief a live session. A *different* session of the same account is deliberately untouched — the family is the session, not the account.
      4. **Claims are re-derived from the account on every refresh, never replayed out of the token.** The row stores `accountId`/`accountType`, not `role`/`merchantId`. **This is the one that earns its place:** a staff member was created as OWNER, logged in (`role: merchant_owner`), demoted to STAFF in the database, and their next refresh came back **`merchant_staff`** — and the owner-only route then answered **403** to the new token. Storing the claims would have given T24's owner/staff split a 30-day hole.
      **A password reset now ends every session that predates it.** T21 changed the password while every token already issued kept working, because nothing consulted a store [F12]. The revocation is written as a query **inside the existing reset transaction** rather than as a call out to the service — it has to commit with the new password hash or not at all, since a reset that succeeded while the revocation failed is precisely the gap being closed. Verified: the session held before the reset gets **401** on refresh, and zero live rows remain for that account.
      **`@ThrottleCredentials()` was wrong for `/auth/refresh`, and swapping it is a real decision rather than tidying.** Refresh is routine automated traffic — every signed-in client spends a token roughly every 15 minutes and again on any 401 — so the credential tier's 20-per-5-minutes-per-IP would sign a NAT'd salon out mid-shift, which is the exact scenario that file's own comment already worries about for login. It is also the wrong *defence*: a refresh token is 32 bytes from a CSPRNG, so a rate limit was never what stood between an attacker and it. New `ThrottleRefresh()` tier — 60 per 5 min per IP, no `identity` tier (there is no email in the body for it to key on; it would be skipped anyway, and saying so keeps its absence a decision).
      **Frontend — and without it the 15-minute token would have been a straight UX regression.** `glow-plus-web/src/lib/api.js` now stores a session as a **pair** (`<key>` and `<key>:refresh`) and refreshes transparently: on a 401 with a token it spends the refresh token and replays the request **exactly once** (`retried`, so a route that 401s for a reason refreshing cannot fix does not become an infinite loop). **No view changed** — that is the measure of it working.
      ⚠️ **One-at-a-time refresh is load-bearing, and this is the subtle part.** The consumer dashboard fires three authenticated calls on mount. Without single-flight all three 401, all three spend the *same* refresh token, and two of them are **replays** — so the server correctly kills the family and **the user is signed out by their own dashboard loading**. Concurrent callers now share one in-flight promise. Proved in the browser rather than reasoned about: three requests 401'd, **one** `POST /auth/refresh` went out, all three retries succeeded, and the session was still alive afterwards.
      **Multi-tab is handled without weakening the server.** Rotation is deliberately **strict** — no grace window in which a spent token is quietly accepted again, because that window is exactly the one a thief replays in. Two tabs share `localStorage` but not the in-flight promise, so the losing tab now re-reads storage before concluding the session is dead: if the refresh token changed while it was asking, another tab rotated it successfully and this tab adopts the result.
      **Logout is now a logout.** It used to mean only that the client forgot its token, which left that token valid wherever else it had reached. `clearToken`/`clearConsumerToken`/`clearStaffToken`/`clearAdminToken` now call `POST /auth/logout` (fire-and-forget, so a dead connection cannot trap someone in their own browser) and clear both halves. **The four `setX` writers were deleted** — nothing imported them, and after T47 they would store an access token with no refresh half, i.e. a page that looks signed in for 15 minutes and then signs itself out with no way back.
      **Live: 61/61 checks** against the running API and real Postgres (login shapes for all four roles · hashing · rotation · family revocation · logout · password-reset revocation · role re-derivation · deleted account · expiry · validation · both routes genuinely public). **Browser: 18/18 in real Chrome** on the SPA (pair stored · dead token refreshed transparently · single-flight burst · no refresh when the token is good · logout sends the call, clears both halves, and the token is **revoked server-side** — an assertion that could not have been written before this task).
      **Tests: 22 new specs** (`refresh-token.service.spec.ts`), suite **323 → 345, all passing.** The Prisma double is a small in-memory store rather than a pile of `jest.fn()`s, because three of the four properties are about state *across* calls and per-call mocks assert that calls happened rather than that the rule holds. **Four mutations were run to prove they bite:** storing the raw token fails 14, allowing a replay fails 3, revoking only part of the family fails 4, and freezing the staff role instead of re-deriving it fails 1.
      **Noticed and deliberately not acted on:** authenticated API responses carry an `ETag`, so the retried requests came back **304**, not 200 (`fetch` surfaces that to JS as a normal success). Harmless, and it belongs with a response-caching pass at T53 if one ever happens, not here.
- [x] **T48 — Public endpoints truly public** — the app browses before signup. ✅ **DONE & VERIFIED 2026-08-25 (session 23).** The audit passed clean; the **second** question it raised did not, and that is where the work went.
      **The audit: 74/74 live checks, every one of the 66 routes probed with no credential at all.** All 22 routes that must be reachable before you have an account are (the three the RN app browses on — `/merchants`, `/styles/public/:id`, `/bookings/availability` — plus health, the eight `/auth/*`, the four logins, invite acceptance, and the Stripe webhook). All 44 others answer **401**. The near-misses are checked by name, because they are the ones a lazier exclusion pattern would sweep up: `GET /merchants/me` next to public `GET /merchants`, `GET /styles` next to `/styles/public/:id`, `GET /staff` next to `/staff/invites/:token`, and `PUT /business-hours` next to its public `GET`. Each is still 401 — the exclusions are matched as **exact paths, not prefixes**, and that is what keeps them apart. **Zero defects in the exclusion list.**
      **[F47] — but "reachable without an account" is only half of "truly public". The public browse-and-book path ignored merchant status entirely.** T44 established the rule for `GET /styles/public/:merchantId`: only an **ACTIVE** salon is visible, and PENDING/SUSPENDED/CANCELLED is a **404** rather than an empty result. Nothing else on the customer side had ever been held to it:
      - `GET /business-hours/:merchantId` served a full week of opening hours, **200**;
      - `GET /bookings/availability` offered free appointment times, **200**;
      - `POST /bookings` **accepted the booking and wrote the row, 201**.
      So a salon suspended for non-payment kept taking appointments through the public API while its own menu 404'd. T29 [F30] built a paywall for *merchant actions*; there was no equivalent on the customer side. It survived because it is not reachable by browsing — the directory lists ACTIVE only and the menu 404s — so it needs an id you already have: a bookmark, a deep link, or an app that cached the salon before it lapsed.
      **Proved before fixing, not asserted.** The rule was disabled behind an env flag and the backend restarted, and the SUSPENDED journey was re-run against the live API: hours **200**, availability **200**, booking **201 with a row written in Postgres**. Restored, and the same journey is now 404/404/404 with **no row written**.
      **One rule, in one place** — `src/common/merchant-visibility.ts`. T44's check moved into it unchanged (so that route behaves byte for byte as it did) and the other three now call it. Four copies of a visibility rule is four chances for them to disagree about which salons exist, which is exactly the class of bug this was. It is called **first** in each method, before any other lookup: if the style lookup ran ahead of it, a suspended salon would answer 404 for a bad style id and 200 for a good one, leaking its existence and its catalogue to the caller it is hidden from.
      **Also fixed on the same route, and it is the [F38] pattern again:** `GET /business-hours/:merchantId` took a **bare `@Param('merchantId')`**, which ValidationPipe does not validate — the one public salon-scoped route that never got T44's treatment. An unbounded string reached a Prisma lookup on an **unauthenticated** route. Now a DTO with a length bound (deliberately not a cuid regex, same reasoning as T44). Verified live: a 5,000-character id is **400 in the pipe**, a short unknown one a clean **404**. Its response also gained an explicit four-field `select` — BusinessHours holds nothing secret *today*, which is precisely the state in which a column gets added to an internet-facing response without anyone noticing [F31]. `merchantId` is deliberately dropped: the caller supplied it.
      **Live: 30/30 across all four merchant statuses.** The seeded salon was flipped through ACTIVE → SUSPENDED → PENDING → CANCELLED in Postgres and the whole anonymous journey re-run at each: ACTIVE is listed/200/200/200/201, and every other status is unlisted/404/404/404/refused with no booking row. Restored to its seeded status afterwards.
      **Browser: 11/11 in real Chrome.** A stranger loads the landing page and the directory arrives with **no request refused for want of a token**; then signed in, the Book tab was clicked through for real — salon, service, date, **Find times** (15 slots rendered), pick a slot, book, **201**. Then **the salon was suspended mid-session** and Find times pressed again: **404**, the dashboard stays on screen, no page error, and the user is **told in words** ("not currently accepting bookings") rather than shown an empty slot list that reads as "fully booked". A fresh browser cannot reach that case at all — a suspended salon is not in the directory, so there is nothing to select — which is why it is driven as a mid-session lapse.
      **Tests: 12 new specs** (`merchant-visibility.spec.ts`), suite **345 → 357, all passing.** They assert the rule *and* that all four call sites apply it and apply it first, because the failure mode is **drift between them** — a per-service test passes happily while two services answer differently. **Three mutations were run to prove they bite:** removing the check from booking creation fails 1, widening the select by one field fails 1, and letting SUSPENDED through fails 5.
      ⚠️ **Cost time, worth recording: a stray `.ts` in the backend ROOT silently breaks `nest start --watch`.** `tsconfig.json` sets `rootDir: ./src`, so any file beside it fails the build with **TS6059** — the same reason `jest.setup.ts` and `prisma/` are already in `exclude` [F23]. The watcher then keeps serving the **last good build**, so an edit appears to have no effect and a mutation test appears to pass. Put throwaway scripts in `prisma/` (already excluded, and `@prisma/client` resolves there) and delete the `.js`/`.js.map` afterwards.
- [x] **T49 — API versioning (`/v1`).** ✅ **DONE & VERIFIED 2026-08-25 (session 24).**
      **Every route now lives under `/v1`, and the version is NOT dual-served.** `app.enableVersioning({ type: URI, defaultVersion: '1' })` in `main.ts`, so no controller carries a `version:` of its own. The unversioned tree is gone rather than aliased — the same call T43 made when it deleted `/merchants/public`, and for the same reason: two paths serving one thing is how two shapes drift, and nothing is deployed yet, so there is no migration to soften. **A version that is optional is not a version.**
      **Why it lands before deployment and not after:** a prefix is free now and breaking later. It is also absorbable by Order 2 *as configuration* — the RN app reads `Constants.expoConfig.extra.apiBaseUrl` (`client.js:4`) and writes bare paths after it, so `/v1` is one string in `app.json` and **not one line of `client.js` changes**. That is the whole reason this is safe to do to an app we are not allowed to edit. The website is built the same way on purpose (`config.js`, one constant): a version baked into 40 call sites is a version you can never bump.
      **`/health` and `/health/ready` are `VERSION_NEUTRAL` and stay unversioned.** A liveness probe answers "is this process alive", a question that outlives any API version; a health check that 404s the day the API goes to `/v2` is an outage that is not one. **This was not free — prefixing the two health entries in the AuthMiddleware exclusion list made every uptime probe 401**, and it was caught by *probing the route*, not by reading the diff.
      **Four places compare against the RAW URL and had to be taught the prefix** — Nest's versioning does not reach the Express layer, and each of these fails silently and differently. They are why `config/version.ts` exists as a constant instead of the string being written out four times:
      1. **`app.module.ts`** — AuthMiddleware's exclusion list, 13 of 15 entries wrapped in `withVersion()`. Miss one and a **public route starts demanding a token**.
      2. **`common/throttling.ts`** — `EXEMPT_PATHS`. Miss it and **Stripe gets 429'd, which makes Stripe RETRY**, manufacturing exactly the load the limiter was shedding. The version segment is **optional** in both patterns deliberately: health is genuinely un-prefixed while the webhook is versioned, and one pattern that accepts either survives the next bump.
      3. **`billing.module.ts`** — the `express.raw()` mount. Miss it and `req.rawBody` is never set, so `constructEvent()` fails the signature on **every** event as a 400. That is **[F19]** exactly, which has already cost this project a session once.
      4. **`health.controller.ts`** — the one route that opts out.
      **Also updated, because a dev tool that points at the old tree is a trap for the next session:** `scripts/api.sh` (`API_BASE` now `.../v1`, so the paths passed to it stay bare), `README.md`, and the `stripe listen --forward-to` line in `.env.example`.
      **Live: the old tree serves nothing.** With a **valid token**, `/bookings/me`, `/me/rewards` and `/visits/me` are all **404** while their `/v1` twins are 200 — proof it is one tree, not two. ⚠️ **Without** a token the old paths answer **401, not 404**, because AuthMiddleware runs on `forRoutes('*')` ahead of the router; that is the same behaviour T43 accepted for `/merchants/public` and is worth knowing before reading a 401 as "the route still exists". `/health` and `/health/ready` are **200 unversioned**, and `/v1/health` is 401 (no such route). The **74/74 public/private audit was re-run against `/v1`** and came back clean, and **real Stripe events all 200 at `/v1/billing/webhook`** with raw body and signatures intact.
      **Browser: 16/16 in real Chrome**, across two pages and **47 backend requests**. The assertion that matters is not any single route but **the whole set**: every request the SPA made went to `/v1`, **none 404'd**, no 5xx, no page errors. Anonymous landing → directory loads with nothing refused for want of a token; consumer sign-in → the three-call dashboard burst still succeeds (the T47 refresh regression); Book tab → availability 200, 15 slots, booking **201**; merchant portal login → portal renders. Plus no horizontal overflow at 390px.
      **Tests: 13 new specs** (`config/version.spec.ts`), suite **383 → 396, all passing.** Most of them read the *source*, because the failure mode is **drift between the four matchers** — a per-file test passes happily while two of them disagree. Same reasoning as T50's cross-controller shape tests. One asserts `HealthController` is the **only** `VERSION_NEUTRAL` controller, by walking every `*.controller.ts`: a second one would be a route quietly left outside `/v1`. **Four mutations were run to prove they bite:** dropping `withVersion()` from one exclusion, un-versioning the Stripe raw mount, removing `VERSION_NEUTRAL` from health, and reverting `EXEMPT_PATHS` to the unversioned patterns — 1, 1, 1 and 2 failures respectively, green again on restore.
- [x] **T50 — Pagination** on visits/bookings (breaking change if added later). ✅ **DONE & VERIFIED 2026-08-25 (session 23).**
      All four authenticated list routes now take `?limit=` / `?offset=`: `GET /visits`, `GET /visits/me`, `GET /bookings/me`, `GET /bookings`. **It lands now because adding it later is breaking in both directions** — the body would have to grow an envelope (or the total move somewhere), and a client that used to receive everything would silently start receiving a page. It costs nothing today: the only two clients are ours and neither has shipped.
      **The body stays a bare array; the total rides on `X-Total-Count`** — the same contract T43 and T44 set for the public lists, and for the same reason: `client.js:203` maps `/bookings/me` directly, so an `{ items, total }` envelope breaks Order 2 on the day it ships. One shape across every list route is also less to remember. The envelope stays *inside* the service and the controller unwraps it.
      **Page and count share one `where`, inside one `$transaction`.** So `X-Total-Count` is the size of the list being paged through, not of the table — a merchant paging "this week" is told how many are in this week. Verified live: the unfiltered total is unchanged by `?limit=1`, and `?from=2030-01-01` reports **0**.
      **Default page is 100** — deliberately larger than anything the website renders, so no view needs a paginator it did not have yesterday. The point of T50 is the contract, not a UI feature; the ceiling (200) exists so a customer with four years of visits cannot ask the API to serialise all of them at once.
      **Found on the way, and it is [F38] again: `GET /bookings` took loose `@Query('from')` / `@Query('to')` params**, which ValidationPipe does not look at. `new Date('banana')` is an Invalid Date and Prisma was handed it — a 500 from the driver where a 400 belongs. Bound as `MerchantBookingsQueryDto` (pagination + the two ISO bounds). Verified live: `?from=banana` is **400** naming the field, a real ISO date is 200, and `?bogus=1` is stripped by `whitelist` rather than refused.
      **Live: 53/53** against the running API and real Postgres — every route returns a bare array with a correct `X-Total-Count`, `?limit=1` pages, `?offset=1` returns a different row, a far offset is `[]` at 200, and `limit=abc` / `limit=0` / `limit=201` / `offset=-1` are all **400**.
      **Tests: 19 new specs** (`pagination.dto.spec.ts`). Three of them assert the **shape across controllers** rather than per route, because the failure mode is two routes disagreeing — a per-route test passes happily while that is true. They also pin that no controller sets `Access-Control-Expose-Headers` itself [F46], matched on the *call* rather than the name, since the doc comment beside each handler mentions the header precisely to warn the next reader off it.
- [x] **T51 — CORS covers Expo web.** ✅ **DONE & VERIFIED 2026-08-25 (session 23).** Small, and worth being clear about *why* it is small.
      **The native app needs nothing here, and that is the main finding.** Expo Go and a built binary send **no `Origin` header at all**, so CORS never engages — and `isOriginAllowed` already returns true for origin-less requests (T28 made that call deliberately: refusing them blocks curl, Stripe and every non-browser client while stopping no attacker). CORS is a browser rule; React Native is not a browser. So this task changes nothing about the shipped Order 2 deliverable.
      **What it does buy is `expo start --web`**, a common way to preview an Expo app during development, which *is* an ordinary browser origin. Without an entry, whoever builds Order 2 meets a CORS error in a console the backend developer is not watching.
      **Both ports: 8081** (Metro, the default since SDK 49 — the app is Expo `~51.0.0`) **and 19006** (the older `@expo/webpack-config` server that plenty of existing configs still use). Guessing one and being wrong fails the same invisible way, so both are listed.
      **Dev fallback only**, plus `.env` / `.env.example` for local use. There is a test asserting production gets **no** localhost exemption: a deployed Expo web build has a real origin and belongs in `ALLOWED_ORIGINS` like any other (**T59**). Baking localhost into production would be an open door that looks like configuration.
      **7 new specs** in `security.spec.ts` (34 in that suite), including the origin-less native case.

# PHASE 8 — Deployment _(Vercel for both — decided 2026-08-23)_

Vercel runs the backend **serverless**, a different model from a long-running Node process. T54–T58 exist because of that and are not optional.

- [x] **T52 — Production Postgres.** ✅ **DONE & VERIFIED 2026-08-25.**
      **Supabase**, project `xhyoeiltwcciqowlwyov`, region **`us-east-1` (East US, N. Virginia)**, free plan, Postgres **17.6**.

      **Why us-east-1 and not Canada Central, for a Canadian client.** **Vercel has no Canadian serverless-function region** — Toronto/Montreal are edge PoPs (static caching), not compute. The API will run in `iad1` = AWS `us-east-1` regardless, so a Montreal database would sit ~15–25ms from the code querying it, on every one of the 4–8 queries a portal page makes. PIPEDA imposes no residency requirement, only *disclosure* of cross-border processing — which **T66**'s privacy policy has to state anyway. The clinching argument: the same personal data already goes to **Stripe** (US) and **Resend** on every signup, so a Canadian Postgres beside a US payment processor and a US email provider protects nobody. Revisit only on a **written** residency requirement from the client — Quebec's Law 25 would be the realistic trigger — and note that changing a Supabase project's region afterwards is a dump-and-restore, not a setting.

      **The schema now declares TWO urls, and in production they must not be the same string.** `prisma/schema.prisma` gained `directUrl`:
      | Prisma field | Supabase string | Port | Read by |
      |---|---|---|---|
      | `url` → `DATABASE_URL` | Transaction pooler, `?pgbouncer=true&connection_limit=1` | **6543** | Prisma **Client** — every request |
      | `directUrl` → `DIRECT_URL` | Session pooler, no flags | **5432** | Prisma **CLI** only — `migrate deploy`, `db pull` |

      **Why the split is mandatory, not tidiness:** migrations take a **session-level advisory lock** and run DDL in a transaction that must outlive one statement. Through a *transaction* pooler that lock is taken on a connection the pooler may hand to someone else mid-migration, so `migrate deploy` hangs or fails. And `?pgbouncer=true` is not optional either — transaction mode does not support prepared statements, which Prisma uses by default; without the flag you get `prepared statement "s0" already exists`, **intermittently, under load, in production only**.

      ⚠️ **Do NOT use Supabase's third string, "Direct connection" (`db.<ref>.supabase.co`), for `DIRECT_URL`.** On the free plan that host is **IPv6-only** and GitHub Actions runners are IPv4-only — it works from a laptop and then fails in CI, i.e. it breaks **T58**, which is the worst possible place to discover it. The session pooler is the IPv4-reachable equivalent. Both pooler strings use the `postgres.<project-ref>` username form, not plain `postgres`; copying the username off the direct string onto the pooler host is the usual first failure (`Tenant or user not found`).

      ⚠️ **The generated password contained `/ $ ^ * @ @` and is PERCENT-ENCODED in both URLs.** Two `@` and a `/` in a URL password is not a cosmetic problem: `@` delimits userinfo from host, so an un-encoded password makes the parser read the host as `P@25…` and fail with a "host not found" error that looks nothing like its cause. All five special characters are encoded (`safe=''`), deliberately more than the URI spec strictly requires — `$` also expands in a shell and in some dotenv parsers, and this string ends up in both (**T53** Vercel env vars, **T58** CI). The **raw** form is kept on a commented line at the bottom of `.env` for dashboard/psql use, which needs the un-encoded value.

      **Evidence — run, not assumed:**
      | Check | Result |
      |---|---|
      | `prisma migrate deploy` | all **8** migrations applied to a fresh DB |
      | Tables created | **16** = 15 app tables + `_prisma_migrations` |
      | **Schema diff prod vs local**, table+column+type | **126 columns each, zero drift — IDENTICAL** |
      | Prisma **Client** over the **pooled** `:6543` string | connected; 5× parameterised query OK (the shape that trips the prepared-statement bug when `pgbouncer=true` is missing) |
      | Prisma Client with `DIRECT_URL` **deleted** | still served queries — proves `directUrl` is **CLI-only**, so a wrong value breaks deploys, never live requests |
      | API booted against production | `GET /health` **200**, `GET /health/ready` **200**, `database.status: "up"` |
      | `npm run seed` against production | **refused** — *"DATABASE_URL does not point at a local database"*. The local-DB guard works; production cannot be seeded with known-weak test passwords |
      | `npm test` | **396 passing, 25 suites** — unchanged by the schema edit |

      **On the latency figure, so nobody panics at it later:** `/health/ready` reported **~1,170ms** against Supabase versus **5ms** against local Docker. That is **distance, not misconfiguration** — measured raw TCP RTT from Pakistan to the pooler is **240ms**, so ~1.17s is 2–4 round trips plus TLS. It was checked rather than assumed precisely because a fixed per-query overhead would have meant a pooling bug that followed us to Vercel. On Vercel the function and the database sit in the **same AWS region**, so this collapses to single-digit ms. **T63** measures the number that actually matters, from the deployed environment.

      **`.env` is switched BACK to local Docker**, with the Supabase pair commented directly beneath it. Pointing local development at production would write test signups into the launch database. Swap the comments to flip, and **restart** — `nest start --watch` does not reload `.env`.

      ⬜ **Still open, and deliberately:** the connection strings must be added as Vercel env vars (**T53**), the project is on the **free plan** (500 MB, autosuspends after ~1 week idle — flag ~$25/mo to the client before real traffic), and it lives in **the developer's own Supabase account** — **transfer to the client's organisation at handover**, which is a Supabase project-transfer, not a re-migration.
- [x] **T52b — Close the Supabase Data API against the app tables.** ✅ **DONE & VERIFIED 2026-08-26.** Found while re-verifying T52 on production day; **not** a defect introduced by T52, it is the Supabase default that Prisma has no concept of.

      **What was wrong.** Supabase fronts every project with PostgREST at `https://<ref>.supabase.co/rest/v1/`, exposing the `public` schema. On a fresh project `anon` and `authenticated` hold **ALL** privileges on every table in `public`, and Prisma-created tables inherit that grant. RLS is the only thing in the way — and **Prisma never enables it**, because Prisma does not model RLS at all. Measured before the fix: **RLS OFF on all 16 tables, 0 policies**, `anon` holding SELECT/INSERT/UPDATE/DELETE on all 16, and `GET /rest/v1/User` returning **401** (missing key) rather than 404 — i.e. the route is **live**.

      **Why it mattered.** The anon key is **public by design** — Supabase ships it in browser bundles. Anyone holding it could read `"User"` (bcrypt hashes + AES-GCM phone ciphertext), read `"RefreshToken"` and `"PasswordReset"`, and **INSERT themselves a row in `"Admin"`**. This app never ships that key (Prisma over the pooler, not `supabase-js`), so nothing is known to have leaked — but *"not currently leaked"* is not a security control, and this would have gone to the client that way.

      **The fix** — `prisma/migrations/20260826120000_lock_down_supabase_data_api/`, two independent locks per table: `REVOKE ALL … FROM anon, authenticated` (PostgREST fails **before** RLS is consulted) **and** `ENABLE ROW LEVEL SECURITY` (zero policies = deny-all for anything that cannot bypass). Plus `ALTER DEFAULT PRIVILEGES` so tables added by **future** migrations do not inherit the grant back.

      ⚠️ **There is deliberately NO `FORCE ROW LEVEL SECURITY`.** `FORCE` subjects the table **owner** to policies too — and with zero policies defined that would lock the backend out of its own database. Its absence is the safety, not an oversight. Prisma connects as `postgres`, which **owns** every table *and* has `rolbypassrls = true` (both verified before applying), so RLS is invisible to the app.

      ⚠️ **The migration is a strict no-op off Supabase.** `anon`/`authenticated` are Supabase-managed roles that do not exist on local Docker or a CI service container, where an unguarded `REVOKE` aborts with *"role does not exist"* — breaking **T58** in the most expensive place to find it. The whole body is guarded on `pg_roles`. Local dev gains nothing from RLS anyway: there is no Data API in front of it.

      **Evidence — queried live, not assumed:**
      | Check | Before | After |
      |---|---|---|
      | `anon`/`authenticated` privileges (7 types × 2 roles × 16 tables) | **all granted** | **NONE** |
      | RLS enabled | **0/16** | **16/16** |
      | Future tables in `public` inherit the grant | **yes** | **no** — defaults are `postgres` + `service_role` only |
      | Backend role bypasses RLS | — | `postgres`, `rolbypassrls=true` ✅ |
      | Prisma reads after lockdown | — | ✅ `User`, `Merchant`, `Booking`, `RefreshToken`, `Style` all queried fine |
      | `service_role` preserved (Supabase internals need it) | — | ✅ |

      **Note on the `storage` schema:** its default ACLs still grant `anon`/`authenticated`, and that is **correct** — Supabase Storage is unused here and is governed by its own RLS policies on `storage.objects`. A first verification pass flagged it as a leak; the query was too broad, the schema is not in scope.

      Applied to production via the Supabase SQL Editor. The migration file is committed so the lockdown **travels with the repo** and re-applies itself when the client's project is stood up at handover — it is idempotent, so `migrate deploy` re-running it is harmless. Break-glass rollback is recorded in the migration's header comments.
- [ ] **T53 — Deploy backend + website**, env vars in Vercel project settings.
- [x] **T54 — Convert all 4 cron jobs to Vercel Cron.** ✅ **DONE & VERIFIED 2026-08-26.** `@Cron()` sets an **in-process timer**, which needs a process still alive when it expires — and a serverless function is alive only while serving a request. On Vercel the timers would be registered and the container frozen seconds later, so **not one job would ever have run**: no error, no log, nothing to notice. That silently kills **T19** (trial reminders) and **T25** (point expiry).

      **New:** `src/modules/cron/` — `cron.controller.ts`, `cron.service.ts`, `cron.guard.ts`, `cron.module.ts`.
      **Changed:** all four jobs lost `@Cron()`, `JobsModule` now **exports** its providers, `ScheduleModule.forRoot()` **removed** from `app.module.ts`, `CRON_SECRET` added to `PRODUCTION_REQUIRED`.

      ⚠️ **The decorators are GONE, not left alongside the routes.** Keeping both would double-run every job anywhere a long-running process does exist. Each job file now carries a comment naming the route that triggers it.

      **Two slots, not four routes — this is what keeps the client on the free plan.** Vercel **Hobby allows 2 cron jobs, each at most once daily**. Four routes would force Pro (~$20/mo) for four queries a day. The `vercel.json` schedule:
      | Slot | Cron | Runs | Was |
      |---|---|---|---|
      | `/v1/cron/nightly` | `0 2 * * *` | payout calc → point expiry → merchant reports **(Sundays only)** | 2am + 3am + weekly |
      | `/v1/cron/morning` | `0 9 * * *` | trial-ending reminders | 9am |

      ⚠️ **The cron path MUST stay excluded from `AuthMiddleware`** (`withVersion('cron/(.*)')`, GET). Vercel sends the secret as `Authorization: Bearer <CRON_SECRET>` — **the same header `AuthMiddleware` parses as a JWT**. Without the exclusion it 401s before `CronSecretGuard` ever runs, and every scheduled job stops with the only symptom being a 401 in a cron log nobody reads. **This does not make the route public** — the guard still has to match the secret.

      ⚠️ **The guard FAILS CLOSED on an unset `CRON_SECRET`.** An unset secret must never mean "let everyone in"; that is the failure mode where a missing env var quietly publishes a route that expires points and sends email. Comparison is constant-time over SHA-256 digests, so neither the value **nor its length** is observable in the response time, and **every rejection returns the identical message** — a distinct "wrong secret" reply would confirm to a prober that the route exists and is merely guarded.

      ⚠️ **Routes are `GET` although they mutate.** Vercel's scheduler issues a GET; a POST-only route would simply never be invoked. **Weekday is decided with `getUTCDay()`** — Vercel cron schedules are UTC, and a local-timezone check would skip the weekly report on the very night it is due, silently, once a week (there is a test for exactly this).

      ⚠️ **A failing job does not stop the batch,** and jobs run **sequentially, not `Promise.all`** — the pooled string is `connection_limit=1` (T52), so parallel jobs would contend for one connection. There is no retry; the next attempt is tomorrow, so one bad job aborting the slot would mean points quietly stop expiring every night.

      **Evidence — driven through the real serverless handler against production Supabase:**
      | Case | Result |
      |---|---|
      | No `Authorization` header | **401** `Cron is not configured.` |
      | Wrong secret | **401**, *identical* message |
      | Secret without the `Bearer` scheme | **401** |
      | Lowercase `bearer` scheme (RFC 7235 §2.1) | **200** — matched, as T46 does |
      | `GET /v1/cron/nightly` | **200** `payout ok 1927ms, expirePoints ok 1436ms, sendMerchantReports skipped "weekly — Sundays only (UTC)"` (today is Wednesday) |
      | `GET /v1/cron/morning` | **200** `trialEndingReminder ok 1728ms` |
      | Unknown slot | **404** `Unknown cron slot 'bogus'` — a `vercel.json` typo is visible, not a silent no-op |
      | Guard replied, not `AuthMiddleware` | ✅ proving the exclusion works |
      | `npm test` | **459 passing, 29 suites** (was 436; `modules/cron/cron.spec.ts` adds 23) |

      ⬜ **`CRON_SECRET` must be generated and set as a Vercel env var → T53.** Nothing schedules until it is.
- [x] **T55 — Prisma connection pooling.** ✅ **DONE — satisfied by T52, re-verified 2026-08-26.** Not separate work in the end: T52 already routes Prisma Client through Supabase's **transaction pooler on :6543 with `?pgbouncer=true&connection_limit=1`**, and gives the CLI a separate `directUrl` on the **session pooler :5432** for `migrate deploy`. That split *is* this task — see T52 for why each half is mandatory (`?pgbouncer=true` prevents the intermittent `prepared statement "s0" already exists`; the session pooler prevents `migrate deploy` hanging on an advisory lock).
      **Re-checked for the serverless model specifically:** `PrismaService` calls `$connect()` in `onModuleInit` — which now runs **once per container**, inside T56's cached `app.init()`, not once per request — and `$disconnect()` in `onModuleDestroy`. There is **no `enableShutdownHooks` / `process.on('beforeExit')`**, which is the Nest+Prisma pattern that actually misbehaves on serverless. Nothing to change.
      ⚠️ The `connection_limit=1` is also why **T54 runs its jobs sequentially rather than `Promise.all`** — parallel jobs would contend for the single connection.
- [x] **T56 — Cache the Nest app instance across invocations.** ✅ **DONE & VERIFIED 2026-08-26.** This is also the task that gave the backend a Vercel entry point **at all** — before it, there was no `vercel.json`, no `api/`, and `main.ts` ended in `app.listen()`.

      **The split.** Configuration moved out of `main.ts` into **`src/bootstrap.ts`** (`createApp()` / `configureApp()`), so both entry points apply the identical setup:
      | File | Role |
      |---|---|
      | `src/bootstrap.ts` | **the one place** the app is configured — helmet, CORS allow-list, exception filter, `whitelist: true` pipe, URI versioning |
      | `src/main.ts` | local/long-running — `createApp()` then `listen()` |
      | `src/serverless.ts` | Vercel — `createApp()` then **`init()`**, exports the Express instance as the handler |
      | `api/index.ts` | one-line re-export; Vercel's file-based function entry |
      | `vercel.json` | catch-all rewrite → `/api`, `maxDuration: 30`, `memory: 1024` |

      **Why the config had to be extracted rather than copied.** Two entry points with two copies of the setup would drift, and the drift would be **silent and security-shaped**: add a global guard to one, forget the other, and production runs unguarded while every local test and the whole Jest suite keeps passing — because nothing in the local loop goes through the serverless path.

      ⚠️ **The cached value is a PROMISE, not the resolved app, and that is the single most important line in `serverless.ts`.** A cold container can be handed several concurrent requests before the first bootstrap finishes. If each checks "is the app ready?", finds `undefined` and starts its own, several Nest instances race to open Prisma pools against a database whose pooled string is deliberately `connection_limit=1` (T52). Storing the promise on the first call makes every later caller await the same in-flight bootstrap. A rejected promise is cleared so the next request retries — the likely bootstrap failures (T27/T31b env guards, Prisma unable to reach Supabase) are transient, and a cached rejection would otherwise poison the whole warm container.

      ⚠️ **`init()`, not `listen()`.** On Vercel nothing listens; `listen()` would bind a port the platform never routes to and hold the invocation open. `init()` is the half that builds the DI container.

      ⚠️ **No `@codegenie/serverless-express`, deliberately.** That family exists to convert an AWS API-Gateway *event object* into something Express understands. Vercel hands the function Node's own `IncomingMessage`/`ServerResponse`, and an Express instance **is** a `(req, res)` function — so the adapter would encode the request into a Lambda event and immediately decode it again, whose only real effect is one more chance to mangle the Stripe webhook's raw bytes (**T57**).

      ⚠️ **`api/` is in tsconfig's `exclude`.** `rootDir` is `./src`, so a root-level `.ts` fails `nest build`/`typecheck` with **TS6059** — the same trap already documented for `jest.setup.ts` and `prisma/` ([F23]). Being excluded means `api/index.ts` is **not type-checked**, which is exactly why it is a single re-export with nothing in it to get wrong.

      **Evidence — the handler was driven directly, the way Vercel drives it** (a real `http.createServer` gives the same `IncomingMessage`/`ServerResponse`), against **production Supabase**:
      | Case | Result |
      |---|---|
      | `GET /health` (VERSION_NEUTRAL, unversioned) | **200** |
      | `GET /health/ready` | **200**, `database.status: "up"` |
      | `GET /v1/merchants` (public, versioned) | **200** `[]` — routing + versioning both live on the serverless path |
      | helmet headers on the serverless path | `x-content-type-options: nosniff`, `x-frame-options: DENY`, **`x-powered-by` absent** |
      | **Cold start** | **2,855 ms** |
      | **Warm invocations** | **2 ms, 1 ms, 3 ms** — the cache is doing its job |
      | `npm test` | **436 passing, 28 suites** (was 432 — 4 new guards below) |
      | `npm run build` / `typecheck` | both clean |

      **Four new guards in `config/version.spec.ts`**, because the split created a failure mode the old tests could not see: versioning being configured in `bootstrap.ts` only means anything for an entry point that actually goes *through* it. They assert both entry points import `createApp` and that **neither** calls `NestFactory.create` itself; that `serverless.ts` calls `init()` and never `listen()`; and that it caches the promise rather than the resolved app. A new `readCode()` helper strips comments first — these files explain at length *why* they avoid `.listen()`, so a naive negative match fails on a file that is entirely correct.

      **Note:** `/merchants` and `/v1/nope` answer **401, not 404** — `AuthMiddleware` runs before route resolution and rejects unmatched paths with "Missing bearer token". Pre-existing, unchanged by T56, and arguably correct since it does not leak which routes exist.

      ⬜ **The one assumption not verifiable locally:** that Vercel's catch-all rewrite preserves the **original** `req.url` rather than passing `/api`. It does for the standard Express-on-Vercel pattern, but if it did not, every route would 404 — so it is **smoke-test item #1** on first deploy (**T63**). `vercel dev` would settle it, but it needs an interactive login to the user's account.

      ⬜ **`ScheduleModule.forRoot()` still registers the four `@Cron()` timers** in the serverless app, where they add cold-start cost and never meaningfully fire. **T54** removes them.
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
