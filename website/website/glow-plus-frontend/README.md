# Glow+ Frontend

A minimal frontend that handles the email verification links your backend
sends (`APP_URL` in `glow-plus-backend`'s `.env`, currently pointing at
`localhost:3000`). This is intentionally small — one page, one job — not a
full marketing site or dashboard.

## What it does

When someone clicks a "Confirm your email" link from a Glow+ email, it
lands here at `/verify-email?token=...`. The page:
1. Reads the token from the URL
2. Calls your backend's `POST /auth/verify-email`
3. Shows a clean success or error state

## Running it

```bash
npm install
npm start
```

Runs on **port 3000** by default — matching what your backend's `.env`
already expects (`APP_URL="http://localhost:3000"`).

Your `glow-plus-backend` needs to be running separately (on port 4000, as
usual) for the verify step to actually work — this frontend calls out to
it, it doesn't duplicate any backend logic.

## Configuration

If your backend ever runs somewhere other than `localhost:4000`, set:
```bash
API_BASE_URL="https://your-real-api.com" npm start
```

## What I tested before handing this over

I didn't just write this and assume it works — I actually ran it, with a
real Express server and a real headless browser (Playwright), and caught
a real bug in the process: the success/error screens were overwriting the
card's CSS class entirely instead of adding to it, which silently stripped
the card's background, padding, and shadow. Fixed and re-verified — screen-
shots of all three states (success, invalid token, missing token) confirmed
correct before this was packaged up.

## Where this fits with the rest of Glow+

This is deliberately minimal — just enough to make the email verification
loop actually clickable instead of copy-pasting tokens into Thunder Client.
It is NOT the marketing website, the consumer dashboard, or the business
portal — those are separate, larger pieces (see `Glow-Plus-Website.html`
from earlier in this project) that would need their own, much bigger
buildout if you want this to be the actual public-facing Glow+ site.
