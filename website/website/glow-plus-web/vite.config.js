import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * The old Express server (glow-plus-frontend/server.js) mapped two clean URLs
 * onto two static files:
 *
 *   GET /verify-email    -> public/verify-email.html
 *   GET /business/billing -> public/billing-result.html
 *
 * Those exact paths are baked into the backend (APP_URL + billing.service.ts's
 * success_url / cancel_url), so they cannot change. This plugin reproduces that
 * mapping in the Vite dev server; vercel.json does the same for production.
 */
function legacyRouteRewrites() {
  const routes = {
    '/verify-email': '/verify-email.html',
    '/business/billing': '/billing-result.html',
    // Not backend-baked like the two above — chosen to sit next to where
    // T36's future consumer portal will live (T18).
    '/consumer/booking': '/booking.html',
    // T21 — the reset link the backend emails (APP_URL + /reset-password?token=…)
    // is baked in the same way verify-email's is, so this path can't change either.
    '/forgot-password': '/forgot-password.html',
    '/reset-password': '/reset-password.html',
    // T22 — admin panel, same standalone-page pattern as booking/billing.
    '/admin/panel': '/admin.html',
    // T23 — reward redemption, same standalone-page pattern.
    '/consumer/rewards': '/rewards.html',
  };
  return {
    name: 'glow-plus-legacy-route-rewrites',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url.split('?')[0];
        if (routes[path]) req.url = routes[path] + req.url.slice(path.length);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url.split('?')[0];
        if (routes[path]) req.url = routes[path] + req.url.slice(path.length);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), legacyRouteRewrites()],
  css: {
    // The stylesheets here are plain CSS lifted verbatim from the original
    // pages and need no processing. Declaring PostCSS inline also stops Vite
    // searching parent directories for a config — without this it walks up and
    // picks up C:\Users\GCA\Documents\postcss.config.js, which pulls in a
    // Tailwind plugin this project does not have installed.
    postcss: { plugins: [] },
  },
  server: {
    // Port 3000 matches the backend's APP_URL and ALLOWED_ORIGINS.
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // Three separate entry points. The verify-email and billing-result pages
      // ship their own self-contained CSS (which styles bare `body`, `.card`,
      // `h1`, `p`) — keeping them as separate documents is what guarantees they
      // stay pixel-identical instead of colliding with the main site's global
      // stylesheet.
      input: {
        main: resolve(__dirname, 'index.html'),
        verifyEmail: resolve(__dirname, 'verify-email.html'),
        billingResult: resolve(__dirname, 'billing-result.html'),
        booking: resolve(__dirname, 'booking.html'),
        forgotPassword: resolve(__dirname, 'forgot-password.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
        admin: resolve(__dirname, 'admin.html'),
        rewards: resolve(__dirname, 'rewards.html'),
      },
    },
  },
});
