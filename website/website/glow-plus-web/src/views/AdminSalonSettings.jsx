import { useRef, useState } from 'react';
import {
  ApiError,
  deleteMerchantLogo,
  updateMerchantLocation,
  uploadMerchantLogo,
} from '../lib/api.js';

/**
 * Operator overrides for one salon's address and logo  (M2)
 *
 * ── Why the console needs this at all ──────────────────────────────────────
 * M2 makes the address required at signup, which guarantees the data for every
 * salon created from now on and nothing whatsoever for the salons already on
 * the platform — all of which were created before the field existed, and every
 * one of which has a null city. It also does nothing for the salon that
 * mistypes an address, or uploads the wrong image, and phones support instead
 * of opening its own portal. Without this the only remedy is an UPDATE typed
 * into the Supabase console, which is not a remedy; it is a habit that
 * eventually writes to the wrong row.
 *
 * ── Why it does not share code with SalonBrandingSettings.jsx ─────────────
 * The two look similar and are not the same thing. That one is gated on W1's
 * subscription rule and edits "my salon"; this is an operator acting on
 * someone else's salon, and it must not inherit that gate — the case it exists
 * for includes taking down a logo immediately, which cannot wait on a
 * customer's billing state.
 */

/** Mirrors the API's own ceiling, so nobody is told at the end of a 2 MB
 *  upload what could have been said before it started. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** The four formats the API's magic-byte sniffer accepts. SVG is not one. */
const ACCEPTED = 'image/png,image/jpeg,image/gif,image/webp';

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function AdminSalonSettings({ merchant, onChanged }) {
  const [form, setForm] = useState({
    addressLine: merchant.addressLine ?? '',
    city: merchant.city ?? '',
    region: merchant.region ?? '',
    postalCode: merchant.postalCode ?? '',
    latitude: merchant.latitude ?? '',
    longitude: merchant.longitude ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(null);
  };

  const hasLat = String(form.latitude).trim() !== '';
  const hasLng = String(form.longitude).trim() !== '';

  async function saveLocation(e) {
    e.preventDefault();

    // Both or neither. A salon with a latitude and no longitude is not "partly
    // located", it is on the prime meridian. Checked here as well as by the
    // API and a database CHECK so the operator gets a sentence, not a 400.
    if (hasLat !== hasLng) {
      setErr('Enter both latitude and longitude, or leave both blank.');
      return;
    }

    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      await updateMerchantLocation(merchant.id, {
        // `null` clears, a value sets — the same distinction the salon's own
        // form relies on, so a mistyped address can be removed rather than
        // only overwritten.
        addressLine: form.addressLine.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        postalCode: form.postalCode.trim() || null,
        latitude: hasLat ? Number(form.latitude) : null,
        longitude: hasLng ? Number(form.longitude) : null,
      });
      setSaved('Address saved.');
      onChanged?.();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    // Cleared immediately so choosing the SAME file again after an error still
    // fires a change event.
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_LOGO_BYTES) {
      setErr('That image is ' + humanSize(file.size) + '. The maximum logo size is 2 MB.');
      return;
    }

    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('That file could not be read.'));
        reader.readAsDataURL(file);
      });
      await uploadMerchantLogo(merchant.id, dataUrl);
      setSaved('Logo uploaded.');
      onChanged?.();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      await deleteMerchantLogo(merchant.id);
      setSaved('Logo removed.');
      onChanged?.();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  const mapsQuery =
    [form.addressLine, form.city, form.region].filter(Boolean).join(', ') ||
    merchant.businessName ||
    '';

  return (
    <div className="admin-salon-settings">
      <form onSubmit={saveLocation} className="admin-settings-form">
        <input
          type="text"
          value={form.addressLine}
          onChange={set('addressLine')}
          maxLength={300}
          placeholder="Street address"
          aria-label="Street address"
        />

        <div className="admin-settings-row">
          <input
            type="text"
            value={form.city}
            onChange={set('city')}
            maxLength={120}
            placeholder="City"
            aria-label="City"
          />
          <input
            type="text"
            value={form.region}
            onChange={set('region')}
            maxLength={120}
            placeholder="Province / state"
            aria-label="Province or state"
          />
          <input
            type="text"
            value={form.postalCode}
            onChange={set('postalCode')}
            maxLength={20}
            placeholder="Postal code"
            aria-label="Postal code"
          />
        </div>

        <div className="admin-settings-row">
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            value={form.latitude}
            onChange={set('latitude')}
            placeholder="Latitude"
            aria-label="Latitude"
          />
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            value={form.longitude}
            onChange={set('longitude')}
            placeholder="Longitude"
            aria-label="Longitude"
          />
        </div>

        {/* Leaving both blank is the normal case — the API geocodes the address
            on save. These are the override for the addresses it cannot place,
            which is why the manual route is spelled out rather than assumed. */}
        <div className="hint">
          Leave the coordinates blank and they are worked out from the address when you save. If
          that fails, open{' '}
          <a
            href={'https://www.google.com/maps/search/' + encodeURIComponent(mapsQuery)}
            target="_blank"
            rel="noreferrer"
          >
            the salon in Google Maps
          </a>
          , right-click the pin, and paste the two numbers here.
        </div>

        <div className="admin-settings-actions">
          <button type="submit" className="toggle active" disabled={busy}>
            {busy ? '…' : 'Save address'}
          </button>
        </div>
      </form>

      <div className="admin-settings-logo">
        {merchant.logoUrl ? (
          <img src={merchant.logoUrl} alt={merchant.businessName + ' logo'} />
        ) : (
          <div className="admin-logo-empty">No logo</div>
        )}
        <div className="admin-settings-actions">
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
            {busy ? '…' : merchant.logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {merchant.logoUrl ? (
            <button type="button" className="toggle inactive" disabled={busy} onClick={removeLogo}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {err ? (
        <p className="err" role="alert">
          {err}
        </p>
      ) : null}
      {saved ? <p className="lc-meta">{saved}</p> : null}
    </div>
  );
}
