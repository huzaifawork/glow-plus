# Glow+ Mobile

The consumer companion app for Glow+ — iOS and Android from one React Native
(Expo) codebase. Track loyalty points across every salon you visit, and book
appointments.

Built to `Glow-Plus-App-Requirements-Spec`. **`context-mobile.md` at the repo
root is the document to read before changing anything here** — it maps every
requirement to the file that implements it and records the decisions that are
easy to undo by accident.

---

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (App Store / Play Store). Same bundle, both
platforms.

### Demo mode — no backend needed

Settings → **Demo mode**. Every screen runs on realistic in-memory data
(`src/api/demo.js`) that mutates as you use it: a booking you make appears in
My Bookings, cancelling changes its status, and the slot you took disappears
from availability. Any email and password signs you in.

This is requirement **R5.1** — the app must be reviewable without a live
backend.

### Pointing at a backend

The API address is **configuration, never a literal in the source** (R5.2).
Three sources, highest precedence first:

| Source | Set it in | For |
|---|---|---|
| Runtime override | Settings → Backend address | QA on a build you cannot rebuild |
| `EXPO_PUBLIC_API_BASE_URL` | the environment / an EAS build profile | CI, per-channel builds |
| `expo.extra.apiBaseUrl` | `app.json` | the shipped default |

It must include the API version, e.g.
`https://glow-plus-api-six.vercel.app/v1`. Settings has a **Test connection**
button that probes `/health` (which is version-neutral on the platform, so the
prefix is stripped for that one call).

### Sign in with Google

Google sign-in runs through **Supabase Auth**, and it is **off until it is
configured** — an unconfigured build simply does not show the button, and email
and password sign-in is unaffected. Three things have to line up.

**1. Supabase — enable the provider.** In the Supabase dashboard:

- **Authentication → Providers → Google**: turn it on, and paste in the OAuth
  **client ID** and **client secret** from a Google Cloud project (APIs &
  Services → Credentials → OAuth client ID → *Web application*).
- Copy the **Callback URL** Supabase shows on that page
  (`https://<project-ref>.supabase.co/auth/v1/callback`) into the Google
  client's **Authorised redirect URIs**. Google refuses the sign-in with
  `redirect_uri_mismatch` if this is missing, and that error appears inside
  Google's page, not in the app.
- **Authentication → URL Configuration → Redirect URLs**: add
  `glowplus://auth-callback`. Supabase silently redirects to the project's Site
  URL instead of anything it does not recognise, which presents as "the browser
  opened, I signed in, and nothing happened".

**2. The app — point it at the project.** Same shape as the API address above.
Supabase → **Project Settings → API Keys** offers two: take the **anon** key,
labelled **publishable** (`sb_publishable_…`) on newer projects. Either format
works and both are designed to ship inside a client. The **`service_role` /
secret key must never go in this app** — it bypasses every row-level-security
policy in the database, and here it would be on every phone that installs the
app:

| Source | Set it in |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the environment / an EAS build profile |
| `expo.extra.supabaseUrl` / `expo.extra.supabaseAnonKey` | `app.json` |

Both come from Supabase → **Project Settings → API Keys**.

**3. The API — let it verify the token.** Set `SUPABASE_URL` and
`SUPABASE_ANON_KEY` on the backend (Vercel → Settings → Environment Variables)
and redeploy. Without them `POST /auth/google` answers **503** with a message
naming the two variables; every other route is unaffected, which is why they
are deliberately *not* in the API's required-env list.

#### How it fits together

```
app  ──▶ Supabase /auth/v1/authorize?provider=google   (system browser, PKCE)
                    └──▶ Google consent ──▶ back to glowplus://auth-callback?code=…
app  ──▶ Supabase /auth/v1/token?grant_type=pkce       → a Supabase access token
app  ──▶ Glow+  POST /auth/google { accessToken }      → the SAME session
                                                          POST /auth/login issues
```

The last step is the important one. The app's session is always a **Glow+**
session — the token pair in the keychain, the 15-minute refresh, `GET /me`,
sign-out. Supabase is used to answer one question ("which Google-verified email
address is this?") and nothing of it is kept. The account is matched on that
address, so someone who signed up on the website with a password and taps
*Continue with Google* lands in **their** account, with their points and
bookings, rather than a duplicate.

**In Expo Go** the redirect is an `exp://…` URL that changes with your LAN
address, and it has to be on the Supabase allow-list too. Testing Google
sign-in is easier on a development build, where the redirect is always
`glowplus://auth-callback`.

---

## Architecture

```
App.js                      providers, in dependency order — read its header
src/
  api/         client.js    THE ONLY PLACE THIS APP CALLS fetch
               config.js    where the backend is (R5.2) + demo toggle (R5.1)
               session.js   the token pair, in the OS keychain (R1.4/NF2)
               demo.js      the offline backend (R5.1)
               errors.js    ApiError vs NetworkError (NF4)
               supabase.js  Google sign-in via Supabase Auth (PKCE) — the ONE
                            exception to rule 1 below, and it never touches
                            the Glow+ API
  components/  ui/          primitives: Button, Card, Sheet, Pill, …
               salon/       SalonCard, SalonLogo, AvailabilityPill, …
               rewards/     PointsSummary, RewardProgress, PunchDots, …
               booking/     ServiceRow, DateStrip, TimeSlotGrid, …
               bookings/    BookingCard, StatusPill, …
  context/     Config, Auth, Location, Network, Notification, Toast
  hooks/       useAsyncData, useDebouncedValue, useSalonCapacities
  navigation/  RootNavigator (native stack) + TabNavigator
  screens/     auth/ rewards/ discover/ bookings/ settings/
  theme/       every colour, space, radius and type size in the app
  utils/       datetime (salon timezone), distance (on-device), format
```

### Three rules that are requirements, not preferences

**1. All network access goes through `src/api/client.js`.** No other file may
call `fetch`. That is the spec's Technical Constraints, in as many words: *"the
API contract is defined and changed in exactly one place."* `api/supabase.js`
calls a different service entirely — it never touches the Glow+ API, and hands
what it gets to `client.loginWithGoogle` — so the contract still lives in one
file. Nothing outside `src/api/` calls `fetch`.

**2. Availability is computed by the SERVER, never here.** R3.5 requires the
fully-booked indicator to be *"computed centrally … rather than calculated
independently inside the app, so the app and any other Glow+ surface never
disagree."* `AvailabilityPill` renders `capacity.state` from
`GET /merchants/:id/capacity?date=`. There is no slot generation and no
availability arithmetic anywhere in this codebase.

**3. The user's location never leaves the device.** NF6. Distance is computed
in `src/utils/distance.js` from the salons' published coordinates. There is no
request in `client.js` that carries a latitude, and adding one needs a decision
about NF6 first.

---

## Tests

```bash
npm test
```

94 tests over the pure logic — distance and the no-location fallbacks, the
salon-timezone date handling, the R3.5 wording and R2.3 reward maths, and the
demo backend's shape and mutation. UI is verified by running the app; see
"Before release" below.

Type/import correctness across the whole tree is checked by bundling:

```bash
npx expo export --platform android --output-dir /tmp/glow-export
```

---

## Before release

**NF3 requires testing on real iOS and Android devices, not build-tool checks
alone.** These need a physical device and are not covered by anything in this
repo:

- push notifications end to end (a simulator cannot mint an Expo push token)
- the location permission dialog, and the deny → Settings path
- keychain persistence across a real app kill and relaunch
- the OS-level "notifications denied" state

## Store builds

```bash
npm install -g eas-cli
eas login
eas build:configure
npm run build:android   # .aab
npm run build:ios       # .ipa  (needs an Apple Developer account)
```

Push notifications additionally need an EAS project id in
`expo.extra.eas.projectId` — `eas build:configure` writes it.
