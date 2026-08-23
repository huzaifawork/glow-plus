const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Where your backend API actually lives — matches STRIPE-adjacent .env
// conventions from the backend project. Override with an env var if your
// backend ever runs on a different port/host.
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

app.use(express.static(path.join(__dirname, 'public')));

// Injects the API base URL into the page so the frontend JS knows where
// to send the verification request, without hardcoding it in the HTML.
app.get('/verify-email', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify-email.html'));
});

// Where Stripe Checkout redirects back to after a salon completes (or
// abandons) the subscription payment — see billing.service.ts's
// success_url / cancel_url, both of which point here with a
// ?success=true or ?canceled=true query param.
app.get('/business/billing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'billing-result.html'));
});

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.GLOW_API_BASE_URL = ${JSON.stringify(API_BASE_URL)};`);
});

app.get('/', (req, res) => {
  res.send('<p>Glow+ frontend is running. Try visiting a verification link from your email.</p>');
});

app.listen(PORT, () => {
  console.log(`Glow+ frontend listening on http://localhost:${PORT}`);
  console.log(`Forwarding verification requests to ${API_BASE_URL}`);
});
