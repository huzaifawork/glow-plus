import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? 'http://localhost:4000';
const TOKEN_KEY = 'glowplus_token';

// Flip this off once your backend is deployed and `apiBaseUrl` in app.json
// points at it. With it on, the app runs entirely on realistic mock data —
// useful for previewing the UI in Expo Go without standing up a server.
export const DEMO_MODE = true;

async function request(path, options = {}) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Demo data — mirrors the exact shape of GET /me/rewards from the backend,
// so swapping DEMO_MODE off requires no changes to any screen.
// ---------------------------------------------------------------------------
const DEMO_REWARDS = {
  totalPoints: 340,
  merchants: [
    {
      merchantId: 'm1',
      businessName: 'Bloom Hair Studio',
      points: 200,
      rewards: [
        {
          ruleId: 'r1',
          name: '20% Off Loyalty Reward',
          triggerType: 'VISIT_COUNT',
          triggerValue: 5,
          progress: 4,
          remaining: 1,
          rewardType: 'PERCENT_OFF',
          rewardValue: 20,
        },
      ],
      recentVisits: [
        { id: 'v1', styleName: 'Silk Press', styleType: 'HAIR', pointsEarned: 40, visitDate: '2026-08-01T15:00:00Z' },
        { id: 'v2', styleName: 'Silk Press', styleType: 'HAIR', pointsEarned: 40, visitDate: '2026-07-10T15:00:00Z' },
        { id: 'v3', styleName: 'Balayage', styleType: 'HAIR', pointsEarned: 60, visitDate: '2026-06-02T15:00:00Z' },
      ],
    },
    {
      merchantId: 'm2',
      businessName: 'Polished Nail Bar',
      points: 140,
      rewards: [
        {
          ruleId: 'r2',
          name: 'Free Gel Mani',
          triggerType: 'VISIT_COUNT',
          triggerValue: 6,
          progress: 3,
          remaining: 3,
          rewardType: 'FREE_SERVICE',
          rewardValue: 1,
        },
      ],
      recentVisits: [
        { id: 'v4', styleName: 'French Tip Gel', styleType: 'NAIL', pointsEarned: 35, visitDate: '2026-07-28T15:00:00Z' },
        { id: 'v5', styleName: 'French Tip Gel', styleType: 'NAIL', pointsEarned: 35, visitDate: '2026-07-01T15:00:00Z' },
      ],
    },
  ],
};

export async function login(email, password) {
  if (DEMO_MODE) {
    await saveToken('demo-token');
    return { token: 'demo-token', user: { id: 'demo-user', name: 'Joseph Ilunga', emailVerified: true } };
  }
  const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await saveToken(result.token);
  return result;
}

export async function signup(name, email, password, phone) {
  if (DEMO_MODE) {
    await saveToken('demo-token');
    return { id: 'demo-user', name, email };
  }
  return request('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password, phone }) });
}

export async function fetchMyRewards() {
  if (DEMO_MODE) {
    return new Promise((resolve) => setTimeout(() => resolve(DEMO_REWARDS), 400));
  }
  return request('/me/rewards');
}

export async function logout() {
  await clearToken();
}

// ---------------------------------------------------------------------------
// Booking flow — GET /merchants (public salon directory), GET /styles/public/:id,
// GET /bookings/availability, POST /bookings, GET /bookings/me, PATCH cancel.
// Same endpoints the website's consumer booking flow uses.
// ---------------------------------------------------------------------------
const DEMO_MERCHANTS = [
  { id: 'm1', businessName: 'Bloom Hair Studio' },
  { id: 'm2', businessName: 'Polished Nail Bar' },
];
const DEMO_STYLES = {
  m1: [
    { id: 's1', name: 'Silk Press', type: 'HAIR', pointsPerVisit: 40, durationMinutes: 45 },
    { id: 's2', name: 'Balayage', type: 'HAIR', pointsPerVisit: 60, durationMinutes: 90 },
  ],
  m2: [{ id: 's3', name: 'French Tip Gel', type: 'NAIL', pointsPerVisit: 35, durationMinutes: 30 }],
};
let DEMO_BOOKINGS = [
  {
    id: 'b1',
    merchantId: 'm1',
    merchant: { businessName: 'Bloom Hair Studio' },
    styleId: 's1',
    style: { name: 'Silk Press', durationMinutes: 45 },
    startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'PENDING',
  },
];

export async function fetchSalons() {
  if (DEMO_MODE) return new Promise((resolve) => setTimeout(() => resolve(DEMO_MERCHANTS), 300));
  return request('/merchants');
}

export async function fetchSalonStyles(merchantId) {
  if (DEMO_MODE) return new Promise((resolve) => setTimeout(() => resolve(DEMO_STYLES[merchantId] || []), 300));
  return request('/styles/public/' + merchantId);
}

/** Returns [{ startTime, endTime }] in ISO format for a given salon/style/date. */
export async function fetchAvailability(merchantId, styleId, dateStr) {
  if (DEMO_MODE) {
    // Simple demo slot generator: 9am–5pm, 30-min steps, matching the
    // duration of the requested style, so this behaves reasonably close
    // to the real server-computed availability without needing a backend.
    const style = (DEMO_STYLES[merchantId] || []).find((s) => s.id === styleId);
    const durationMs = (style?.durationMinutes ?? 30) * 60000;
    const dayStart = new Date(dateStr + 'T09:00:00');
    const dayClose = new Date(dateStr + 'T17:00:00');
    const stepMs = 30 * 60000;
    const slots = [];
    for (let t = dayStart.getTime(); t + durationMs <= dayClose.getTime(); t += stepMs) {
      slots.push({ startTime: new Date(t).toISOString(), endTime: new Date(t + durationMs).toISOString() });
    }
    return new Promise((resolve) => setTimeout(() => resolve(slots), 300));
  }
  const qs = `?merchantId=${encodeURIComponent(merchantId)}&styleId=${encodeURIComponent(styleId)}&date=${encodeURIComponent(dateStr)}`;
  return request('/bookings/availability' + qs);
}

export async function createBooking(merchantId, styleId, startTime, notes) {
  if (DEMO_MODE) {
    const merchant = DEMO_MERCHANTS.find((m) => m.id === merchantId);
    const style = (DEMO_STYLES[merchantId] || []).find((s) => s.id === styleId);
    const booking = {
      id: 'b' + (DEMO_BOOKINGS.length + 1),
      merchantId,
      merchant: { businessName: merchant?.businessName ?? 'Salon' },
      styleId,
      style: { name: style?.name ?? 'Appointment', durationMinutes: style?.durationMinutes ?? 30 },
      startTime,
      status: 'PENDING',
      notes,
    };
    DEMO_BOOKINGS = [booking, ...DEMO_BOOKINGS];
    return new Promise((resolve) => setTimeout(() => resolve(booking), 300));
  }
  return request('/bookings', { method: 'POST', body: JSON.stringify({ merchantId, styleId, startTime, notes }) });
}

export async function fetchMyBookings() {
  if (DEMO_MODE) return new Promise((resolve) => setTimeout(() => resolve(DEMO_BOOKINGS), 300));
  return request('/bookings/me');
}

export async function cancelBooking(bookingId) {
  if (DEMO_MODE) {
    DEMO_BOOKINGS = DEMO_BOOKINGS.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELLED' } : b));
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 300));
  }
  return request('/bookings/' + bookingId + '/cancel', { method: 'PATCH' });
}
