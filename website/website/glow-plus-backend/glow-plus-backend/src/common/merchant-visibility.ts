import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isListable } from './salon-listable';

/**
 * "Is this salon open to customers?"  (T48)
 *
 * One rule, in one place, because four routes have to agree on it and three of
 * them are reachable **without an account** — so a disagreement is not a
 * cosmetic inconsistency, it is a customer being shown something the next
 * request refuses.
 *
 * T44 established the rule for `GET /styles/public/:merchantId`: only an
 * **ACTIVE** merchant is visible, and a PENDING / SUSPENDED / CANCELLED one is
 * a **404** rather than an empty result, so "this salon has no services yet"
 * and "this salon is not open to customers" cannot look identical to the
 * caller. T48 found that the rest of the public browse-and-book path had never
 * been held to it [F47]:
 *
 *   - `GET /bookings/availability` offered free slots at a suspended salon,
 *   - `POST /bookings` **accepted the booking**,
 *   - `GET /business-hours/:merchantId` served its opening hours.
 *
 * So a salon suspended for non-payment kept taking appointments through the
 * public API while its own menu 404'd — the paywall T29 [F30] built for
 * merchant *actions* had no equivalent on the customer side. It was not
 * reachable by browsing (the directory lists ACTIVE only, and the menu 404s),
 * which is exactly why it survived: it needs an id you already have — a
 * bookmark, a deep link, or an app that cached the salon before it lapsed.
 *
 * The default message is T44's, unchanged, so that route behaves byte for byte
 * as it did. Call sites pass a clearer one where the caller is past browsing
 * and a bare "not found" would be unhelpful. Each site still uses ONE message
 * for both the missing and the not-visible case, which is the property that
 * keeps the two indistinguishable.
 */
export async function assertMerchantVisible(
  prisma: PrismaService,
  merchantId: string,
  message = 'Merchant not found',
): Promise<void> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    // Status only. This runs on unauthenticated routes, and an `include` here
    // publishes every salon's bcrypt hash to the open internet [F31].
    // [F74] — the subscription is now part of visibility, so it is selected
    // too. Still a narrow select: an `include` here publishes every salon's
    // bcrypt hash to the open internet [F31].
    select: { status: true, subscription: { select: { status: true } } },
  });

  if (!merchant || !isListable(merchant)) {
    throw new NotFoundException(message);
  }
}
