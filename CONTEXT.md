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

## 4. Environment — CURRENT STATE

| Thing | Status |
|---|---|
| Docker Desktop | ✅ Installed and running (v29.7.2) |
| Postgres | ✅ **Running now** — container `docker-postgres-1`, Postgres 16.15 on **port 5433**, database `glowplus`, **no tables yet** (migrations not run) |
| Node / npm | ✅ v24.11.1 / 11.6.2 (note: newer than NestJS 10 / Prisma 5 typically target) |
| Git | ✅ v2.53 installed — **but the project is NOT yet a git repo** |
| Stripe CLI | ✅ Already vendored at `website/website/stripe.exe` (v1.45.2) |
| npm dependencies | ✅ Already installed in both backend and frontend |
| Backend server | ❌ Not running — **source does not compile** (see F14 below) |
| Website helper | ❌ Not running (verified working earlier on :3000) |

**Restart Postgres if needed:**
```
cd website/website/glow-plus-backend/glow-plus-backend
docker compose -f docker/docker-compose.yml up -d postgres
```
⚠️ `docker` is NOT on Git Bash's PATH in this environment — **use the PowerShell tool** for docker commands.

## 5. Where the code lives

```
joziilunga-attachments/
├─ TASKS.md          ← the task list (source of truth)
├─ CONTEXT.md        ← this file
├─ Software Developer Project Experience.docx   ← client's requirements doc
├─ glow-plus-mobile app/     ← Order 2. DO NOT EDIT.
└─ website/website/
   ├─ Glow-Plus-Website .html      ← the design prototype (1,932 lines)
   ├─ stripe.exe
   ├─ glow-plus-frontend/          ← tiny Express helper, 2 real pages
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
| **F4** | Nothing writes to the `Redemption` table. |
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

## 8. EXACTLY where to resume

**T1 was started and is PARTIALLY done.** Two files were written; nothing was committed and git was NOT initialised.

✅ **Already done:**
1. Created `.gitignore` at the project root (ignores `.env`, `node_modules/`, `dist/`, `stripe.exe`, `*.zip`, etc.)
2. Sanitized `website/website/glow-plus-backend/glow-plus-backend/.env.example` — it had **real Stripe and Resend secrets** in it, now replaced with placeholders. (The real values remain in `.env`, which is gitignored.)

⬜ **Still to do to finish T1:**
3. `git init` at `c:\Users\GCA\Documents\joziilunga-attachments`
4. `git add -A`, then **carefully review `git status`** to confirm no `.env`, no `node_modules`, no `.zip`, no `stripe.exe` is staged
5. First commit
6. Create the GitHub repo and push

**Then:** T2 (optional — see below) → **T13/T14** (merge schemas, relocate the nested booking delivery, fix imports, wire the modules) — these are required before the backend can compile or boot at all.

⚠️ **Not every task in `TASKS.md` was requested by the client.** See the "Where each task comes from" section at the top of that file. In particular **T2 is mine, cosmetic, and optional** — flattening `website/website/glow-plus-backend/glow-plus-backend/`. Do not confuse it with **T13**, which relocates `src/modules/booking/src/modules/…` and is **mandatory** because it causes the 7 compile errors.

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
The live Stripe secret key, webhook secret, and Resend API key travelled through a zip file, Fiverr chat, **and were sitting in `.env.example`** (a file normally committed to git). The client's Vercel token was also pasted into Fiverr chat. **Tell the client in writing to rotate all of them.** If that account is later abused, the record should show it was flagged.

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
