import { API_PREFIX } from './version';

/**
 * Where this API is reachable from the public internet.
 *
 * Needed because W5 requires the logo to arrive "through the same platform
 * data that the app and any other Glow+ surface read from" — i.e. `logoUrl` is
 * a field on the salon in `GET /merchants`, and every consumer of that field
 * renders it directly into an `<img>` or an RN `<Image>`. Those two cannot
 * agree on how to resolve a RELATIVE url: the website's `API_BASE_URL` already
 * ends in `/v1`, the app's `apiBaseUrl` does too, and a browser would resolve
 * `/merchants/x/logo` against the SITE's origin, not the API's. So the server
 * emits an absolute URL and neither client has to know anything.
 *
 * `PUBLIC_API_URL` is deliberately its own variable and not derived from
 * `APP_URL`: `APP_URL` is the WEBSITE (glowplusmember.com), and the API lives
 * on a different host (glow-plus-api-six.vercel.app). Conflating them would
 * produce logo URLs that 404 on the website's own origin.
 *
 * Unset, it falls back to the local dev origin, which is right for a fresh
 * clone and wrong in production — so `env.validation.ts` warns about it there,
 * the same way it warns about a localhost `APP_URL`.
 */
export function publicApiOrigin(): string {
  const raw = process.env.PUBLIC_API_URL?.trim();
  if (!raw) return 'http://localhost:4000';
  return raw.replace(/\/+$/, '');
}

/**
 * An absolute, versioned URL for a path on this API.
 *
 * `absoluteApiUrl('merchants/x/logo')` → `https://api.example.com/v1/merchants/x/logo`
 *
 * The version comes from `API_PREFIX`, not from `PUBLIC_API_URL`, so an
 * operator who sets the variable WITH a `/v1` on the end does not get `/v1/v1`.
 * Anything already ending in the prefix is treated as the origin plus prefix
 * and not doubled.
 */
export function absoluteApiUrl(path: string): string {
  const origin = publicApiOrigin();
  const clean = path.replace(/^\/+/, '');
  if (origin.endsWith(`/${API_PREFIX}`)) return `${origin}/${clean}`;
  return `${origin}/${API_PREFIX}/${clean}`;
}
