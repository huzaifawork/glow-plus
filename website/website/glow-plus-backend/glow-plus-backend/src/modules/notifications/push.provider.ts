/**
 * Push notifications to the mobile app, via Expo's push service  (R4.5)
 *
 * R4.5: *"The app should notify the user when a booking's status changes (for
 * example, when a salon confirms a pending request), without requiring the
 * user to manually check."*
 *
 * **Why Expo and not APNs/FCM directly.** The app is built with React Native
 * "targeting distribution through Expo" (Technical Constraints), so every
 * install already holds an `ExponentPushToken[...]`. Expo's service fans that
 * out to APNs and FCM, which means this file needs **no certificates, no
 * service-account JSON and no per-platform branch** — the two secrets that
 * would otherwise have to be generated, stored and rotated by hand for a
 * feature the spec marks "should".
 *
 * **Why it is fire-and-forget at every call site.** A notification is a
 * courtesy on top of an action that has already succeeded. If Expo is down,
 * a salon confirming a booking must still confirm the booking — so the sender
 * logs and swallows, exactly as `AuthService.signupConsumer` does for the
 * verification email it cannot send. A failed push is never a failed request.
 *
 * **Mirrors `email.provider.ts` deliberately**, including the `log` default:
 * with `PUSH_PROVIDER` unset, nothing leaves the process and the payload is
 * printed. That is what makes local development and the test suite safe by
 * default rather than by remembering to set something.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo rejects anything past 100 messages in one request. */
const EXPO_BATCH_SIZE = 100;

export interface PushMessage {
  /** `ExponentPushToken[...]` — one device. */
  to: string;
  title: string;
  body: string;
  /**
   * Delivered to the app as `notification.request.content.data`. Used for deep
   * linking: the app opens My Bookings and scrolls to `bookingId`.
   *
   * Never put anything here that is not already on the user's own screen — a
   * push payload passes through Apple's and Google's infrastructure.
   */
  data?: Record<string, unknown>;
}

/**
 * One device token Expo told us is dead.
 *
 * Returned rather than acted on here so the caller — which owns the database —
 * decides what to do with it. `DeviceNotRegistered` is the only Expo error
 * that means "stop sending to this token forever"; every other failure is
 * transient and must NOT cost a user their notifications.
 */
export interface PushResult {
  sent: number;
  /** Tokens to revoke: the app was uninstalled, or notifications were turned off. */
  unregistered: string[];
}

export async function sendPush(messages: PushMessage[]): Promise<PushResult> {
  if (messages.length === 0) return { sent: 0, unregistered: [] };

  if (process.env.PUSH_PROVIDER !== 'expo') {
    for (const message of messages) {
      // eslint-disable-next-line no-console
      console.log(`[push] -> ${message.to}: ${message.title} — ${message.body}`, message.data ?? {});
    }
    return { sent: messages.length, unregistered: [] };
  }

  const unregistered: string[] = [];
  let sent = 0;

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Expo compresses its own responses; asking for identity keeps the
        // parse below trivial on a runtime with no zlib in the request path.
        'Accept-Encoding': 'identity',
        // Optional, and only needed once a project enables "enhanced security"
        // for push. Sent when present so enabling it later is an env change.
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(
        batch.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: 'default',
          // Android needs a channel that the app has created, or the
          // notification arrives silent and without a heads-up banner.
          channelId: 'bookings',
        })),
      ),
    });

    if (!res.ok) {
      // Not thrown: see the note at the top about why a push failure may never
      // become a request failure. The status is what an operator needs.
      // eslint-disable-next-line no-console
      console.error(`[push] Expo returned ${res.status} for a batch of ${batch.length}`);
      continue;
    }

    const payload = (await res.json().catch(() => null)) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    } | null;

    const tickets = payload?.data ?? [];
    tickets.forEach((ticket, index) => {
      if (ticket?.status === 'ok') {
        sent += 1;
        return;
      }
      if (ticket?.details?.error === 'DeviceNotRegistered') {
        unregistered.push(batch[index].to);
      }
    });
  }

  return { sent, unregistered };
}

/**
 * Is this string shaped like a token Expo will accept?
 *
 * Checked before storing rather than only before sending: a malformed token in
 * the table is a row that fails on every future send for a user who thinks
 * notifications are on. `ExponentPushToken[...]` is the Expo Go / EAS form;
 * `ExpoPushToken[...]` is the older spelling Expo still issues in some SDKs
 * and still accepts.
 */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\s\]]+\]$/.test(token.trim());
}
