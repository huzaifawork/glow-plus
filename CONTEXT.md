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
| Postgres | ✅ `docker-postgres-1`, Postgres 16.15, port **5433**, db `glowplus`. **Migrated — 14 tables + `_prisma_migrations`** (was 0 applied; `PasswordReset` added T21, `Admin` added T22, `StaffInvite` added T24; `Visit.expired`/`expiredAt` added T25; **`RefreshToken` added T47**, and `AccountType` gained a fourth value `STAFF`) |
| Production DB | ✅ **T52 — Supabase, project `xhyoeiltwcciqowlwyov`, region `us-east-1`, Postgres 17.6, free plan.** 8/8 migrations applied; schema diffed against local at column+type level: **126 vs 126, zero drift**. `.env` is switched **back to local Docker** — the Supabase pair sits commented beneath it. `npm run seed` **refuses** to run against it (local-DB guard). Latency from here is ~1,170ms and that is **distance, not config** (raw TCP RTT to the pooler is 240ms); on Vercel `iad1` the DB is same-region. Account is the developer's → **transfer at handover** |
| Backend | ✅ **Compiles (0 TS errors) and runs on :4000**, 64 routes mapped, Prisma connected. **T49: every route is served under `/v1` — `http://localhost:4000/v1/...`. `/health` + `/health/ready` are `VERSION_NEUTRAL` and stay UNVERSIONED; do not prefix their AuthMiddleware exclusions or every uptime probe 401s.** **T47: the access token is 15 MINUTES, not 7 days — a stale browser tab now refreshes instead of dying, and `POST /auth/refresh` + `POST /auth/logout` exist.** **T46: the `Bearer` scheme is matched case-INSENSITIVELY (RFC 7235 §2.1) — do not "tidy" it back to `startsWith('Bearer ')`.** **T43: the public salon directory is `GET /merchants` — `GET /merchants/public` no longer exists.** **T44: `X-Total-Count` is exposed once, globally, in `config/security.ts` — do NOT set `Access-Control-Expose-Headers` in a handler, it REPLACES the rate-limit list [F46].** **T27: it refuses to boot on a missing/placeholder secret** — intended; read the error, it names every problem at once. **T30: JWT is now `jsonwebtoken@9`, not hand-rolled** — pre-T30 tokens lack `iss`/`aud` and are refused, so a stale browser session must sign in once more (the web client clears it automatically). **T31: `bcrypt` → `bcryptjs`** (removes the native binary and the only critical advisory; existing `$2b$` hashes verify unchanged). **T31b: also refuses to boot without `ENCRYPTION_KEY`** (32 bytes, hex or base64) — phone numbers are now AES-256-GCM at rest |
| Website | ✅ **Now React + Vite** — `glow-plus-web` on :3000 (`npm run dev`). Migrated session 3; see §11. The old `glow-plus-frontend` (Express) still exists but is **superseded** — don't run both, they both want :3000. **T39: `.topbar` is `min-height:52px`, not `height` — it must be able to grow when `.topnav` wraps, or the nav spills over the promo bar and the page heading at phone widths. T39b: below 700px `.topnav` is a drop panel behind `#navToggle` (`TopBar.jsx`), so it is `display:none` until `.open`** |
| Stripe CLI | ✅ Forwarding verified; **webhook now returns 200** (was 400 on everything — see F19) |
| Tests | ✅ Jest configured, **396 passing** (`npm test`) — 25 suites (T49 added `config/version.spec.ts`, 13): jwt.util (23, T30), health controller, exception filter (+6 body-parser, T31), billing readPeriod, require-merchant / require-consumer / require-admin / require-merchant-owner / require-active-subscription guards, trialEndingReminder job, expirePoints job, throttling, env.validation (**+6 for ENCRYPTION_KEY, T31b**), security headers/CORS, **input-validation (T31, 22 + T38, 10)**, **pii-crypto (T31b, 25)**, me.service (T42, 12), reward-rules.service (T37, 21), **merchants.service + controller (T43, 19)**, **styles.service + controller (T44, 16)**, **auth.middleware (T46, 26)**, **refresh-token.service (T47, 22)**, **merchant-visibility (T48, 12)**, **pagination.dto (T50, 19)**, security +7 (T51). ⚠️ `jest.setup.ts` supplies `JWT_SECRET` AND now `ENCRYPTION_KEY` — neither has a fallback |
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
./stripe.exe listen --api-key <STRIPE_SECRET_KEY from .env> --forward-to localhost:4000/v1/billing/webhook   # T49: /v1
```

**Test credentials** (`npm run seed`): `merchant@glowplus.test / Merchant123!` · `consumer@glowplus.test / Consumer123!`
**Helper:** (T49 — its `API_BASE` already carries `/v1`, so paths stay bare) `./scripts/api.sh merchant GET /bookings` · `./scripts/api.sh consumer GET /bookings/me` · `./scripts/api.sh reset`

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

## 8. EXACTLY where to resume — **Phases 5–7 DONE. In PHASE 8 (deployment); T52 done, next is T53.**

> ### ⬇️ Start here. Everything below this box is a historical log, newest last.
>
> **State as of session 25 (2026-08-25): 52 of 65 done. PHASE 7 IS CLOSED —
> T46 ✅ T47 ✅ T48 ✅ T49 ✅ T50 ✅ T51 ✅. PHASE 8 IS UNDERWAY: T52 ✅ (and
> T60 ✅, done early). Next is T53. Remaining: T53–T59, T61–T63, T64–T66.**
> Backend suite **396 passing**, 25 suites.
>
> ⚠️ **T52: PRODUCTION POSTGRES EXISTS — Supabase `us-east-1`, Postgres 17.6,
> all 8 migrations applied, schema verified IDENTICAL to local (126 columns,
> zero drift).** Three things to know before touching it:
>
> - **`.env` is pointed at LOCAL Docker on purpose**, with the Supabase pair
>   commented right beneath. Swap the comments to flip, and **restart** —
>   `nest start --watch` does not reload `.env`. Do not leave local dev on
>   production: ordinary signup testing would write into the launch database.
> - **The schema now has TWO urls and they must differ in production.**
>   `DATABASE_URL` = transaction pooler **:6543** `?pgbouncer=true&connection_limit=1`
>   (Prisma Client, every request). `DIRECT_URL` = session pooler **:5432**
>   (Prisma **CLI only** — proven: the client still served queries with
>   `DIRECT_URL` deleted). Never use Supabase's third string, "Direct
>   connection" `db.<ref>.supabase.co` — it is **IPv6-only** on the free plan
>   and CI runners are IPv4-only, so it breaks **T58**, not local work.
> - **The password is PERCENT-ENCODED inside both URLs** (it contains
>   `/ $ ^ * @ @` — two `@` in a URL password makes the parser read the host
>   as `P@25…`). The **raw** form is on a commented line at the bottom of
>   `.env` for dashboard/psql use. Do not "clean up" the `%XX` escapes.
>
> **Supabase account is the DEVELOPER'S, not the client's** — transfer the
> project at handover. Free plan: 500 MB, autosuspends after ~1 week idle.
>
> ⚠️ **T49: EVERY ROUTE IS NOW UNDER `/v1`, except `/health`.** This is the
> single most important thing to know before touching anything — it changes
> every URL you will type this session.
>
> - **`http://localhost:4000/v1/...`** for everything. `./scripts/api.sh` was
>   updated to match, so the paths you pass IT stay bare (`/bookings/me`).
> - **`/health` and `/health/ready` are `VERSION_NEUTRAL` and stay unversioned.**
>   A probe answers "is this process alive", which outlives any API version.
>   Prefixing their two AuthMiddleware exclusions **401'd every uptime probe** —
>   caught by probing, not by reading the diff. Leave those two entries bare.
> - **`stripe listen --forward-to localhost:4000/v1/billing/webhook`** now.
> - **The old tree is GONE, not aliased** (T43 precedent). With a valid token
>   the unversioned paths are **404**. ⚠️ **Without** one they are **401**, not
>   404, because AuthMiddleware runs on `forRoutes('*')` ahead of the router —
>   do not read that 401 as "the route still exists".
> - **Four places compare the RAW URL and must know the prefix**, which is why
>   `config/version.ts` exists: the AuthMiddleware exclusions, `EXEMPT_PATHS`
>   in `throttling.ts`, the `express.raw()` mount in `billing.module.ts`
>   (**[F19]** — miss it and every Stripe event 400s), and the health
>   controller. Nest's versioning does **not** reach the Express layer. Build
>   every new matcher with `withVersion()`.
> - **The version segment is OPTIONAL in `EXEMPT_PATHS`** on purpose — health
>   is un-prefixed while the webhook is versioned, and one pattern that accepts
>   either survives the bump to `/v2`. Do not "tidy" it to a fixed `v1/`.
> - **Both clients keep the version in ONE constant** — `config.js` for the
>   website, `expoConfig.extra.apiBaseUrl` for the RN app. That is what makes
>   `/v1` a **config change** for Order 2 rather than a code change; not one
>   line of `client.js` moves. Never write `/v1` into a call site.
>

> **T50: every list route paginates, and the body is still a BARE ARRAY** —
> `?limit=`/`?offset=` with the total in `X-Total-Count`, the same contract as
> T43/T44. Do not "tidy" any of them into `{ items, total }`: `client.js` maps
> these directly. Page and count share one `where` in one `$transaction`, so
> the header describes the *filtered* list.
>
> **T51 is narrower than it sounds and the note is worth keeping: the NATIVE
> app never needed CORS.** It sends no `Origin`, so CORS never engages. The
> entries added are for **Expo web** only (8081 Metro, 19006 legacy webpack),
> dev-fallback only, with a test that production gets no localhost exemption.
>
> **T48 found [F47], the sharpest bug of the session: `POST /bookings`
> accepted bookings at SUSPENDED, PENDING and CANCELLED salons**, and
> `/bookings/availability` and `/business-hours/:id` served them too — while
> `/styles/public/:id` correctly 404'd. A salon suspended for non-payment kept
> taking appointments. **The rule now lives in ONE place,
> `common/merchant-visibility.ts`, and is called FIRST in all four public
> salon-scoped routes** — first matters, because a check placed after the
> style lookup leaks the salon's catalogue to the caller it is hidden from.
> Do not inline a copy of it; four copies is four chances to disagree.
>
> The exclusion-list audit itself came back **clean, 74/74** — all 22 routes
> that must be public are, all 44 others 401. The near-misses
> (`/merchants/me`, `/styles`, `/staff`, `PUT /business-hours`) are checked by
> name; the exclusions are **exact paths, not prefixes**, and that is what
> keeps them apart.
>
> **T47 is done and it is the biggest behavioural change in the backend so
> far: the access token is now 15 MINUTES, not 7 days.** Read its TASKS.md
> entry before touching auth; five things there are easy to undo by accident.
>
> 1. **`token` keeps its name and its position in every login response.**
>    `refreshToken` and `expiresIn` are additive beside it. `client.js:99`
>    reads `result.token` and nothing else, so **Order 2 still works
>    unchanged** — that is the whole reason T47 landed before deployment.
> 2. **Rotation is single-use and a replay revokes the WHOLE family**, which
>    logs the legitimate user out too. That is intended, not a bug: the server
>    cannot tell the thief from the victim. Do not add a "grace window" to
>    make multi-tab easier — that window is exactly what a thief replays in.
>    The multi-tab race is handled on the CLIENT instead.
> 3. **`api.js` refreshes ONE AT A TIME, and that is load-bearing.** The
>    consumer dashboard fires three authed calls on mount; without the shared
>    in-flight promise, two of them are replays and **the user is signed out
>    by their own dashboard loading**. If you touch `refreshSession`, re-run
>    the burst check.
> 4. **Claims are RE-DERIVED from the account row on every refresh**, never
>    replayed out of the stored token. That is what stops a demoted OWNER
>    keeping owner claims for 30 days. `RefreshToken` therefore stores
>    `accountId`/`accountType` and deliberately NOT `role`/`merchantId`.
> 5. **`/auth/refresh` is on `ThrottleRefresh()` (60/5min/IP), NOT
>    `ThrottleCredentials()` (20/5min/IP).** Refresh is routine automated
>    traffic; the credential tier would sign a NAT'd salon out mid-shift.
>
> ⚠️ **A password reset now revokes every session that predates it**, as a
> query inside the existing reset transaction. **Do not move it out** — it has
> to commit with the new password hash or not at all.
>
> ⚠️ **The four `setToken`/`setConsumerToken`/`setStaffToken`/`setAdminToken`
> exports in `api.js` are GONE.** A session is a pair now; storing only the
> access half produces a page that looks signed in for 15 minutes and then
> signs itself out with no way back. `writeSession` is the one writer and it
> is internal.
>
> ⚠️ **Testing note that cost time twice this session:** the SPA resets to the
> **marketing** view on reload, so reloading the page proves nothing about an
> authenticated flow — it fires no authenticated request at all. Drive the app
> module directly instead (`await import('/src/lib/api.js')` in the page; Vite
> dev serves it and the page has already imported it, so it is the same
> instance the views use). Also: authenticated responses carry an **ETag**, so
> a successful retry comes back **304**, not 200 — `fetch` surfaces that to JS
> as a normal success, so do not read it as a failure.
>
> **T46 is done, and it was not the no-op it looked like.** Auth *was* already
> token-only everywhere — but the scheme was matched **case-sensitively**, and
> **RFC 7235 §2.1 says the scheme name is case-insensitive**, so `bearer` and
> `BEARER` were 401'd. That is a backend the RN app cannot work around, which
> is the exact rework Phase 7 exists to prevent. It is now
> `/^Bearer +(.+)$/i` in `auth.middleware.ts` — **do not "tidy" it back to
> `startsWith('Bearer ')`.** It was only found by *replaying the header in a
> case a client may legitimately send*; the code reads correctly until you try it.
>
> Two things from T46 worth keeping:
> 1. **There is exactly ONE place a credential enters the API** —
>    `auth.middleware.ts`. No cookie, no `?token=`, no second header, and
>    `credentials: false` in `config/security.ts`. `auth.middleware.spec.ts`
>    pins all of that with 26 specs whose negative cases each use a **valid**
>    token, so a failure means the channel widened. Adding a second channel
>    "for convenience" will fail those tests, which is the intent.
> 2. **`credentials: false` is doing more than it looks like.** A
>    `fetch(..., { credentials: 'include' })` from the SPA is **blocked by the
>    browser at the CORS layer** — "Failed to fetch", the response never
>    becomes readable — not merely answered 401. Verified from a real signed-in
>    page. Turning `credentials` on would quietly undo that.
>
> **T44 is done: `GET /styles/public/:merchantId` is the salon menu, and the
> path deliberately did NOT move.** Unlike T43, `client.js:157` already calls
> this exact path, so moving it for symmetry would have been a breaking change
> to an app we may not edit, bought with nothing. Read its TASKS.md entry
> before touching that module; three things there are easy to undo by accident.
> 1. **`:merchantId` is a DTO, not `@Param('merchantId')`.** A bare param is
>    validated by nothing [F38] — a 5,000-char id used to reach Prisma on an
>    unauthenticated route. It is a **length** bound and deliberately not a
>    cuid regex, so a future id scheme fails as a clean 404 rather than a 400.
> 2. **The body is a bare array and the total is in `X-Total-Count`**, same
>    contract as T43 — `BookScreen.js` maps it directly.
> 3. **`active: true` here must match what T43's `styleCount` counts.** If the
>    two ever disagree, a salon card advertises "3 styles" and the menu behind
>    it shows two. There is a test on the `where`, not just the fixture.
>
> ⚠️ **New finding [F46], and it is a trap worth remembering:
> `res.setHeader('Access-Control-Expose-Headers', ...)` REPLACES the global
> CORS list, it does not append.** T43's `/merchants` was overwriting all nine
> rate-limit headers with the single name `X-Total-Count`, so the limiter was
> enforced but unreadable from a browser on that route — the exact failure
> `EXPOSED_HEADERS` exists to prevent. **Fixed in T44 by moving the exposure
> into `config/security.ts`; both per-route calls are gone. Do not add one
> back.** It was latent (nothing reads those headers yet, and a 429 never
> reaches a handler), and it only showed up because the SPA's request was
> replayed **with an `Origin:` header** — a bare curl cannot see it. Replay
> cross-origin requests properly when testing anything CORS-adjacent.
>
> ⚠️ **[F48], and it wasted time twice this session: a stray `.ts` in the
> backend ROOT silently breaks `nest start --watch`.** `rootDir` is `./src`,
> so a sibling file fails the build with **TS6059** and the watcher keeps
> serving the **last good build** — your edit looks like it did nothing, and a
> mutation test looks like it passed. Same cause as [F23] (`jest.setup.ts` and
> `prisma/` are in `exclude` for exactly this). **Put throwaway scripts in
> `prisma/`** — it is already excluded and `@prisma/client` resolves there —
> and delete the emitted `.js`/`.js.map` afterwards, or you hit the *other*
> trap where jest OOMs on them. Run `npx tsc --noEmit` if a change seems not
> to take.
>
> ⚠️ **Session 22 found ~25 orphaned backend processes** — 13 stacked
> `npm run start:dev` + `nest` watcher pairs from previous sessions, all
> fighting over :4000, which is why an edited source file kept serving stale
> code and the kill-by-port command kept finding a *new* PID holding the port.
> Kill by **command line**, not by port:
> ```
> Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
>   Where-Object { $_.CommandLine -like '*glow-plus-backend*' -or $_.CommandLine -like '*run start:dev*' } |
>   ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
> ```
> Check for this before concluding a change "didn't take".
>
> **T43 is done: `GET /merchants` is the public salon directory.** Read its
> TASKS.md entry before touching that module; four decisions there are easy to
> undo by accident.
> 1. **`GET /merchants/public` is gone, not aliased.** The RN app calls
>    `/merchants` (`client.js:152`). Two paths serving one list is how the
>    shapes drift, and nothing is deployed yet. Its AuthMiddleware exclusion
>    is the **exact** path `merchants` — *not* `merchants/(.*)`, or
>    `GET /merchants/me` goes public with it.
> 2. **The body is a bare array on purpose, even though it paginates.**
>    `BookScreen.js:29` maps the response directly, so an `{ items, total }`
>    envelope breaks Order 2. The total is in **`X-Total-Count`**, and the
>    `Access-Control-Expose-Headers` line next to it is what makes that header
>    readable from a browser at all — delete it and the website silently reads
>    `null`.
> 3. **`styleCount`/`styleTypes` on each row are not decoration** — they exist
>    so the landing page stops calling `/styles/public/:id` once per salon.
>    Reverting them restores an N+1 above the fold.
> 4. **The founding count counts merchant ROWS, not badges, at every status.**
>    That is what `OnboardingService.signup` gates on. "Fixing" it to filter
>    `foundingMember: true` or `status: ACTIVE` makes the landing page
>    advertise spots that signup then refuses.
>
> **[F42] is closed and the SPA no longer reads `localStorage` for data at
> all** — `data.js` is down to the language preference. **[F44] was found
> while closing it and fixed here:** the portal's founding-member banner had
> never rendered once, because it tested `foundingBadge` (a prototype-only
> name) against a login response that carried no founding field at all, so the
> salons owed the extra free month were the ones told about the standard
> trial. **[F45] is new and deliberately left**: the directory sorts
> case-sensitively, so `glow bar downtown` lands after `Zenith Hair`. It needs
> a collation decision and belongs with **T52**.
>
> ⚠️ **If `npm test` dies with `FATAL ERROR: Zone Allocation failed`, look for
> a stray `.js`/`.js.map` in the backend root before you touch jest.config.**
> `npx ts-node` emits one beside any `.ts` you run there, jest's transform
> matches `.js`, and ts-jest then follows the sourcemap until it runs out of
> memory. Session 21 lost time to this.
>
> **Phase 6 is closed. Phase 7 (T46–T51) is under way — T46 ✅ T47 ✅.** T46
> was indeed mostly satisfied already, but verifying it rather than assuming
> it is what turned up the case-sensitivity defect. T47 was the one Phase 7
> task that changes the login response both clients read, and it is done with
> `token` preserved under that name.
>
> **T49–T51 are next and are the small ones** — API versioning (`/v1`),
> pagination on visits/bookings, and CORS for Expo web. All three are
> contract-shape changes that are cheap now and breaking later, which is the
> only reason they sit in Phase 7 at all.
>
> **T39 is done — the mobile pass found four real defects, not none.** Read
> its TASKS.md entry before touching `global.css`. The headline: **T36's
> `flex-wrap:wrap` fix for [F25] removed the horizontal overflow and created a
> vertical one** — the wrapped nav was 107px tall inside a `.topbar` with a
> fixed `height:52px`, so it spilled ~28px above the bar (over the promo bar)
> and ~28px below it (over the page heading). `scrollWidth` structurally
> cannot see that; it only looks sideways. **Do not "restore" `height:52px`.**
> Also fixed: the language `<select>` was inheriting `width:100%` from the
> form-field rule and rendering 302px wide (wrong at *every* width, desktop
> included), `.ptab` was drawing the browser-default `2px outset` border on
> three sides, and tap targets were below spec — `.link-btn` at **16px** was a
> flat WCAG 2.2 AA 2.5.8 failure. Findings 2 and 4 are **inherited from the
> prototype**, verified against `Glow-Plus-Website .html`, not migration
> regressions.
>
> **Arabic RTL at 390px is verified** — the one thing nobody had ever checked.
> 18 surfaces, `dir=rtl`, correct mirroring, zero overflow. Closed.
>
> **T39b: below 700px the nav collapses behind a hamburger** and the bar is
> **57px**. T39 as first delivered contained the nav but cost height — 103px,
> sticky — and the user asked for the mobile side to be made properly good, so
> that trade-off was taken rather than left standing. **700px, not 860px:**
> between the two the nav still fits one row, and hiding a nav that fits would
> be a regression. **Above 700px nothing changed** — the desktop header is a
> single 52px row and is deliberately untouched. The panel closes on selection,
> Escape and click-outside; `nav_menu` was added to **all 8** language blocks.
>
> **New finding [F43] — belongs to T40, not T39.** **18 i18n keys exist only in
> the `en` block**, so 7 of 8 languages fall back to English across the entire
> auth form (Email, Password, Sign in, Create account, verify banner, Log out).
> T35 added them *after* T40 was signed off, so T40 was correct when ticked —
> this is drift. The consumer tab labels and the portal's `Profile`/`Team`/
> `Billing` are hardcoded English literals, not keys at all. Select العربية and
> the page mirrors perfectly but the login form is in English. It is a
> translation task, not a layout one.
>
> **T38 also built `GET /admin/merchants`** — the ticket said "frontend-only"
> and was almost right. The API only exposed the PENDING slice, so a
> SUSPENDED salon was invisible and unreactivatable. Read T38's TASKS.md entry
> before touching the admin view; two decisions there are easy to undo by
> accident: **a 403 must not sign the admin out** (only a 401 does), and
> **"Reactivate" is `approve`** — there is no third endpoint.
>
> **Also open, unrelated to the website:** **T32** (M-Pesa — needs a client
> decision, do not start without one) and **T31c** (Nest 11 / Vite 8 majors,
> which should land before the client runs their own `npm audit`). **[F42]**:
> the landing page's founding-spots counter is the last `localStorage` read
> left in the SPA — it belongs to T43.
>
> ⚠️ **`@ThrottleCredentials()` will block you if you hammer login** while
> debugging — 20 attempts / 5 min per IP, then a **15-minute** block, and only
> **5 per email** (T26 [F3], working as designed). Session 19 hit the per-email
> tier on its third browser run; session 20 hit it too and restarted the
> backend three times to clear it. The throttler store is in-memory, so
> **restarting the backend clears it**; don't mistake the 429 for a broken
> login. ⚠️ Note also that killing the `npm run start:dev` wrapper **orphans
> the node child**, which keeps holding :4000 — see §4 for the kill-by-port
> command.
>
> Everything is committed and pushed; the working tree is clean. The DB is at
> seed state apart from bookings for the seeded consumer: 4 pre-existing rows
> (2026-08-23/24) plus **2 PENDING rows created by the T49 browser runs**,
> both at 2026-08-31. Deleting them was blocked by a permission prompt this
> session, so they are recorded here rather than silently left — they are
> harmless test data, but a booking count is not at seed baseline. Dev servers may still be running from the last session — see
> §4 for how to check and restart them.

> **Session 3 note (2026-08-23), kept for context:** the user asked, out of
> task order, for the HTML website to be converted to React + Vite. That is
> **done and verified** — see §11. It covers **T34 structurally** and satisfies
> **T40** and **T41**. It did not wire the site to the API; T35 and T36 have
> since done that for auth and the consumer flow, leaving T37–T38.

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

➡️ **Was NEXT as of session 16 — superseded, see §8:** T37, T38 and T39. T37 and T38 are done; only **T39** is left. T36 is done — see the session-17 entry below. Also still open: T32 (M-Pesa — needs a client decision; do not start without one).

➡️ **Previously: T32 or Phase 5 (T33+, the website build).** Check `TASKS.md` for the next unticked item, and see its new **"Message for the client"** section at the end for exactly what to say about T32 and the now-resolved T31b. **T31c** (Nest 11 / Vite 8 majors) is still open and should land before the client runs their own `npm audit`.

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

✅ **T36 — done 2026-08-24 (session 17), the consumer half of the SPA.** `ConsumerDashboard.jsx` and the landing page salon grid stopped reading `data.js` → `localStorage` [F9]; every number on a customer's screen is a live request now. Four tabs (Rewards / Book / Appointments / Visit history) reusing BusinessPortal's `.portal-tabs` markup so the two dashboards look like one product.

**Two Phase-6 endpoints were pulled forward because T36 was blocked on them**, and both are built to their full stated spec rather than as stopgaps, so both are ticked:

- **T42 `GET /me/rewards`** — `src/modules/me/`. Matches the RN app's `DEMO_REWARDS` field-for-field (that constant was written against this endpoint before it existed), plus three additive fields — `oneTime`/`eligible` on a reward, `expired` on a visit — so the website does not have to call `/redemptions/available` once per salon just to know whether a Redeem button is live. Progress maths is deliberately a copy of `RedemptionsService.progressFor`; the two were checked against each other **on the live API**, not assumed.
- **T45 `GET /visits/me`** — forced a guard restructure on `VisitsController`: its guards were controller-wide, and Nest *merges* controller- and handler-level guards, so a consumer-only route could not opt out of `RequireMerchantGuard`. Now per-route, same shape as `styles.controller.ts`. `GET /visits` re-checked: still 200 merchant / 403 consumer.

**Three real defects found and fixed — all introduced by earlier work, none of them pre-existing findings:**

1. **Anonymous visitors were firing authenticated requests from the landing page.** Every view stays mounted (`.view.active` toggles visibility, not existence), so the new panels' loaders called `GET /bookings/me` and `GET /visits/me` with no token — two 401s on first paint. And the 401 handler called `signOutConsumer()`, which *navigates*: a first-time visitor could be thrown off the marketing page onto a login form by a request they never made. Loaders are now gated on `currentConsumer`; the sign-out branch only fires when there is a session to end. **Generalise this** — any new panel added to a mounted-always view has the same trap.
2. **A points-threshold reward drew one punch dot per point** — the seeded "200 Points = $20 Off" rendered 200 dots. Dots now belong to `VISIT_COUNT` only; `POINTS_THRESHOLD` gets a meter.
3. **[F25]/T39 had got worse, not better:** T35's "Log out" button pushed the 390px document from the recorded 401px to **460px**, because `.topnav` does not wrap — the cause [F25] already named. `flex-wrap:wrap` fixes it. T39 is still open for the rest of the mobile pass.

Also: `input[type=email|password|date]` were missing from the CSS rule that styles form fields, so **T35's auth form had browser-default inputs** next to styled ones.

**29/29 checks in driven Chrome** against real servers and real Postgres — including `localStorage` proven empty while the salon grid still renders, on-screen points equal to `/me/rewards`, a redeem that re-locks the card, a booking whose slot (and the five overlapping starts a 90-minute service blocks) disappears from availability, and no overflow at 390px on any tab. Suite **230 passing** (was 218). Test rows deleted afterwards; DB back where it started.

⚠️ **Two things that will waste time on the next browser-driven task:**
- **T26's credential throttle is 20 attempts / 15 min** (`identity` tier). Repeated test runs hit it and login starts returning **429** — that is the rate limiter working, not a bug. Space the runs out, or restart the API (the throttler store is in-memory) to reset the counter.
- `${D}#ctab-x` is **two IDs on one element** and matches nothing. The panels are children of the view: `${D} #ctab-x`.

✅ **T38 — done 2026-08-24 (session 19), the admin half of the SPA. Phase 5 is now finished except T39.**

The ticket said "frontend-only" and was almost right — **one endpoint was missing**. T22 built admin login, the pending queue, approve/suspend and the three metrics routes. The gap was the **"All salons" list**: the API only ever exposed the PENDING slice, and a SUSPENDED or CANCELLED salon by definition never appears in a pending queue — so there was no way to *see* a suspended salon, let alone reactivate one. New `GET /admin/merchants?status=`, reusing `MerchantsService.listByStatus()`, which already selected through `MERCHANT_PUBLIC_SELECT` — so T17's `passwordHash`/`stripeCustomerId` allow-list [F31] covers the new route **by construction**, confirmed live.

**The admin view was the most misleading of the three dashboards, not merely the fakest.** "Approve" wrote `status:'ACTIVE'` **to the operator's own browser** [F9] — the salon stayed PENDING on the server, its owner saw no change, and the admin had no way to tell. Est. MRR was `activeSalons × 4999`, a number invented in the browser. And the topbar's Admin button opened all of it with **no sign-in at all**. It now has a real `POST /admin/login` gate, eight tiles from the three metrics endpoints, and live approve/suspend/reactivate against Postgres.

**Four decisions worth not undoing by accident:**
1. **`currentAdmin` is a third session**, beside `currentConsumer`/`currentMerchant`, on T22's separate `glowplus:token:admin` key — so an admin and a salon owner coexist in one browser. The T22 standalone `/admin/panel` page picks the SPA's session straight up with **no second sign-in**; verified.
2. **A 403 does NOT sign the admin out** — a deliberate divergence from `/admin/panel`, which reloads on 401 *or* 403. A 403 is a valid token refused *one* route; treating it as a dead session is how one unlucky endpoint logs an admin out of everything. Only 401 signs out, and by then `lib/api.js` has already dropped the token.
3. **"Reactivate" is `approve`** — the API has exactly two transitions; only the label differs, because only the admin's intent does. There is no third endpoint to go looking for.
4. **Suspend appears in the pending queue too** — it is how an application gets *rejected*. Without it the queue's only exit is promotion.

**Also fixed:** the prototype knew three merchant statuses; the schema has five, so **PAST_DUE and CANCELLED rendered the raw enum name** in the badge — invisible until now because no status was real.

**47/47 checks in driven Chrome** against real servers and real Postgres, with **every 4xx the run produced accounted for by name** (the cosmetic favicon 404, the test's own wrong-password 401, a deliberate 403 guard probe — nothing else). All eight tiles cross-checked field-by-field against the API's own JSON; approve/suspend/reactivate/reject each confirmed **in the database**, not in a response body; Est. MRR proved **$0.00 against the untouched seed and $49.99** after inserting one real 4999-cent subscription — which is the point of it being real; and **no overflow at 390px with real rows loaded**, closing T39's own caveat about the admin view having only been measured empty. Suite **261 passing** (was 251). Fixtures created **directly in Postgres**, not via `POST /merchants/signup` (which also creates a Stripe customer — T20 left three orphans that way), and fully deleted afterwards.

⚠️ **Correction to the note above, learned the hard way this session:** the credential throttle's per-email tier is **5 attempts / 15 min**, not 20 — 20/5min is the per-IP tier. A browser run that tests a wrong password *and* a right one costs 2, so the **third run of the session got blocked**. Restarting the backend clears the in-memory store.

→ **New finding [F42]:** the landing page's founding-spots counter (`Marketing.jsx`, `FoundingSpots`) is the **last `localStorage` read left in the SPA** — it reports 50 spots left on every fresh browser, forever. It needs a genuinely *public* count, so it belongs to **T43**, not T39.

✅ **T39 — done 2026-08-25 (session 20). Phase 5 is closed.** The mobile pass, and it was not a formality: four real defects, none of which a `scrollWidth` measurement could ever have caught.

**The important one is a lesson about [F25].** T36 closed [F25] by giving `.topnav` `flex-wrap:wrap` — correct, and it did remove the 401px horizontal overflow. But `.topbar` still had a fixed `height:52px`, so wrapping converted a horizontal overflow into a **vertical** one that three sessions of `scrollWidth 390` measurements reported as clean. At 390px the nav was **107px tall inside a 52px box**: its first row lay across the black promo bar, and the "For salons" / "Log out" row floated over the page heading. Fixed with `min-height:52px` + `padding:6px 22px`; measured bar 52 → **103px** with the nav fully inside it and page content starting exactly at its bottom edge. **Do not restore `height:52px`.**

**Three more, all confirmed against the original `Glow-Plus-Website .html` before being called regressions — two are inherited, not ours:**
- The language `<select>` inherited **`width:100%`** from the global form-field rule and rendered **302px wide**, a full-width form field lying across the promo bar and eating a whole nav row. Wrong at **every** width — the desktop header had it too. `.navbtn` overrides that rule's colours, radius and font, but never declares a width. Fixed with `.topnav select{width:auto;flex:0 0 auto;}` → 104px. **Inherited from the prototype.**
- `.ptab` set only `border-bottom`, so the other three sides kept the browser default `2px outset black` and every tab drew a grey box — on a phone the seven portal tabs wrap into a grid and read as a broken table. Fixed with `border:none` first. **Inherited from the prototype.**
- Tap targets: `.link-btn` (the auth switches) measured **16px tall**, a flat **WCAG 2.2 AA 2.5.8** failure (24px floor); `.toggle` 31px, `.navbtn` 33–35px, `.brand` 28px, all under 44px. Fixed with `min-height:44px` scoped to the `≤860px` query only — a pointer has no such problem, and growing the desktop chrome would be a design change rather than a fix.

**Arabic RTL at 390px is verified** — T39's one genuinely open unknown. 18 surfaces, all `dir=rtl`, correct mirroring of the stat row, form alignment, list cards and tab strip, **zero** horizontal overflow. The defects found there were the same LTR ones, not RTL-specific.

**Evidence:** real Chrome (`puppeteer-core`, scratchpad-only, not added to the repo), real dev servers, real Postgres, signed in as all three roles, every surface measured in **both** English and Arabic. Before → after at 390px: WCAG `<24px` failures **2 → 0**, sub-44px targets **6–11 per surface → 0**, overflow **0 → 0** (already clean). Desktop re-measured at 1280px to prove nothing regressed: bar still exactly **52px**, nav now inside it (was spilling 72px out of 52px), select 453.9 → 104px. `npm run build` clean, `tsc --noEmit` clean, **261 passing** (unchanged — CSS only, one file, 39 lines). DB untouched, at exact seed state.

⚠️ **Knowing trade-off:** the mobile header is now **103px of a 844px viewport, and sticky**, because seven controls at 44px cannot fit one row at 390px. Containment was the fix; making it *short* means collapsing to a hamburger, which would be the first real departure from the prototype's shell — a design call for the user/client, not something to change silently. Dropping `flex-wrap` from `.topbar` itself (keeping it only on `.topnav`) already cut this from 153px to 103px by keeping the brand on the nav's first row.

✅ **T39b — the mobile nav, made good rather than merely correct (same session).** T39 shipped a header that was *contained but ugly*: 103px of a 844px viewport, sticky, with the nav wrapping wherever the width ran out. Shown the result, the user said to make the mobile side properly good — so the trade-off T39 had recorded was taken instead of left standing.

**Below 700px the nav is now a drop panel behind a toggle; the bar is back to 57px.** Above 700px **nothing changed** — desktop re-measured at 1280px: bar exactly 52px, nav inside it, switcher 104px. The breakpoint is 700px and not the 860px the rest of the mobile query uses, because between the two the seven controls still fit one row at a 44px tap target and hiding a nav that fits would be a regression.

`TopBar.jsx` holds the toggle and its `open` state. **The panel closes on selection, on Escape, and on a click outside** — each covers a real failure: without the first, tapping "Home" leaves the panel covering the page it just navigated to; without the last, the only exit from an accidentally-opened menu is the toggle. `aria-expanded`/`aria-controls`/`aria-label` are wired, and **`nav_menu` was added to all 8 language blocks** — a string this change introduced, so translating it is doing the new work properly, not paying down [F43].

**Two defects only a human eye caught, worth remembering because no measurement would have flagged either.** (1) The prototype's plain `.navbtn` is borderless — only `.ghost` outlines — which reads fine as one inline row but made "My rewards" look like a *gap between two pills* once stacked. (2) The switcher's centred label left its caret stranded at the far edge, because a `<select>` paints its caret against the inline-end edge regardless of `text-align`. The fix needs `select.navbtn`, **not** bare `select`: the switcher carries `.navbtn`, so the panel's centring rule outranks a plain element selector. Its `padding` moved out of an inline style into the stylesheet for the same specificity reason.

**Evidence:** 8/8 behavioural checks in real Chrome at 390px (starts closed · toggle opens · toggle closes · Escape · click-outside · selection closes *and* navigates · bar 103 → **57px**); toggle 44×44 with `aria-label` "Menu"; geometry swept at **390/430/600/700/760/900/1280** with the toggle appearing at ≤700 and gone above, the panel always below the bar, and `scrollWidth` equal to the viewport at every width. Both full audits re-run: 18 surfaces each in English and Arabic, **0** WCAG failures, **0** sub-44px targets, **0** overflow, 18/18 `dir=rtl`. Build clean, **261 passing**, DB untouched.

→ **New finding [F43], recorded not fixed — it belongs to T40.** With Arabic selected the page mirrors perfectly and the login form stays in **English**. **18 keys exist only in the `en` block** of `translations.js` (`label_email`, `label_password`, `auth_logout`, `auth_continue`, `auth_signup_success`, `auth_verify_banner`, `auth_toggle_to_login`/`_signup`, `auth_resend_verification`/`_sent`, `consumer_login_submit`/`_signup_submit`, `business_login_submit`/`_signup_submit`, `added`, `card`, `salon`, `unlocked`), so **7 of 8 languages fall back to English**. T35 added them *after* T40 was signed off — T40 was correct when ticked; this is drift. Separately, the consumer dashboard's four tab labels and the portal's `Profile`/`Team`/`Billing` are hardcoded English literals, not keys at all. It is a translation task, not a layout one, and folding it into T39 would have mixed two concerns in one commit.


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
| **F25** | ✅ **RESOLVED 2026-08-24 by T36.** ~~**Mobile overflows horizontally.** At a 390px viewport the document is 401px wide — the `.topnav` buttons don't wrap.~~ `flex-wrap:wrap` on `.topnav` (shared shell, so it fixes every view at once); re-measured at **390px on all six SPA views**. T39 stays open, but for the qualitative mobile pass — the overflow number is no longer the thing to chase. |
| **F26** | **`footer_note` is now factually wrong.** It reads "data is shared & persisted live for everyone previewing this page" — true of the artifact's shared `window.storage`, false of per-browser `localStorage`. Needs a copy change or the API wiring that makes it true again. |

### What this does and doesn't close in TASKS.md

- ✅ **T34** (project setup) — structurally done: framework, entry points, routing, storage seam
- ✅ **T40** (preserve i18n) — all 8 languages + Arabic RTL verified
- ✅ **T41** (keep verify-email + billing-result working) — verified in every state
- ✅ **T35** (auth UI) — done 2026-08-24 · ✅ **T36** (consumer flow) — done 2026-08-24
- ✅ **T37** (merchant portal against the **real API**) — done 2026-08-24; it also built the reward-rules HTTP layer the portal needed
- ✅ **T38** (admin panel against the **real API**) — done 2026-08-24; it also built `GET /admin/merchants`, the one endpoint the ticket assumed already existed
- ⬜ **T39** (mobile-friendly) — still open, but **[F25] is closed** (T36): every view now measures 390px at a 390px viewport. What remains is the qualitative pass, not the overflow.
- ⚠️ **Blocked on missing endpoints** — `GET /me/rewards` (**T42**) and
  `GET /visits/me` (**T45**) were the consumer half of this and both now exist
  (built by T36, 2026-08-24). What remains blocking is **T37**: the
  **reward-rules module still has no HTTP routes at all**, so the merchant
  portal cannot manage reward rules against the API.
  `GET /merchants` public directory (**T43**) and `GET /styles/public/:merchantId`
  (**T44**) now partially exist — **T18** (2026-08-24) added minimal versions
  (`/merchants/public`, `/styles/public/:merchantId`) to unblock the standalone
  booking page. They're stopgaps, not the final shape (no pagination/search) —
  T43/T44 are still open, but the SPA's future salon-directory view can likely
  reuse them as-is.
