# Glow+ Mobile

A React Native (Expo) app for Glow+ clients — see your points per visit and
your progress toward each salon's rewards, on both iOS and Android from one
codebase.

## What's here

- `App.js` — auth-state root, switches between Login and Dashboard
- `src/screens/LoginScreen.js` — login / signup
- `src/screens/DashboardScreen.js` — total points, per-salon punch-card
  progress, recent visits (pull-to-refresh)
- `src/components/PunchCard.js` — the same animated dot-progress visual from
  the Glow+ website, native version
- `src/api/client.js` — talks to the backend's `GET /me/rewards` endpoint
  (added to `glow-plus-backend` alongside this)
- `src/theme.js` — shared design tokens matching the website's look

## Running it (Expo Go — fastest way to see it on a real phone)

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (App Store / Play Store) on your
phone. No native build needed for this — Expo Go runs the JS bundle directly,
identical UI on both iOS and Android.

## Demo mode

`DEMO_MODE = true` in `src/api/client.js` means the app runs entirely on
realistic sample data (matching the shape of the real API response) — useful
for reviewing the UI before the backend is deployed. Any email/password logs
you in. Flip it to `false` and set `apiBaseUrl` in `app.json` once
`glow-plus-backend` is running somewhere reachable from your phone.

## Building real iOS / Android app store builds

Expo Go is for development only — to get an installable `.ipa` / `.aab` you
build with **EAS** (Expo's free/paid build service, no Mac required even for
iOS):

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios
eas build --platform android
```

This produces real binaries you can submit to the App Store and Google Play
(`eas submit` handles that part too). You'll need:
- An Apple Developer account ($99/yr) for iOS
- A Google Play Developer account ($25 one-time) for Android

I can't run these build/submission steps from here — they require your
developer accounts and take Apple/Google review time — but everything up to
that point (the actual app code) is ready to go.

## Backend requirement

The dashboard calls `GET /me/rewards` (added in `glow-plus-backend/src/modules/rewards/`),
which returns:

```json
{
  "totalPoints": 340,
  "merchants": [
    {
      "merchantId": "...",
      "businessName": "Bloom Hair Studio",
      "points": 200,
      "rewards": [{ "ruleId": "...", "name": "20% Off Loyalty Reward", "triggerValue": 5, "progress": 4, "remaining": 1, "rewardType": "PERCENT_OFF", "rewardValue": 20 }],
      "recentVisits": [{ "id": "...", "styleName": "Silk Press", "styleType": "HAIR", "pointsEarned": 40, "visitDate": "2026-08-01T15:00:00Z" }]
    }
  ]
}
```
