# Glow+ website — HTML → React + Vite migration

This project replaces the two pre-migration frontends with one Vite app. It is
a **structural migration**: same design, same content, same behaviour. Wiring
the site to the Glow+ backend API is deliberately *not* part of this pass — see
[Not done here](#not-done-here).

## Source → target

| Original | Lines | Became |
|---|---|---|
| `website/Glow-Plus-Website .html` | 1,932 | `index.html` + `src/` (6 views) |
| `glow-plus-frontend/public/verify-email.html` | 103 | `verify-email.html` + `src/pages/verify-email/` |
| `glow-plus-frontend/public/billing-result.html` | 84 | `billing-result.html` + `src/pages/billing-result/` |
| `glow-plus-frontend/server.js` | 45 | `vite.config.js` route rewrites + `vercel.json` |

The originals were left in place, untouched, as the reference for verification.

### Extracted verbatim (not retyped)

- **`src/styles/global.css`** — the original `<style>` block (lines 12–256), copied
  byte-for-byte with `sed`. The only addition is a commented `#root{display:contents}`
  rule so React's mount node contributes no box of its own.
- **`src/i18n/translations.js`** — the `I18N` object and `LANG_NAMES` (lines 627,
  630–1352), also copied with `sed`. All 8 languages intact: `en, es, fr, de,
  pt, zh, ja, ar`, Arabic still driving `document.documentElement.dir = 'rtl'`.

### Three entry points, not one SPA

`verify-email` and `billing-result` ship their own self-contained stylesheets that
style bare `body`, `.card`, `h1` and `p`. Keeping them as **separate documents**
is what guarantees they stay pixel-identical rather than colliding with the main
site's global stylesheet.

The backend has these two URLs baked in (`APP_URL`, and `billing.service.ts`'s
`success_url` / `cancel_url`), so they could not change:

| URL | Serves |
|---|---|
| `/verify-email` | `verify-email.html` |
| `/business/billing` | `billing-result.html` |

Express used to do that mapping. Now a small Vite plugin does it in dev and
preview, and `vercel.json` does it in production. **Any other host needs the
same two rewrites.**

## The one deliberate behaviour change

The prototype persisted through `window.storage` — a Claude-artifact API that
**does not exist in a real browser**. Every read was wrapped in `try/catch`
returning a fallback, so in an actual browser the site accepted input, saved
nothing, and showed empty lists. Silently.

`src/lib/storage.js` keeps that exact async contract but backs it with
`localStorage`, so every caller in `src/lib/data.js` ported over unchanged.

**This is the single seam where the real API goes.** Replace the two methods in
`storage.js` and nothing else in the app needs to change.

## Verification

Both checks run against the original (served on `:8080`) and the migrated app
side by side, in a real Chromium.

**Layout fingerprint** — for every element in document order: tag, class, id,
text and rounded bounding rect.

```
desktop (1280x900): 276 vs 276 elements — IDENTICAL
mobile  (390x844):  276 vs 276 elements — IDENTICAL
```

**Functional pass** — 67 checks, all passing: marketing render, punch-card
animation, all 8 languages + Arabic RTL, business signup, styles CRUD, reward
rules, visit logging, reward-trigger modulo maths, portal stats, ledger,
consumer dashboard, admin approve/suspend, persistence across reload, both
Stripe/verify pages in every state, mobile width, zero console errors.

## Carried over as-is (pre-existing, NOT introduced here)

These are original defects. They were reproduced faithfully rather than
silently "fixed", because fixing them changes behaviour or design.

1. **The auth-switch links do nothing.** The markup nested a "Go to business
   login" / "Go to customer login" anchor inside a `[data-i18n]` element, but
   `applyStaticTranslations()` overwrote that element's `innerHTML` with the
   plain-text translation — destroying the anchor on first render. The
   `business_login_link` translation key exists in all 8 languages and is never
   used. One-line fix available; needs a design call.

2. **Horizontal overflow on mobile.** At a 390px viewport the document is 401px
   wide because the `.topnav` buttons do not wrap. Measured identically on the
   original. This is `TASKS.md` **T39**.

3. **The footer claims shared persistence.** `footer_note` reads "data is shared
   & persisted live for everyone previewing this page". That was true of the
   artifact's `window.storage`; with `localStorage` the data is now per-browser.
   The string is untouched — it needs a copy change, or the API wiring that
   makes it true again.

4. **Language default.** The prototype fell back to `navigator.language` only
   because `window.storage` threw. That fallback is now explicit, so behaviour
   users actually saw is preserved: stored preference → browser language → `en`.

## Not done here

The site still talks to `localStorage`, not the Glow+ API — that is Phase 5/6 in
`TASKS.md`, and several endpoints the views need do not exist yet:

- no public salon directory (`/merchants` has only `signup`, `login`, `me`) — **T43**
- no `/me/rewards`, no `/visits/me` — the consumer dashboard is unbacked — **T42, T45**
- `reward-rules` module has **no controller at all** — the Rules tab has no routes
- `/styles` is merchant-scoped and behind `RequireActiveSubscription`, so it
  cannot serve consumers — **T44**

`verify-email` and `billing-result` **do** call the real backend, exactly as
before — those were the only working API calls in the delivery and they are
unchanged.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run preview
```

Port 3000 matches the backend's `APP_URL` / `ALLOWED_ORIGINS`.

Configure the API base with `VITE_API_BASE_URL` (see `.env.example`); it
defaults to `http://localhost:4000` and is still exposed as
`window.GLOW_API_BASE_URL`, the same global the old `/config.js` route set.

### One environment gotcha

There is a stray `C:\Users\GCA\Documents\postcss.config.js` **outside this
project** that requires `tailwindcss`. Vite walks up the tree looking for a
PostCSS config and would fail the build on it, so `vite.config.js` declares
`css.postcss` inline to stop the search. Don't remove that block.
