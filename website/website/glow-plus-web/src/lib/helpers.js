// Lifted verbatim from the prototype's helper block.

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function normPhone(p) {
  return (p || '').replace(/\D/g, '');
}

export function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function formatPhone(p) {
  const d = normPhone(p);
  if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  return p;
}

/* --------------------------------------------------------------------------
   Date formatting shared by every consumer-facing surface (T36).

   These three landed in BookingPage.jsx first (T18). The SPA's consumer
   dashboard needs the same three, so they live here rather than becoming a
   second copy — the two must agree, or the same appointment reads as a
   different time depending on which page you opened.
   -------------------------------------------------------------------------- */

/** Today as `YYYY-MM-DD` in the *viewer's* timezone. `toISOString()` alone is
 *  UTC, which hands someone in UTC-5 yesterday's date all evening. */
export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** "2:30 PM" — a slot inside a day the user has already chosen. */
export function formatSlot(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Tue, Aug 26, 2:30 PM" — a booking, where the day still has to be stated. */
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Aug 26, 2026" — a past event where the time of day is noise. */
export function formatDay(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
