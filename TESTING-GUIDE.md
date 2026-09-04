# Glow+ Mobile — Testing Guide

How to test the Glow+ consumer app against
`Glow-Plus-App-Requirements-Spec`, and how to tell a real bug from a
misunderstanding.

Every test below names the requirement it covers, the exact steps, and **what
you should see**. If what you see differs, that is a bug worth reporting — see
§9 for how.

> Companion documents: `context-mobile.md` (what was built and why),
> `CONTEXT.md` (the platform), `HANDOVER.md` (accounts and access).

---

## 1. Read this first — three things that are NOT bugs

Skipping this section will cost you an hour of chasing things that are working
as designed.

### 1.1 Push notifications do not work in Expo Go

Expo removed remote push from Expo Go in SDK 53. It is not an app fault and
there is no setting that fixes it. Settings will say so:

> *"Not available in Expo Go. Push notifications need a development build;
> everything else works normally."*

**R4.5 is therefore the one requirement Expo Go cannot exercise.** It needs
`eas build --profile development`. Everything else in the spec is testable.

### 1.2 In Live mode, several features will look empty — because the data is empty

The live database has **5 salons, of which only 2 are visible to customers**
(a salon must be approved *and* on a plan). And **not one of them has entered
a city, coordinates, or a logo yet.**

So in Live mode:

| You will see | Because |
|---|---|
| No distance on any card, "Nearest" does nothing useful | No salon has coordinates |
| No city filter chips | No salon has a city |
| Every logo is a letter monogram | No salon has uploaded one |
| "Usman Naib saloon" is always **Closed** | It has no business hours set |

**None of these is an app bug.** To test those features use **Demo mode**
(§3), or enter the data on the website portal first (§7).

### 1.3 Live mode writes to the real production database

The preview backend is connected to the **live** database. A booking you make
in Live mode is a real row that the salon sees in their portal. Test
deliberately, and prefer Demo mode for repetitive UI testing.

---

## 2. Setup

### 2.1 Starting the app

The Expo dev server is **not left running**. Ask for it to be started, or run
it yourself:

```bash
cd "glow-plus-mobile app/glow-plus-mobile app"
npx expo start
```

Scan the QR with **Expo Go**. The app is on **SDK 57**, which matches the
current Expo Go on both stores.

If the phone cannot reach the laptop (different Wi-Fi, or router client
isolation), use `npx expo start --tunnel`.

### 2.2 The two testing modes

Everything is testable, but not in one mode. Use both.

| | **Demo mode** | **Live mode** |
|---|---|---|
| Turn on | Settings → Demo mode **ON** | Settings → Demo mode **OFF** |
| Data from | Inside the app (`src/api/demo.js`) | The preview backend + real database |
| Login | **Any** email/password | A real, verified Glow+ account |
| Good for | **Every feature** — all four availability states, distance, city filter, logos, booking, cancel | **Integration** — same account as the website, booking visible to the salon, status changes, points |
| Network needed | No | Yes |

**Do §4–§6 in Demo mode. Do §7 in Live mode.** That order finds UI bugs
before you spend real bookings on them.

### 2.3 Which backend Live mode talks to

Settings → **Backend address**. It currently points at the **preview**
deployment, which runs the new code. Production still runs the old code, so
pointing the app there will make the newer features (availability states,
logos, location) look broken. See §8.

---

## 3. Demo data — the numbers to check against

Memorise these; most expected results below refer to them.

**4 salons**

| Salon | City | Seats | Services | Closed on |
|---|---|---|---|---|
| Bloom Hair Studio | Toronto | 3 | Silk Press (1h, +40), Balayage (2h, +60), Trim & Style (30m, +20) | Sunday |
| Polished Nail Bar | Toronto | 2 | French Tip Gel (45m, +35), Classic Manicure (30m, +20) | Sunday |
| Stillwater Spa | Toronto | 4 | Deep Tissue (1h, +70), Hot Stone (1.5h, +90) | **Monday** |
| The Corner Chair | Hamilton | 1 | Gentleman's Cut (30m, +25) | Sun + Mon |

⚠️ **The Corner Chair deliberately has NO coordinates.** It exists to prove the
app handles a salon that has not registered a location (spec §4.3.2
dependency note).

**Rewards:** 340 points total — Bloom 200, Polished 140. Polished has **1
reward ready to claim**.

**Bookings:** Bloom Silk Press in 2 days (**Confirmed**) · Polished French Tip
Gel in 5 days (**Pending**, with a note) · Bloom Balayage 14 days ago
(**Completed**).

---

## 4. Demo mode — accounts and sessions

### 4.1 Browsing signed out — R3.1

| # | Do | Expect |
|---|---|---|
| 1 | Open the app signed out | Only **2 tabs**: "Find a salon", "Settings" |
| 2 | Open "Find a salon" | 4 salon cards, no login asked for |

*Why it matters:* R3.1 requires the directory to work *"without requiring the
user to be logged in"*. A login wall here fails the requirement.

### 4.2 Creating an account — R1.1

| # | Do | Expect |
|---|---|---|
| 1 | Settings → sign in prompt → "Create an account" | Four fields: Name, Email, Password, **Phone (optional)** |
| 2 | Password `123`, submit | Red under the field: **"Use at least 8 characters."** No network call |
| 3 | Email `abc`, submit | **"That doesn't look like an email address."** |
| 4 | Valid details, submit | Green toast, returns to Sign in |

*Why it matters:* R1.1 names all four fields and marks phone optional. Steps
2–3 are client-side checks — they should be instant, not a round trip.

### 4.3 Signing in — R1.2

| # | Do | Expect |
|---|---|---|
| 1 | Any email + any password → Sign in | **The sign-in screen closes**, and you land back where you were |
| 2 | Look at the tabs | Now **4 tabs** — Rewards and Bookings have appeared |
| 3 | Settings | Your **name and email** both shown |

⚠️ Step 1 is a regression check. A previous build signed in successfully but
never dismissed the sign-in screen, so it looked like nothing happened.

### 4.4 Staying signed in — R1.4, R1.5 · **the most important test here**

| # | Do | Expect |
|---|---|---|
| 1 | While signed in, **fully close** Expo Go (swipe it out of the app switcher) | — |
| 2 | Reopen and scan again | Splash, then **straight to Rewards** — **no login screen** |

*Why it matters:* the token is in the OS keychain (iOS Keychain / Android
Keystore), not plain storage. If you get the login screen, R1.4/R1.5 have
failed.

### 4.5 Password recovery — R1.7

| # | Do | Expect |
|---|---|---|
| 1 | Sign in → "Forgot your password?" → enter an email → submit | **"Check your inbox"** banner |
| 2 | On the password field, tap **Show** | Password becomes visible, button becomes **Hide** |

---

## 5. Demo mode — rewards, discovery, booking

### 5.1 Rewards — R2.1 to R2.5

| # | Do | Expect (exact) |
|---|---|---|
| 1 | Rewards tab | Black card: **340** points · **2 salons** · **1 reward ready** (in pink) |
| 2 | Scroll | **Bloom Hair Studio — 200 points**, **Polished Nail Bar — 140 points · 1 ready to claim** |
| 3 | Bloom's first reward | "20% off your next visit" · **5 dots, 4 filled** · **"1 more visit"** |
| 4 | Bloom's second reward | "Free deep-conditioning treatment" · a **progress bar, not dots** · "200 of 300 points" |
| 5 | Polished's reward | Green **"Ready"** pill, **green card background**, "Ready to claim" |
| 6 | "Show recent visits (4)" | 4 rows, each naming the **service** (Silk Press, Balayage…), date, and `+40` |
| 7 | Pull down to refresh | Spinner runs, **content stays on screen** — no grey skeletons |

**Step 4 is the real check.** A points-based reward must draw a bar; drawing
300 dots would be a bug. Step 7 is R2.5 — a refresh must not blank the screen.

### 5.2 Salon directory and search — R3.1, R3.10

| # | Do | Expect |
|---|---|---|
| 1 | "Find a salon" | 4 cards, each with a monogram, name, address, and an **availability pill** |
| 2 | Search `bloom` | Only Bloom Hair Studio |
| 3 | Search `hamilton` | **The Corner Chair** — matched on **city**, not name |
| 4 | Clear, tap the **Toronto** chip | 3 salons; Corner Chair drops out |
| 5 | Tap **Toronto** again | Filter clears, 4 salons return |

*Step 3 matters:* R3.10 asks for search *"by city or area"*. One box searches
both name and city.

### 5.3 The availability indicator — R3.5 · **highest-value test**

| # | Do | Expect |
|---|---|---|
| 1 | Look at any card's pill | One of: "**N spots left today**", "**Fully booked today**", "**Closed today**", "**Not bookable yet**" |
| 2 | Date strip — first cell | Labelled **TODAY**, selected (dark) |
| 3 | Scroll the strip to the **next Sunday** | Heading changes. **Bloom Hair Studio → "Closed that day"** |
| 4 | Select the **next Monday** | **Stillwater Spa → "Closed that day"** |

**If the pills do not change when you change the date, R3.5 has failed.**

Also note the wording changes from "today" to "**that day**" — saying "Closed
today" on a card showing next Sunday would be false.

### 5.4 Location — R3.6 to R3.9, NF5, NF6

| # | Do | Expect |
|---|---|---|
| 1 | Open Discover for the first time | A card: **"Find salons near you"**, including *"Your location is used on this device only. It is never sent to Glow+ and never shared with a salon."* |
| 2 | Tap **"Not now"** | Card disappears; **the list works completely** |
| 3 | Look at the **Nearest** chip | **Disabled**, with a line explaining why |
| 4 | Use search, city, dates, open a salon, book | **All of it works** without location |
| 5 | Tap **Nearest** | The OS permission dialog appears — **only now** |
| 6 | Allow | Distances appear ("2.4 km"); list reorders nearest-first |
| 7 | Scroll to the **bottom** | **The Corner Chair is last, with no distance** |

**Step 1 is NF5** — the reason must be given *before* the OS prompt. If the
system dialog appears on launch with no explanation, that fails.

**Step 4 is R3.9** — location is an enhancement, never a requirement.

**Step 7 is the dependency note** — a salon with no location must be *kept*
(hiding it loses a bookable salon) and must be *last* (treating a missing
coordinate as 0 would put it first).

### 5.5 Nearby AND available together — R3.8

| # | Do | Expect |
|---|---|---|
| 1 | Turn on **Nearest** and **Has availability** together | Both chips dark |
| 2 | Look at the list | Only salons with an opening, still sorted nearest-first |
| 3 | Pick a date when everything is shut | Empty state: **"Nothing free on this date"** + a **Clear filters** button |

*Why:* the acceptance criteria ask for distance and availability combined
*"in a single flow"* — no second screen.

### 5.6 Booking — R3.2, R3.3, R3.4

| # | Do | Expect |
|---|---|---|
| 1 | Open **Bloom Hair Studio** | Salon name in the header, large logo, availability pill |
| 2 | "Choose a service" | **3 services** with durations and points |
| 3 | Select **Silk Press** | Pink border and tint; the radio fills |
| 4 | Look at "Available times" | Grouped **Morning / Afternoon / Evening** |
| 5 | Note the times | Start from 9:00, last one ends by 18:00 (Bloom's hours), 1-hour slots |
| 6 | Now switch to **Balayage** (2h) | **Fewer slots**, and the previously selected time **clears** |
| 7 | Tap a time | A bar appears at the bottom with the service, date, time, and **Review & book** |
| 8 | Review & book | A sheet: salon, **Service / When / Duration / Points** |
| 9 | Check the Points row | **"+40 once completed"** — not just "+40" |
| 10 | Add a note, confirm | Toast **"Booking requested"**, and the app moves to **My Bookings** |

**Steps 5–6 are R3.3** — times must come from the salon's real hours and the
chosen service's duration, *"not a fixed or assumed schedule"*. If every
service shows identical slots, that has failed.

**Step 9:** points are awarded when the salon completes the visit, not when you
book. The wording must not promise otherwise.

Also try: open Bloom on a **Sunday** → **"Closed on this day"**. Open a salon
and pick no service → **"Choose a service first"**.

### 5.7 My Bookings — R4.1 to R4.4

| # | Do | Expect |
|---|---|---|
| 1 | Bookings tab | Two sections, **Upcoming** and **Past**, with counts |
| 2 | Scroll | Section headers **stick** to the top |
| 3 | Upcoming order | **Soonest first** — Bloom (Confirmed) then Polished (Pending) |
| 4 | Past | Bloom Balayage, **Completed** |
| 5 | The Pending card | Shows **"YOUR NOTE — Running 5 min late, sorry!"** |
| 6 | Under each status | A sentence, e.g. *"The salon has your request and will confirm shortly."* |
| 7 | A **Completed** booking | **No Cancel button** |
| 8 | A **Confirmed** booking | Red **"Cancel appointment"** |
| 9 | Tap Cancel | A sheet showing **which** booking — logo, service, salon, date, time |
| 10 | Confirm | Status flips to **Cancelled immediately** |
| 11 | Where did it go? | **Into Past** — it must **not** disappear |
| 12 | Pull to refresh | Works; content stays |

**Steps 7–8 are R4.3** — only pending and confirmed bookings may be cancelled.
A Cancel button on a completed booking would produce a server error.

**Step 9:** with three bookings on screen, the confirmation must show which one
you are about to cancel.

### 5.8 Settings — R5.1, R5.2

| # | Do | Expect |
|---|---|---|
| 1 | Settings | Your name/email; orange **"Demo mode is on"** banner |
| 2 | About | Version, and **"Appointment times shown in: America/Toronto"** |
| 3 | **Backend address** row | A sheet with the current URL |
| 4 | Enter `https://example.com/v1` → **Test connection** | Red **"Couldn't connect"** |
| 5 | **Reset to default** | The shipped URL returns |

*Step 3 is R5.2* — the backend address must be configurable at runtime, not
baked into the code.

### 5.9 Network handling — NF4

| # | Do | Expect |
|---|---|---|
| 1 | Demo mode **OFF**, then turn on **Airplane mode** | — |
| 2 | Rewards → pull to refresh | Orange **"You're offline"**; previously loaded data **stays** |
| 3 | Close and reopen the app, still offline | **"You're offline"** with a **Try again** button — no crash, no blank screen |
| 4 | Airplane mode off → Try again | Loads |

*NF4 requires "a clear message rather than a silent failure or crash".* An
endless spinner or a white screen fails it.

---

## 6. Quick smoke test — the 6 that matter most

If time is short, do only these:

1. **§5.3 step 3–4** — availability pill changes with the selected date (R3.5)
2. **§5.6 step 6** — slots change when the service changes (R3.3)
3. **§5.4 step 7** — the salon with no location is present, last, no distance
4. **§4.4** — closing and reopening the app does not ask you to log in (R1.5)
5. **§5.7 step 11** — a cancelled booking moves to Past, does not vanish (R4.1)
6. **§5.4 step 1** — the reason is shown before the OS location prompt (NF5)

---

## 7. Live mode — integration tests

Switch **Demo mode OFF**. These are the tests that prove the app and the
website are one platform, and they are the spec's acceptance criteria.

### 7.1 One account across both surfaces — R1.3

| # | Do | Expect |
|---|---|---|
| 1 | Create an account in the app | Verification email arrives |
| 2 | **Open the link in the email** | Address verified |
| 3 | Sign in **in the app** | Works |
| 4 | Sign in on **glowplusmember.com** with the same credentials | **Works** |

⚠️ Step 2 is not optional. The platform refuses login until the email is
verified — the app will say so and offer to resend, which is correct
behaviour, not a bug.

### 7.2 A booking reaches the salon

| # | Do | Expect |
|---|---|---|
| 1 | Book an appointment at **Bloom hair studio** in the app | Toast, appears in My Bookings as **Pending** |
| 2 | Open the salon's portal on the website | **The same booking is there** |
| 3 | **Confirm** it in the portal | — |
| 4 | Back in the app, pull to refresh | Status is now **Confirmed** |
| 5 | **Complete** it in the portal | — |
| 6 | App → Rewards → pull to refresh | **Points have increased** |

Steps 2, 4 and 6 are three separate acceptance criteria. They are the whole
point of NF1 ("the same API contract as every other Glow+ surface").

### 7.3 Salon logo, end to end — W1 to W5, R3.11 to R3.13

Do this in the **website portal**, then check the app.

| # | Do | Expect |
|---|---|---|
| 1 | Portal → Profile, on a salon **with no subscription** | **No logo upload control at all** — only a message to start a plan |
| 2 | On a salon **with an active plan** | Upload control is present |
| 3 | Upload a non-image (e.g. a PDF renamed `.png`) | **Rejected with a clear sentence** |
| 4 | Upload an image over 2 MB | Rejected, saying the maximum |
| 5 | Upload a normal PNG/JPEG | Preview appears |
| 6 | Website's public salon directory | **The same logo** beside the name |
| 7 | **App** → Find a salon → pull to refresh | **The same logo again** — with no app-specific step |
| 8 | A salon with no logo | A **letter monogram**, never a broken image or a gap |

**Step 1 is W1** — a salon that has not checked out must not even see the
feature. **Step 7 is W5 + R3.11.** **Step 8 is R3.12.**

### 7.4 Salon location, end to end — R3.6 to R3.10

| # | Do | Expect |
|---|---|---|
| 1 | Portal → Profile → **Address & location**, enter an address and coordinates | Saved |
| 2 | Enter a latitude but leave longitude blank | **Refused** — both or neither |
| 3 | App → Find a salon → refresh | The address shows on the card |
| 4 | Enable location, turn on **Nearest** | That salon now shows a distance and sorts by it |
| 5 | The salon's city now appears as a **filter chip** | Tapping it filters the list |

---

## 8. Which backend am I actually testing?

Three different things can be "the backend". Getting this wrong produces false
bug reports.

| Setting | Talks to | New features work? |
|---|---|---|
| Demo mode **ON** | Nothing — data is inside the app | Yes (simulated) |
| Demo mode **OFF**, backend = **preview URL** | New code + real database | **Yes** |
| Demo mode **OFF**, backend = `glow-plus-api-six.vercel.app/v1` | **Old code** + real database | **No** |

If you point the app at production **before** the new backend is deployed, you
will see: no availability state, dates that change nothing, no distances, no
city chips, no logos. That is the old server, not the app.

Check which one you are on: **Settings → Backend address**.

---

## 9. Reporting a bug

Include, in this order:

1. **Which mode** — Demo or Live, and the backend address from Settings
2. **The section and step number** from this guide (e.g. "§5.6 step 6")
3. **What you expected** and **what you saw**
4. **A screenshot** where the screen is the evidence
5. **If a red error screen appeared, the full text of it** — the first two
   lines name the actual cause

For anything network-shaped, note whether the **"You're offline"** banner was
showing.

---

## 10. What this guide cannot cover

Honest limits, so nobody assumes these were verified.

| Not testable here | Why | What it needs |
|---|---|---|
| **Push notifications (R4.5)** | Removed from Expo Go in SDK 53 | `eas build --profile development` |
| **NF3 — real-device release testing** | Requires the app installed as a real build, not through Expo Go | An EAS build on physical iOS + Android |
| Keychain behaviour after a real app kill | Expo Go's own lifecycle differs from a standalone build | A development or production build |
| Deep-linking from a tapped notification | Depends on push above | Same |

R4.5 is the spec's only *"should"*. Everything else in §4 and §5 of the
requirements is testable with the two modes described here.

---

## 11. Requirement coverage map

| Req | Covered in |
|---|---|
| R1.1 create account | §4.2 |
| R1.2 log in | §4.3 |
| R1.3 shared account system | §7.1 |
| R1.4 secure token storage | §4.4 |
| R1.5 stays logged in | §4.4 |
| R1.6 invalid session → login | §5.9 step 3 (and a revoked session) |
| R1.7 forgotten password | §4.5 |
| R2.1–R2.4 rewards display | §5.1 |
| R2.5 manual refresh | §5.1 step 7 |
| R3.1 browse logged out | §4.1 |
| R3.2 salon services | §5.6 step 2 |
| R3.3 real availability | §5.6 steps 5–6 |
| R3.4 submit a booking | §5.6 step 10 |
| R3.5 fully-booked indicator | §5.3 |
| R3.6–R3.7 location, distance | §5.4 |
| R3.8 distance + availability | §5.5 |
| R3.9 works without location | §5.4 steps 2–4 |
| R3.10 search by city | §5.2 |
| R3.11–R3.13 salon logo | §7.3 |
| R4.1–R4.2 bookings and status | §5.7 |
| R4.3 cancel | §5.7 steps 7–11 |
| R4.4 manual refresh | §5.7 step 12 |
| R4.5 status notifications | **§10 — not testable in Expo Go** |
| R5.1 works with no backend | §2.2, all of §4–§6 |
| R5.2 configurable backend | §5.8 step 3 |
| NF1 one API contract | §7.2 |
| NF2 encrypted credentials | §4.4 |
| NF3 real-device testing | **§10 — outstanding** |
| NF4 network handling | §5.9 |
| NF5 explain before prompting | §5.4 step 1 |
| NF6 location stays on device | §5.4 step 1 (stated in-app); enforced in code — no request carries a latitude |
| W1–W5 website logo | §7.3 |
