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
API contract is defined and changed in exactly one place."*

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

73 tests over the pure logic — distance and the no-location fallbacks, the
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
