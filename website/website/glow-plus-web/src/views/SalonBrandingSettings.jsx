import React, { useRef, useState } from 'react';
import { ApiError, uploadLogo, deleteLogo, updateSalonLocation } from '../lib/api.js';

/**
 * ============================================================================
 * Salon logo and location — the portal half of the mobile app's requirements.
 * ============================================================================
 *
 * Both controls exist because of the Glow+ App Requirements Spec, and neither
 * is a website feature in its own right:
 *
 *  · **Logo** — Section 8 (W1-W5), which the spec includes precisely because
 *    the app's R3.11-R3.13 depend on it: *"the app can only display a logo
 *    that the website has allowed a salon to upload."*
 *  · **Location** — the dependency note under 4.3.2: *"distance-based sorting
 *    requires every salon to have a registered location on the platform."*
 *    Without an address here, a salon simply cannot appear in the app's
 *    distance-sorted results.
 *
 * ⚠️ **W1 is a real gate, not a hint.** *"A salon's subscription must be
 * active before the website allows that salon to upload a logo. A salon that
 * has not completed subscription checkout must not see or be able to use a
 * logo-upload feature."* So `LogoSetting` renders a prompt to subscribe
 * instead of an upload control when the subscription is not live — and the API
 * refuses the request anyway (`RequireActiveSubscriptionGuard`). The hidden
 * control is the courtesy; the guard is the rule.
 */

/** Mirrors MAX_LOGO_BYTES on the API. Checked here so the user is told before a 3 MB upload. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** W3 — the four formats the API's magic-byte sniffer accepts. SVG is deliberately not one. */
const ACCEPTED = 'image/png,image/jpeg,image/gif,image/webp';

/** Subscription states that count as "checked out" — the same pair the API lists. */
const LIVE_SUBSCRIPTION = ['TRIALING', 'ACTIVE'];

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * W2/W3 — upload a logo, replace it, or take it down.
 *
 * The file is read with `FileReader.readAsDataURL`, which is the same shape
 * Expo's image picker produces, so the API takes one body format from both
 * clients instead of a multipart path for the browser and a JSON path for the
 * app.
 *
 * The size check below duplicates a rule the API also enforces, on purpose: a
 * salon on a slow connection should not spend thirty seconds uploading a photo
 * to be told it was too big. The API remains the authority.
 */
export function LogoSetting({ profile, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const subscribed = LIVE_SUBSCRIPTION.includes(profile?.subscription?.status);
  const logoUrl = profile?.logoUrl ?? null;

  // W1 — not shown at all before checkout.
  if (!subscribed) {
    return (
      <div className="list-card" style={{ display: 'block' }}>
        <div className="lc-name">Business logo</div>
        <div className="lc-meta">
          Start your plan to upload a logo. Once your subscription is active, your logo appears
          beside your salon's name everywhere on Glow+ — the website directory, and the mobile app.
        </div>
      </div>
    );
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    // The input is reset immediately so choosing the SAME file twice (after a
    // failure) still fires a change event.
    event.target.value = '';
    if (!file) return;

    setErr(null);
    setSaved(false);

    if (!file.type.startsWith('image/')) {
      setErr('That file is not an image. Choose a PNG, JPEG, GIF or WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErr(
        `That image is ${humanSize(file.size)}. The maximum logo size is ${humanSize(MAX_LOGO_BYTES)}.`,
      );
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("That file couldn't be read. Try again."));
        reader.readAsDataURL(file);
      });

      await uploadLogo(dataUrl);
      setSaved(true);
      // W5 — the parent refetches so the preview shows the URL the APP will
      // read, not a local blob. A preview built from the local file would look
      // right while the stored image was something else entirely.
      onChanged?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await deleteLogo();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="list-card" style={{ display: 'block' }}>
      <div className="lc-name">Business logo</div>
      <div className="lc-meta" style={{ marginBottom: 10 }}>
        Shown beside your salon's name in the Glow+ directory and in the mobile app. PNG, JPEG, GIF
        or WebP, up to {humanSize(MAX_LOGO_BYTES)}.
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 14,
            background: '#f3f3f7',
            border: '1px solid #e5e5ea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${profile.businessName} logo`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: '#86868b', fontSize: 12 }}>No logo</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="toggle active"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? '…' : logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {logoUrl ? (
            <button type="button" className="toggle" disabled={busy} onClick={handleRemove}>
              Remove
            </button>
          ) : null}
          {saved ? <span className="lc-meta">Saved</span> : null}
        </div>
      </div>

      {err ? (
        <p className="err" role="alert" style={{ marginTop: 8 }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Where the salon is — so it can appear in the app's distance-sorted results.
 *
 * ── Why latitude/longitude are typed in rather than geocoded ───────────────
 * The spec says an address must be one *"that can be converted to map
 * coordinates"*, and every geocoding service is a paid API key, a new secret
 * and a new failure mode. This platform has none configured. So the address is
 * captured for display and the coordinates are captured explicitly, with a
 * link that fills them in from Google Maps in two clicks.
 *
 * That is a deliberate trade and it is honest about what it costs: a salon has
 * to do one extra step once. Adding a geocoder later replaces this pair of
 * fields and nothing else — the columns, the API and the app all already work
 * in coordinates.
 *
 * ── The paired-coordinate rule ─────────────────────────────────────────────
 * Both or neither, enforced here, in the API and by a database CHECK. A salon
 * with a latitude and no longitude is not "partly located" — it is at the prime
 * meridian, which would sort it into the middle of the Atlantic.
 */
export function LocationSetting({ profile, onChanged }) {
  const [form, setForm] = useState({
    addressLine: profile?.addressLine ?? '',
    city: profile?.city ?? '',
    region: profile?.region ?? '',
    postalCode: profile?.postalCode ?? '',
    latitude: profile?.latitude ?? '',
    longitude: profile?.longitude ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  const hasLat = String(form.latitude).trim() !== '';
  const hasLng = String(form.longitude).trim() !== '';

  async function save(e) {
    e.preventDefault();

    if (hasLat !== hasLng) {
      setErr('Enter both latitude and longitude, or leave both blank.');
      return;
    }

    setBusy(true);
    setErr(null);
    setSaved(false);

    try {
      await updateSalonLocation({
        // `null` clears; a value sets. The API distinguishes the two, which is
        // what makes a mistyped address removable.
        addressLine: form.addressLine.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        postalCode: form.postalCode.trim() || null,
        latitude: hasLat ? Number(form.latitude) : null,
        longitude: hasLng ? Number(form.longitude) : null,
      });
      setSaved(true);
      onChanged?.();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="list-card" style={{ display: 'block' }}>
      <div className="lc-name">Address &amp; location</div>
      <div className="lc-meta" style={{ marginBottom: 10 }}>
        Customers see your address on your salon page. Adding coordinates also lets the Glow+ mobile
        app show your salon to people searching near you.
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
        <input
          type="text"
          placeholder="Street address"
          value={form.addressLine}
          onChange={set('addressLine')}
          maxLength={300}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="City"
            value={form.city}
            onChange={set('city')}
            maxLength={120}
            style={{ flex: '2 1 160px' }}
          />
          <input
            type="text"
            placeholder="Province / state"
            value={form.region}
            onChange={set('region')}
            maxLength={120}
            style={{ flex: '1 1 120px' }}
          />
          <input
            type="text"
            placeholder="Postal code"
            value={form.postalCode}
            onChange={set('postalCode')}
            maxLength={20}
            style={{ flex: '1 1 110px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            placeholder="Latitude"
            value={form.latitude}
            onChange={set('latitude')}
            style={{ flex: '1 1 130px' }}
          />
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            placeholder="Longitude"
            value={form.longitude}
            onChange={set('longitude')}
            style={{ flex: '1 1 130px' }}
          />
        </div>

        <div className="hint">
          To find your coordinates: open{' '}
          <a
            href={`https://www.google.com/maps/search/${encodeURIComponent(
              [form.addressLine, form.city, form.region].filter(Boolean).join(', ') ||
                profile?.businessName ||
                '',
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            your salon in Google Maps
          </a>
          , right-click your pin, and copy the two numbers it shows.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="submit" className="toggle active" disabled={busy}>
            {busy ? '…' : 'Save location'}
          </button>
          {saved ? <span className="lc-meta">Saved</span> : null}
        </div>
      </form>

      {err ? (
        <p className="err" role="alert" style={{ marginTop: 8 }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}
