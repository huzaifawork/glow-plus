# Glow+ — Handover Checklist

**Status: all 65 development tasks are complete.** The application is built, deployed, and verified
end to end on the developer's infrastructure. Everything below is what remains to move it to the
client's accounts and open it to real customers.

| | Currently live (developer's accounts — temporary) |
|---|---|
| **API** | https://glow-plus-api.vercel.app |
| **Website** | https://glow-plus-web-eight.vercel.app |
| **Database** | Supabase `xhyoeiltwcciqowlwyov`, `us-east-1`, Postgres 17.6 |
| **Tests** | 474 passing (459 unit + 15 integration), CI green |

---

## A. Deploying to the client's accounts

Do these in order. Steps 1–3 must not be reordered.

### 1. Deploy the backend first

The frontend cannot be built until the API's final URL exists — **Vite inlines `VITE_API_BASE_URL`
at build time**, so the URL is baked into the JavaScript bundle. Pointing an existing build at a new
API is not possible; it must be rebuilt.

```
cd website/website/glow-plus-backend/glow-plus-backend
npx vercel link --yes --project glow-plus-api
npx vercel --prod --yes
```

> ⚠️ **Always put the `cd` in the same command as `vercel`.** Running it from the repository root
> deploys the whole repo — it once uploaded 130MB and failed, because **Vercel honours
> `.vercelignore`, not `.gitignore`**, so the git-ignored 129MB `website.zip` was sent anyway.

### 2. Set the backend environment variables

16 variables. `DEPLOYMENT.md` in the backend directory is the authoritative inventory — it lists what
each one is and **what specifically breaks when it is wrong**. The application **refuses to boot** on
a missing or placeholder value and reports every problem at once, so a wrong variable fails loudly at
deploy rather than silently at runtime.

> ⚠️ **`vercel env pull` writes `[SENSITIVE]` in place of secret values.** It cannot be used to read a
> secret back. This cost two wrong deploys during testing — a webhook signature was computed with the
> literal string `"[SENSITIVE]"` and the failure was misdiagnosed as a platform bug.

### 3. Build and deploy the frontend against the new API URL

```
cd website/website/glow-plus-web
npx vercel link --yes --project glow-plus-web
# Set VITE_API_BASE_URL to <new API origin>/v1 — note the /v1
npx vercel --prod --yes
```

> ⚠️ `VITE_`-prefixed variables **cannot be stored as secret** — Vite inlines them into the browser
> bundle, so they are public by definition. Use `--no-sensitive`. This is only the API URL.

### 4. Point the backend back at the real website origin

`ALLOWED_ORIGINS` and `APP_URL` must be the frontend's final URL. Get this wrong and every browser
request fails CORS, and every password-reset email links to the wrong place.
**Vercel requires a redeploy for environment changes to take effect.**

### 5. Transfer the Supabase project

A **project transfer** into the client's organisation — not a re-migration, and not a new project.
The database, its data and its connection strings all survive. Changing region later is a
dump-and-restore, so keep `us-east-1`: the API runs in `iad1` (same AWS region), which is why
`/health/ready` measures **19ms** instead of the 1,800ms seen from a laptop.

---

## B. Security actions — do these before real customers

### 6. Rotate the exposed credentials ⚠️ **highest priority**

These travelled through a zip file, Fiverr chat, and `.env.example`. **Rotate in this order:**

| Credential | Why | Urgency |
|---|---|---|
| **`RESEND_API_KEY`** | **Live — Resend has no test mode.** Anyone holding it can send email *as this account*. | **First** |
| **Vercel token** | Was pasted into Fiverr chat. | First |
| `STRIPE_SECRET_KEY` | `sk_test_` — cannot move real money. Replaced anyway at step 8. | With step 8 |
| `STRIPE_WEBHOOK_SECRET` | Test-mode endpoint; replaced at step 8. | With step 8 |

A spare Resend key named `glow-plus-dev` exists and has **never been used** — delete it during rotation.

### 7. Hand over the administrator account

**`admin@glowplusmember.com`** exists on production. Its password is in the gitignored `.env` under
`# PRODUCTION ADMIN` and **exists nowhere else** — it is not recoverable, only resettable.

> **Why this account matters more than it looks:** every salon signs up `PENDING`, and only an admin
> can approve one. Without a working admin, **no salon can ever go live**. There is deliberately no
> admin signup route; use `npm run create-admin <email> <password>` to add more.

### 8. Go live on Stripe

The current endpoint is **test mode**, so no real money can move — correct for validation, wrong for launch.

1. Swap `STRIPE_SECRET_KEY` to the live key.
2. **Create a new webhook endpoint in *live* mode** pointing at `<API origin>/v1/billing/webhook`.
   A test-mode endpoint receives no live events, and its signing secret is different.
3. Subscribe it to exactly these five events — the only ones the code acts on:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`, `customer.subscription.trial_will_end`.
4. Set the new `STRIPE_WEBHOOK_SECRET` and **redeploy**.
5. Verify with a real test purchase — the subscription should activate automatically.

---

## C. Operations

### 9. Choose a Supabase plan ⚠️ **decision needed before real data**

**The free plan takes no backups at all** — no daily snapshot, no point-in-time recovery. A dropped
table or a bad migration is unrecoverable. **Pro (~$25/mo)** adds daily backups and 7-day PITR.

Until then, `npm run backup` produces a complete logical snapshot. It is a safety net, not a
substitute: it captures data (not schema) at the moment a human remembers to run it.

The free plan also **autosuspends after ~1 week idle**, so a quiet launch week looks exactly like an outage.

### 10. Set up uptime monitoring

Point any monitor (UptimeRobot, Better Stack — both free) at **`<API origin>/health/ready`**. It
returns 200 with database latency, or 503 with the failure code. Its traffic also prevents the
autosuspend above.

### 11. Enable CI migrations (optional)

Set `DIRECT_URL` in **Settings → Secrets and variables → Actions**, using the **session pooler
(`:5432`)** connection string. Until set, the job **skips cleanly** rather than failing, and
migrations stay manual. Do **not** use Supabase's "Direct connection" host — it is IPv6-only on the
free plan and unreachable from GitHub's IPv4 runners.

### 12. Complete the legal documents

`privacy.html` and `terms.html` are live and accurate about what the software does, but every
business-specific field is a visible `[TO BE COMPLETED]`: registered business name, address, contact
email, currency, governing jurisdiction, minimum age.

> **Both documents must be reviewed by a lawyer before publication.** Describing what the software
> provably does is engineering; asserting it satisfies a statute is not.

---

## D. Decisions only the client can make

None of these are defects. Each is a product question the code cannot answer.

| # | Question |
|---|---|
| **F50** | Paying bypasses admin approval — should a salon that pays go live without review? |
| **F71** | A customer keeps seeing points and a **Redeem button** at a salon that stopped paying. Should points survive a salon leaving? Should the reward stay redeemable, or read *"no longer on Glow+"*? |
| **F72** | Salon signup calls Stripe **before** writing the row, so a **Stripe outage blocks all signups**. Deferring customer creation to checkout would remove that dependency. |
| **F63** | Appointment times render in the **browser's** timezone, not the salon's. |
| **T32** | **There is no M-Pesa/Daraja code in the repository at all.** The requirements document describes securing its webhook as though it exists. This is a from-scratch build and unpriced. |
| **T67** | Business registration — client action, not development work. |

---

## E. Known gaps, deliberately not closed

| # | Gap | Why it was left |
|---|---|---|
| **F68** | The 10 standalone pages (reset, verify, billing, staff…) are **English in all 8 languages**. RTL and `lang` *are* fixed, so Arabic lays out correctly. | ~224 keys × 8 languages ≈ **1,792 strings**, more than doubling the existing dictionary. Shipping ~672 unreviewed Arabic/CJK strings on a **billing** screen is worse than English. → **T40, post-launch** |
| **T31c** | Nest 10 → 11, Vite 7 → 8 | Major-version upgrades days before launch trade a working system for an unknown one. |

---

## F. Two things to raise with the client in writing

Both are stated as fact in the requirements document, and both were verified by running the code.

1. **There is no M-Pesa / Daraja integration.** The document describes securing its webhook; no such
   code exists anywhere in the repository. This is a from-scratch build, not a fix.
2. **Phone numbers were not encrypted** when the document claimed they were. They are **now**
   (AES-256-GCM, T31b) — which is why the privacy policy can state it truthfully. Had the policy been
   written from the document beforehand, it would have asserted protection that did not exist.
