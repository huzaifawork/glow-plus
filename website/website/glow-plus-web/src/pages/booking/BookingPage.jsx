/**
 * Consumer booking flow — T18.
 *
 * A dedicated page, same pattern as BillingManager.jsx (T17): a real page
 * calling the real API (lib/api.js), built to prove the booking mechanism
 * end-to-end before the full consumer portal (T36, which needs T35's auth UI
 * first) exists. Login is here rather than reusing ConsumerAuth because that
 * view is still the prototype's fake one with no password field [F9].
 *
 * Flow: sign in -> pick a salon (GET /merchants/public) -> pick a style
 * (GET /styles/public/:id) -> pick a date and see open slots
 * (GET /bookings/availability) -> book (POST /bookings) -> see it under
 * "Your bookings" (GET /bookings/me) -> cancel (PATCH /bookings/:id/cancel).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  cancelBooking,
  clearConsumerToken,
  consumerLogin,
  createBooking,
  getAvailability,
  getConsumerToken,
  listMyBookings,
  listPublicMerchants,
  listPublicStyles,
} from '../../lib/api.js';
// Shared with the SPA's consumer dashboard (T36) so the two never disagree
// about how a time is written.
import { formatDateTime, formatSlot, todayISO } from '../../lib/helpers.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

const CANCELLABLE = new Set(['PENDING', 'CONFIRMED']);

export default function BookingPage() {
  const [authed, setAuthed] = useState(() => Boolean(getConsumerToken()));

  if (!authed) {
    return (
      <div className="page">
        <div className="card center">
          <Brand />
          <LoginCard onSuccess={() => setAuthed(true)} />
        </div>
      </div>
    );
  }

  function logOut() {
    clearConsumerToken();
    setAuthed(false);
  }

  return (
    <div className="page">
      <div className="topbar">
        <Brand />
        <button className="btn btn-quiet btn-small" onClick={logOut}>
          Log out
        </button>
      </div>
      <BookingForm />
      <MyBookings />
    </div>
  );
}

function LoginCard({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await consumerLogin(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in to book</h1>
      <p>Sign in with your Glow+ account to book an appointment.</p>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}

function BookingForm() {
  const [merchants, setMerchants] = useState([]);
  const [merchantId, setMerchantId] = useState('');
  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    listPublicMerchants()
      .then((data) => {
        setMerchants(data);
        if (data.length) setMerchantId(data[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!merchantId) return;
    setStyleId('');
    setStyles([]);
    setSlots(null);
    listPublicStyles(merchantId)
      .then((data) => {
        setStyles(data);
        if (data.length) setStyleId(data[0].id);
      })
      .catch((err) => setError(err.message));
  }, [merchantId]);

  const checkAvailability = useCallback(async () => {
    if (!merchantId || !styleId || !date) return;
    setLoading(true);
    setError(null);
    setSlots(null);
    setSelectedSlot(null);
    try {
      setSlots(await getAvailability(merchantId, styleId, date));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [merchantId, styleId, date]);

  async function submitBooking() {
    if (!selectedSlot) return;
    setBooking(true);
    setError(null);
    setConfirmed(null);
    try {
      const result = await createBooking({
        merchantId,
        styleId,
        startTime: selectedSlot.startTime,
        notes,
      });
      setConfirmed(result);
      setSlots(null);
      setSelectedSlot(null);
      setNotes('');
      window.dispatchEvent(new CustomEvent('glowplus:booking-created'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="card">
      <h2>Book an appointment</h2>

      <div className="form">
        <label className="field">
          <span>Salon</span>
          <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
            {merchants.length === 0 ? <option value="">No salons available yet</option> : null}
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.businessName}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Service</span>
          <select value={styleId} onChange={(e) => setStyleId(e.target.value)} disabled={!styles.length}>
            {styles.length === 0 ? <option value="">No services available</option> : null}
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min)
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Date</span>
          <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!merchantId || !styleId || loading}
          onClick={checkAvailability}
        >
          {loading ? 'Checking…' : 'Check availability'}
        </button>
      </div>

      {slots ? (
        slots.length ? (
          <div className="slots">
            {slots.map((slot) => (
              <button
                key={slot.startTime}
                type="button"
                className={'slot' + (selectedSlot?.startTime === slot.startTime ? ' selected' : '')}
                onClick={() => setSelectedSlot(slot)}
              >
                {formatSlot(slot.startTime)}
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-note">No open times on this date. Try another day.</p>
        )
      ) : null}

      {selectedSlot ? (
        <div className="form" style={{ marginTop: 14 }}>
          <label className="field">
            <span>Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the salon should know" />
          </label>
          <button type="button" className="btn btn-primary" disabled={booking} onClick={submitBooking}>
            {booking ? 'Booking…' : `Book ${formatSlot(selectedSlot.startTime)}`}
          </button>
        </div>
      ) : null}

      {confirmed ? (
        <p className="err" style={{ color: 'var(--sage)', background: 'rgba(13,138,95,0.08)' }} role="status">
          Booked — {confirmed.style.name} on {formatDateTime(confirmed.startTime)}.
        </p>
      ) : null}

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MyBookings() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBookings(await listMyBookings());
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearConsumerToken();
        window.location.reload();
        return;
      }
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('glowplus:booking-created', load);
    return () => window.removeEventListener('glowplus:booking-created', load);
  }, [load]);

  async function cancel(id) {
    setCancelling(id);
    setError(null);
    try {
      await cancelBooking(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="card">
      <h2>Your bookings</h2>
      {bookings === null ? <p>Loading…</p> : null}
      {bookings && bookings.length === 0 ? <p className="empty-note">No bookings yet.</p> : null}
      {bookings && bookings.length ? (
        <div className="bookings-list">
          {bookings.map((b) => (
            <div className="booking-row" key={b.id}>
              <div className="booking-info">
                <div className="booking-salon">
                  {b.merchant.businessName}
                  <span className={`badge badge-${b.status}`}>{b.status}</span>
                </div>
                <div className="booking-style">{b.style.name}</div>
                <div className="booking-time">{formatDateTime(b.startTime)}</div>
              </div>
              {CANCELLABLE.has(b.status) ? (
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  disabled={cancelling === b.id}
                  onClick={() => cancel(b.id)}
                >
                  {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
