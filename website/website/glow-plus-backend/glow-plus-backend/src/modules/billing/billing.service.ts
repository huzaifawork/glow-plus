import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { sendEmail } from '../notifications/email.provider';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion });
// $49.99/mo or $479.99/yr (~20% off the monthly rate).
const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY ?? 'price_monthly_placeholder';
const PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL ?? 'price_annual_placeholder';

const STANDARD_TRIAL_DAYS = 7;
const FOUNDING_MEMBER_BONUS_DAYS = 30; // "first 50 salons & spas get their first month free"

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async createCheckoutSession(merchantId: string, plan: 'MONTHLY' | 'ANNUAL' = 'MONTHLY') {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    // Everyone gets the standard 7-day trial; founding members (first 50
    // signups) stack an extra free month on top of that.
    const trialDays = STANDARD_TRIAL_DAYS + (merchant.foundingMember ? FOUNDING_MEMBER_BONUS_DAYS : 0);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: merchant.stripeCustomerId ?? undefined,
      line_items: [{ price: plan === 'ANNUAL' ? PRICE_ID_ANNUAL : PRICE_ID_MONTHLY, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { plan, foundingMember: String(merchant.foundingMember) },
      },
      success_url: `${APP_URL}/business/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,      cancel_url: `${APP_URL}/business/billing?canceled=true`,
      metadata: { merchantId, plan },
    });

    return { url: session.url, trialDays };
  }

  /** POST /billing/cancel — cancels at period end, access continues until then. */
  async cancelSubscription(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { subscription: true },
    });
    if (!merchant?.subscription) throw new NotFoundException('No active subscription');

    await stripe.subscriptions.update(merchant.subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    return this.prisma.subscription.update({
      where: { id: merchant.subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
  }

  /** POST /billing/resume — undoes a pending cancellation. */
  async resumeSubscription(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { subscription: true },
    });
    if (!merchant?.subscription) throw new NotFoundException('No subscription to resume');

    await stripe.subscriptions.update(merchant.subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    return this.prisma.subscription.update({
      where: { id: merchant.subscription.id },
      data: { cancelAtPeriodEnd: false },
    });
  }

  /**
   * Central Stripe webhook handler. Verifies the signature against the raw
   * body (wired up in billing.module.ts / main.ts) before touching any data.
   */
  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.trial_will_end':
        await this.onTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      default:
        break; // ignore events we don't act on
    }

    return { received: true };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const merchantId = session.metadata?.merchantId;
    const plan = (session.metadata?.plan as 'MONTHLY' | 'ANNUAL' | undefined) ?? 'MONTHLY';
    if (!merchantId || !session.subscription) return;

    const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
    const priceCents = plan === 'ANNUAL' ? 47999 : 4999;

    await this.prisma.subscription.upsert({
      where: { merchantId },
      create: {
        merchantId,
        stripeSubscriptionId: stripeSub.id,
        plan,
        priceCents,
        status: stripeSub.status === 'trialing' ? 'TRIALING' : 'ACTIVE',
        trialStart: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : null,
        trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      },
      update: {
        stripeSubscriptionId: stripeSub.id,
        plan,
        priceCents,
        status: stripeSub.status === 'trialing' ? 'TRIALING' : 'ACTIVE',
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      },
    });

    await this.prisma.merchant.update({ where: { id: merchantId }, data: { status: 'ACTIVE' } });
  }

  private async onSubscriptionUpdated(sub: Stripe.Subscription) {
    const existing = await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
    if (!existing) return;

    await this.prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: this.mapStripeStatus(sub.status),
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });

    if (sub.status === 'past_due') {
      await this.prisma.merchant.update({ where: { id: existing.merchantId }, data: { status: 'PAST_DUE' } });
    }
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription) {
    const existing = await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
    if (!existing) return;

    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id: existing.id }, data: { status: 'CANCELED' } }),
      this.prisma.merchant.update({ where: { id: existing.merchantId }, data: { status: 'CANCELLED' } }),
    ]);
  }

  private async onPaymentFailed(invoice: Stripe.Invoice) {
    const merchant = await this.prisma.merchant.findFirst({ where: { stripeCustomerId: invoice.customer as string } });
    if (!merchant) return;

    await this.prisma.merchant.update({ where: { id: merchant.id }, data: { status: 'PAST_DUE' } });
    await sendEmail({ to: merchant.email, template: 'payment-failed', data: { invoiceUrl: invoice.hosted_invoice_url } });
  }

  private async onTrialWillEnd(sub: Stripe.Subscription) {
    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
      include: { merchant: true },
    });
    if (!existing) return;

    await sendEmail({
      to: existing.merchant.email,
      template: 'trial-ending-soon',
      data: { trialEnd: existing.trialEnd },
    });
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' {
    switch (status) {
      case 'trialing':
        return 'TRIALING';
      case 'past_due':
        return 'PAST_DUE';
      case 'canceled':
        return 'CANCELED';
      default:
        return 'ACTIVE';
    }
  }
}
