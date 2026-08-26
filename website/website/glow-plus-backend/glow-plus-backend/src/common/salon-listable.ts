import { Prisma } from '@prisma/client';

/**
 * What it takes for a salon to be shown to customers.  [F74]
 *
 * **The gap this closes.** Two gates were built independently and neither
 * required the other: an admin **approves** a salon, and a salon **subscribes**.
 * `RequireActiveSubscriptionGuard` refuses SUSPENDED and CANCELLED and makes
 * PAST_DUE read-only — but it never consults the `Subscription` table at all,
 * so an `ACTIVE` merchant that **never subscribed** passed straight through.
 * Approval alone granted a permanent free listing, and no cron job downgraded
 * it either: `trialEndingReminder` only looks at subscriptions already
 * `TRIALING`, and with no subscription there is no trial, no trial end and no
 * webhook. It is the exact twin of [F50] — that one is *paying bypasses
 * approval*, this was *approval bypasses paying*.
 *
 * **Why hidden rather than locked out.** A salon that has not subscribed keeps
 * full access to its own portal — it can add styles, set hours and prepare —
 * it simply does not appear in "Find a salon" until it starts a plan. Locking
 * it out of its own data would punish a salon the operator approved as a
 * favour, and it is the same shape the product already uses for PAST_DUE:
 * hidden, not barred.
 *
 * ⚠️ **A salon must be TOLD.** Hiding a salon silently is worse than the bug —
 * they would sit waiting for customers who can never find them. The portal
 * banner in `BusinessPortal.jsx` states it and links to Billing; do not remove
 * one without the other.
 *
 * ⚠️ **This predicate is shared deliberately.** The directory query and the
 * per-salon guard must agree, or a salon is absent from the list and still
 * reachable by URL — which is how [F47] happened. One definition, two callers.
 */

/** Subscription states that count as paying (a trial is a paid plan not yet billed). */
export const LISTABLE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE'] as const;

/**
 * The `where` fragment for "a customer may see this salon".
 *
 * `status: 'ACTIVE'` is the approval half; the subscription half is the new
 * one. Expressed as a relation filter so it stays a single query.
 */
export const LISTABLE_MERCHANT_WHERE: Prisma.MerchantWhereInput = {
  status: 'ACTIVE',
  subscription: { is: { status: { in: [...LISTABLE_SUBSCRIPTION_STATUSES] } } },
};

/** The same rule, for a merchant already loaded. */
export function isListable(merchant: {
  status: string;
  subscription: { status: string } | null;
}): boolean {
  return (
    merchant.status === 'ACTIVE' &&
    merchant.subscription != null &&
    (LISTABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(merchant.subscription.status)
  );
}
