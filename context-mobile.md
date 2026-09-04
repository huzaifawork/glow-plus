# context-mobile.md

**The Glow+ mobile app — what was built, where each requirement lives, and the
decisions that must not be undone by accident.**

Read this before changing anything in `glow-plus-mobile app/`. The root
`CONTEXT.md` covers the platform and the website; this file covers the app and
the changes the app forced onto the shared backend.

Written 2026-09-04, against `Glow-Plus-App-Requirements-Spec (2).docx`. (Both
`.docx` files in the repo root are **byte-identical** — same MD5,
`0f920085c896d8cdb6643c22f4670b29` — so there is one spec, not two.)

---

## 1. What this app is

One role: **the Consumer** (spec §3). No merchant login, no admin login, no
role switch. Section 6's non-goals are met by those screens *not existing*
rather than being hidden.

React Native via Expo, iOS + Android from one codebase (§2, §7).

**SDK 57** (React 19.2.3, React Native 0.86.3, React Navigation 7). Upgraded
from SDK 51 on 2026-09-04 for a reason worth recording: **iOS only ever allows
the latest Expo Go**, and it refuses to open a project built for an older SDK.
The reviewer's phone had the SDK 57 client, so the project had to move — there
is no downgrade path on iOS. Five things broke and were fixed:
`babel-preset-expo` had to become an explicit dependency; the notification
handler's `shouldShowAlert` split into `shouldShowBanner`/`shouldShowList`;
React Navigation 7 dropped `headerBackTitleVisible` for
`headerBackButtonDisplayMode`; `Constants.manifest` is gone; and `splash` moved
out of the app config root into the `expo-splash-screen` plugin.

⚠️ **Push notifications (R4.5) cannot run in Expo Go at all** — removed from
it in SDK 53. And `expo-notifications` does not degrade quietly: importing it
in Expo Go **throws at module-evaluation time**, which a static `import` makes
unpreventable, taking the whole app down on a red screen over one optional
feature. So `NotificationContext` pulls it in with a guarded `require()` and
treats its absence as normal. In Expo Go the app is fully usable and Settings
says notifications need a development build; in a real build the feature works
unchanged. R4.5 is the spec's only "should", and it is the one requirement the
review client cannot exercise.

| | |
|---|---|
| App | `glow-plus-mobile app/glow-plus-mobile app/` |
| Backend | `website/website/glow-plus-backend/glow-plus-backend/` — **the same NestJS API the website uses** (NF1) |
| Website | `website/website/glow-plus-web/` |
| Live API | `https://glow-plus-api-six.vercel.app/v1` (note the `-six`) |

### Status

| | |
|---|---|
| App bundles | ✅ 1115 modules, 0 errors (`expo export --platform android`) |
| App tests | ✅ **73 passing** (`npm test`) |
| Backend typecheck | ✅ 0 errors (`npx tsc --noEmit`) |
| Backend tests | ✅ **568 passing**, 36 suites (was 541 before this work) |
| Website build | ✅ `npm run build` clean |
| **Real-device testing (NF3)** | ❌ **NOT DONE — see §8** |

---

## 2. Requirement → file

Every requirement in spec §4 and §5. If you change one of these files, this is
the requirement you are changing.

### 4.1 Authentication

| Req | Where |
|---|---|
| R1.1 create account (name, email, password, optional phone) | `src/screens/auth/SignUpScreen.js` → `client.signup` → `POST /auth/signup` |
| R1.2 log in with email + password | `src/screens/auth/SignInScreen.js` → `POST /auth/login` |
| R1.3 same account system as the rest of the platform | The website's own endpoints. No app-local account model exists |
| R1.4 token in OS secure storage, never plaintext | `src/api/session.js` — `expo-secure-store` (iOS Keychain / Android Keystore) |
| R1.5 stays logged in across restarts | `AuthContext.bootstrap()` restores the keychain, then `GET /me`. Nothing is cleared on launch |
| R1.6 detects an invalid session, returns to Login | Two paths: `GET /me` 401 on launch; and any 401 after a failed refresh → `client.setSessionExpiredHandler` → `AuthContext` |
| R1.7 forgotten-password recovery | `src/screens/auth/ForgotPasswordScreen.js` → `POST /auth/forgot-password` |

### 4.2 Rewards

| Req | Where |
|---|---|
| R2.1 total points across every salon | `components/rewards/PointsSummary.js` |
| R2.2 per-salon breakdown | `components/rewards/SalonRewardsCard.js` |
| R2.3 visual progress toward each reward | `components/rewards/RewardProgress.js` + `PunchDots.js` |
| R2.4 recent visits, with the service received | `components/rewards/VisitRow.js` |
| R2.5 manual refresh | `RefreshControl` on `screens/rewards/RewardsScreen.js` |

All four display requirements come from **one** request, `GET /me/rewards`.

### 4.3 Booking

| Req | Where |
|---|---|
| R3.1 browse the directory logged out | `screens/discover/DiscoverScreen.js`; `client.listSalons` sends no token |
| R3.2 browse a salon's services | `screens/discover/SalonScreen.js` → `GET /styles/public/:id` |
| R3.3 real times from real hours and bookings | `components/booking/TimeSlotGrid.js` ← `GET /bookings/availability` |
| R3.4 submit a booking | `SalonScreen` confirm sheet → `POST /bookings` |
| R3.5 fully-booked / N spots / closed / not-bookable | `components/salon/AvailabilityPill.js` ← `GET /merchants/:id/capacity?date=` |
| R3.6 use the device's location | `context/LocationContext.js` (`expo-location`) |
| R3.7 sort by distance | `utils/distance.js` — **on device** |
| R3.8 distance AND availability together | `components/salon/SalonFilterBar.js` — two independent toggles, one list |
| R3.9 full use without location | Nothing on Discover requires it; Nearest is disabled with a reason |
| R3.10 search / filter by city | `SalonSearchBar` + city chips → `?q=` (name OR city) and `?city=` |
| R3.11 logo everywhere the salon appears | `components/salon/SalonLogo.js` — directory, booking flow, My Bookings |
| R3.12 neutral placeholder | Same file: tinted monogram, on both no-logo **and** load-failure |
| R3.13 logo never blocks the rest | Placeholder renders first in the same box; `expo-image` decodes off-thread; nothing awaits the image |

### 4.4 My Bookings

| Req | Where |
|---|---|
| R4.1 upcoming and past | `screens/bookings/MyBookingsScreen.js` — one request, two sections |
| R4.2 status on every booking | `components/bookings/StatusPill.js` |
| R4.3 cancel a pending/confirmed booking | Confirm sheet + optimistic update with rollback |
| R4.4 manual refresh | `RefreshControl` |
| R4.5 notify on status change | `context/NotificationContext.js` + backend `BookingsService.announce` |

### 4.5 Configuration / 5. Non-functional

| Req | Where |
|---|---|
| R5.1 usable with no live backend | `src/api/demo.js` + Settings → Demo mode |
| R5.2 backend address configurable | `src/api/config.js` — 3 sources, none of them a literal in code |
| NF1 same API contract as every surface | Every path in `client.js` is one the website also calls |
| NF2 credentials encrypted at rest | `session.js` / SecureStore |
| NF3 real-device testing | ❌ **outstanding — §8** |
| NF4 graceful network handling | `api/errors.js`, `components/ui/StateView.js`, `context/NetworkContext.js` |
| NF5 explain location before the prompt | `components/salon/LocationPrompt.js` — the OS dialog is never fired on launch |
| NF6 location never leaves the device | `utils/distance.js`; no request in `client.js` carries a latitude |

---

## 3. The three rules that are requirements

**Undoing any of these breaks a stated requirement, not a preference.**

### 3.1 One network module

*Technical Constraints: "All network requests to the backend must be issued
from a single, centralized module."*

**No file outside `src/api/` may call `fetch`.** Screens import named functions
from `client.js`. This is what makes the `/v1` prefix, the auth header, the
15-minute token refresh and the `X-Total-Count` pagination envelope each exist
in exactly one place.

### 3.2 Availability is the server's answer

*R3.5: "This must be computed centrally (by the same logic used everywhere else
in the platform) rather than calculated independently inside the app, so the
app and any other Glow+ surface never disagree about whether a salon is full."*

`AvailabilityPill` renders `capacity.state`, an enum from the backend
(`AVAILABLE` / `FULLY_BOOKED` / `CLOSED` / `NOT_BOOKABLE`). `utils/format.js`
only *words* it.

⚠️ **There is no slot generation and no availability arithmetic in this app.**
If you find yourself deriving a label from `seats`, `openNow` or a booking
list in a component, that requirement is being broken. `format.test.js` has a
test named *"is driven ONLY by `state`"* that fails if it happens.

### 3.3 The user's location stays on the device

*NF6: "The user's precise location must not be stored on the backend or shared
with any salon — it is used only, on-device, to sort and filter the salon list."*

The obvious implementation of "sort by distance" is a `?near=lat,lng` query
parameter, and it is **forbidden**. The server publishes the *salons'*
coordinates (public information — shop addresses), the app fetches the same
directory everybody gets, and the haversine runs in `utils/distance.js`.

`LocationContext` never persists the coordinates either; the only thing it
writes to storage is a boolean saying the user dismissed the prompt.

---

## 4. Backend changes this work required

All additive. **568 tests pass, 0 TypeScript errors.**

The spec could not be met by the API as it stood: there was no logo column, no
location column, capacity ignored the date, and there was no way to notify a
device.

### Migration `20260904090000_mobile_logo_location_devices`

- `Merchant`: `logoMimeType`, `logoUpdatedAt`, `addressLine`, `city`, `region`,
  `postalCode`, `latitude`, `longitude` — every one nullable, because R3.9 and
  R3.12 require "not provided" to be a representable state.
  CHECK constraints on the coordinate ranges and on the **pair** (both or
  neither).
- `MerchantLogo` — a **side table** holding the bytes. Deliberately not a
  column on `Merchant`: the public directory reads that row for up to 100
  salons per unauthenticated request, and one careless `include` would put 100
  images in a JSON response.
- `DeviceToken` — Expo push tokens. **Unique on the token alone**, so a phone
  signing into a second account *moves* rather than accumulating; otherwise a
  shared handset keeps delivering the previous customer's appointment details.
- The T52b Supabase Data API lockdown is **re-applied to both new tables**.
  Prisma-created tables inherit Supabase's default `anon` grants, so a table
  added after that migration is open again unless this runs.

### New / changed routes

| Route | Why |
|---|---|
| `GET /merchants/:id/capacity?date=` | R3.5 — was date-blind. Date is **optional**, defaulting to today, so every pre-existing caller is unchanged |
| `GET /merchants/:id/logo` | W5/R3.11. Public (an `<img>` cannot send a bearer token), behind `assertMerchantVisible`, `Cache-Control: immutable` |
| `PUT /merchants/me/logo` | W1/W2 — owner-only **and** `RequireActiveSubscriptionGuard`. That guard *is* requirement W1 |
| `DELETE /merchants/me/logo` | W2's "replace it later" |
| `PATCH /merchants/me/location` | R3.6-R3.10's stated dependency |
| `POST` / `DELETE /me/devices` | R4.5 |

Also: `GET /merchants` gained `?city=`, its `?q=` now matches **name OR city**
(R3.10), and its payload gained `logoUrl` plus the location fields.

### Other backend files

- `src/common/image.ts` — W3. Validates by **magic bytes**, never by the
  declared MIME type: these bytes are served back from our own origin, so
  "the caller said it was a PNG" is not a fact about them. SVG is deliberately
  rejected (it is a document that can carry `<script>`).
- `src/modules/notifications/push.provider.ts` — Expo push. `PUSH_PROVIDER=log`
  by default, so nothing leaves the process in dev or in tests.
- `src/config/public-url.ts` — `PUBLIC_API_URL`, from which `logoUrl` is built.
- `merchants.module.ts` — a **route-scoped** `express.json({ limit })` for the
  logo upload only. Express's default is 100 kB and a 2 MB logo arrives as a
  ~2.7 MB data URL, so without it every real upload dies *before any pipe runs*
  and W3's "clear error" is unreachable. Mounted by **raw URL**, so it needs the
  `/v1` prefix — miss that and it silently never runs.

### Two new environment variables

```
PUBLIC_API_URL="https://glow-plus-api-six.vercel.app"   # salon logo URLs are built from this
PUSH_PROVIDER="log"                                      # "expo" to actually send
```

`PUBLIC_API_URL` is **production-required, and that means the API will not
start without it.** `env.validation.ts` collects it into the problem list and
`validateEnv` throws, which aborts `ConfigModule.forRoot` — deliberately, so
the failure is a loud boot error naming the variable rather than a fleet of
salon logos silently pointing at a developer's laptop.

⚠️ **Deploy order matters.** The migration must run BEFORE the new code ships.
`listPublic` selects `logoUpdatedAt`, `city`, `latitude` and the rest, so code
deployed against a database that has not been migrated answers **500 on
`GET /merchants`** — the public salon directory, on both the app and the
website.

⚠️ It is **not** `APP_URL`. `APP_URL` is the website
(`glowplusmember.com`); this is the API host.

---

## 5. Website changes (spec §8)

Section 8 is explicitly a *website* requirement, included in the app's spec
because R3.11-R3.13 depend on it.

- `glow-plus-web/src/views/SalonBrandingSettings.jsx` — **new**. `LogoSetting`
  (W1-W3) and `LocationSetting`.
- `BusinessPortal.jsx` — both rendered in the Profile panel.
- `Marketing.jsx` — W4: the public salon directory now shows each salon's logo
  next to its name, with the same monogram fallback the app uses.
- `lib/api.js` — `uploadLogo`, `deleteLogo`, `updateSalonLocation`.

**W1 is a real gate.** *"A salon that has not completed subscription checkout
must not see or be able to use a logo-upload feature."* The control is hidden
when the subscription is not `TRIALING`/`ACTIVE`, **and** the API refuses the
request. The hidden control is the courtesy; the guard is the rule.

**Coordinates are typed in, not geocoded.** Every geocoding service is a paid
API key, a new secret and a new failure mode, and this platform has none
configured. The form links straight to Google Maps with the address prefilled.
Adding a geocoder later replaces two input fields and nothing else — the
columns, the API and the app all already work in coordinates.

---

## 6. Decisions that look wrong until you know why

- **Auth is a modal over the tabs, not a separate navigator tree.** The usual
  `isAuthenticated ? <App/> : <AuthStack/>` is wrong here: R3.1 requires the
  directory to be browsable logged out, so a signed-out person needs the real
  app. Sign-in is reached *from* it.

- **Signup does not sign you in.** The platform requires a verified email
  before a consumer may log in (its T81), so it would drop the user onto a
  dashboard where every call 403s. Signup ends on Sign in with "check your
  inbox".

- **Sign in branches on 403.** That status means "correct password, unverified
  email". Without the branch the user sees "Invalid email or password" and goes
  to reset a password that is perfectly correct.

- **`useAsyncData` keeps `data` when a refresh fails.** A failed pull-to-refresh
  leaves the user looking at the last good data with an error beside it, not at
  an empty screen.

- **A capacity request that fails publishes `null`, not `undefined`.**
  `isLoading` tests for `undefined`, so caching the failure without publishing
  it left the pill pulsing forever. `null` means "asked, no answer" and renders
  nothing.

- **All times are rendered in `SALON_TIMEZONE`, not the device's.** This is the
  platform's [F63] one layer out, and it matters *more* on a phone because
  people travel with them. `utils/datetime.js` must track the backend's
  `SALON_TIMEZONE`; changing one without the other reintroduces the bug.

- **`ProgressBar` animates `width` with `useNativeDriver: false`.** Not an
  oversight — the native driver cannot animate layout properties, and the
  `scaleX` alternative squashes the rounded end caps into ellipses. It animates
  once per screen load.

- **The date strip keeps days the salon is closed.** They are selectable and
  the server answers "Closed". A missing cell would leave someone checking
  Sunday hours with no answer at all.

- **`localeCompare`, `Intl.DateTimeFormat` and `Intl.NumberFormat` are used
  throughout, but `Intl.RelativeTimeFormat` is not** — it is missing from
  React Native's Hermes ICU build on Android in this SDK. `relativeTime()` is
  hand-rolled for that reason.

---

## 7. Performance

The user asked for fast and smooth; these are the specific things doing it.

- **`memo` on every list row** (`SalonCard`, `BookingCard`, `ServiceRow`,
  `SlotChip`, `SalonRewardsCard`). Discover re-renders on every keystroke and
  every capacity response; without this, typing "bloom" re-renders forty cards
  five times.
- **Capacity is fetched for VISIBLE rows only** (`onViewableItemsChanged`), so
  a 100-salon directory costs ~8 requests, not 100. Cached by `salonId|date`
  and deduplicated in flight.
- **`setCapacities` returns the previous object unchanged when nothing is new**,
  so React bails out instead of re-rendering the list on every scroll tick.
- **Search is debounced (300 ms); the input is not.** Debouncing the input
  itself makes the keyboard feel broken.
- **`useAsyncData` guards against out-of-order responses** with a request id.
  Type "bl" then "bloom" and the first can land second — this is what stops the
  list showing results for a query the user finished typing past.
- **Skeletons, not spinners**, and they hold the layout, so nothing jumps when
  data lands.
- **Native stack navigator**, so the push animation and swipe-back run on the
  UI thread rather than fighting a screen's first fetch.
- **`expo-image` with `recyclingKey`** — stops a recycled row showing the
  previous salon's logo for a frame during a fast scroll.
- **Animations use `useNativeDriver: true`** everywhere it is possible (toast,
  sheet, skeleton shimmer, press states).

---

## 8. Outstanding

**NF3 — real-device testing.** *"The app must be tested on real iOS and Android
devices, not solely through build-tool or compiler checks, before being
considered ready for release."* Not done here, and it cannot be: it needs
physical hardware. Specifically un-exercised:

- push notifications end to end (a simulator cannot mint an Expo push token)
- the location permission dialog and the deny → Settings path
- keychain persistence across a real app kill
- the OS "notifications denied" state

**`PUBLIC_API_URL` — DONE (2026-09-04).** Set on the `glow-plus-api` Vercel
project for **production and preview**, value `https://glow-plus-api-six.vercel.app`,
verified by reading it back with `vercel env pull`. Preview needs it too:
`isProductionEnv` is true whenever `VERCEL === '1'`, which is every deployment,
so a preview deploy would also refuse to boot without it.

**The migration — DONE (2026-09-04).** Applied to `glow-plus-prod`
(`xhyoeiltwcciqowlwyov`, us-east-1).

Not via `prisma migrate deploy` — that needs the database password, and every
secret on the Vercel project is stored `type: sensitive`, which Vercel never
returns. It went through the **Supabase Management API SQL endpoint**
(`POST /v1/projects/{ref}/database/query`), authenticated with a personal
access token, wrapped in `BEGIN … COMMIT`.

Because that path bypasses Prisma, the `_prisma_migrations` rows were written
by hand. The checksum is a plain SHA-256 of the migration file’s bytes —
verified empirically first by recomputing an already-applied migration’s
checksum and matching it against the stored one, rather than assumed.

⚠️ **A second migration was recorded at the same time:
`20260826120000_lock_down_supabase_data_api`.** It was already applied to the
database (RLS on, `anon` revoked — checked directly) but had never been
recorded, so someone had run it by hand. Prisma therefore believed it pending
and would have re-run it on the next deploy. Harmless (the whole body is
idempotent), but the record is now honest.

Verified after applying: 8 nullable columns on `Merchant`, both new tables,
all 9 constraints and indexes, RLS on and `anon` revoked on both new tables,
13/13 migrations recorded, and the constraints exercised behaviourally in
rolled-back transactions (a half coordinate, a latitude of 999 and a 0-byte
logo were each refused by the named constraint; a valid coordinate was
accepted). Row counts unchanged throughout: 5 merchants, 8 users, 3 bookings,
3 visits.

⚠️ **Superseded — the migration has run.** What follows is why the order
mattered, kept because it is the same trap next time:

**Do not deploy the new backend code until the migration has run.** `listPublic`
selects columns that do not exist yet, so the deploy would answer 500 on
`GET /merchants` — the public salon directory, on the app and the website
both. Order: **migrate, then deploy.**

It cannot be run from the repo. Every secret on the Vercel project is stored
with `type: sensitive`, which Vercel never returns — `vercel env pull` gives
back an empty string for `DATABASE_URL` and `DIRECT_URL` (only the one
`encrypted` var, `ALLOWED_ORIGINS`, comes through). Nothing in the repo has it
either: `.env`, `.env.local`, `.env.bak-t5` and `.env.bak.t60` all point at
`localhost:5433`.

So it needs the Supabase connection string, from
**Supabase → Settings → Database → Connection string**:
- **Session pooler**, port 5432 → `DIRECT_URL` (what `migrate deploy` uses)
- **Transaction pooler**, port 6543 → `DATABASE_URL`

Note the standing handover item: the Supabase project is still on the
developer's account, not the client's.

**Before push notifications work:** set `PUSH_PROVIDER=expo`, and run
`eas build:configure` so `expo.extra.eas.projectId` exists — without it
`getExpoPushTokenAsync` throws.

**Acceptance criterion still needing a live check** (spec §9): *"A user can
create an account in the app and log into the Glow+ website using the same
credentials."* The code path is the website's own endpoint, so it should hold,
but §9's closing line asks for every requirement to be *"verified by actually
exercising the corresponding feature, not by code inspection alone"*.
