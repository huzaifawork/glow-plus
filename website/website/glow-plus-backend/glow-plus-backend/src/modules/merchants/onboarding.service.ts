import { Injectable, ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { FOUNDING_MEMBER_CAP } from './founding';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion,
});

const SALT_ROUNDS = 12;

export interface MerchantSignupInput {
  businessName: string;
  email: string;
  password: string;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  /**
   * T31 — [F28] and [F27]'s structural half, as in
   * `AuthService.signupConsumer`, but resolved differently here on purpose.
   *
   * **[F28], the check-then-create race.** On the consumer path the
   * pre-check was simply deleted and the unique index left to do the job it
   * was always actually doing. That is *not* right here, because this method
   * creates a **Stripe customer before the database row**: with no
   * pre-check, every duplicate signup attempt — including an ordinary user
   * double-clicking a button — would create a real Stripe customer and only
   * then fail at the index, leaving an orphan behind. T20 left three orphans
   * exactly this way.
   *
   * So the pre-check stays, **demoted to what it always really was: a fast
   * path**, not a correctness mechanism. Catching `P2002` below is the actual
   * guarantee, and it is what makes the concurrent case correct rather than
   * correct-by-luck. (T16's filter already mapped P2002 to a 409, so the
   * status code does not change; what changes is that this service now states
   * the rule itself instead of depending on a global filter to infer it.)
   *
   * **Known limitation, deliberately not fixed in a security pass:** a *true*
   * race — two requests interleaving past the pre-check — still orphans one
   * Stripe customer. The real fix is to reorder so the database row is
   * created first and Stripe second, but `stripeCustomerId` is how
   * `billing.service.ts:227` finds a merchant from a webhook, so reordering
   * changes billing behaviour and belongs with T57's deployment work, not
   * here.
   *
   * **[F27]: the verification email can no longer fail a committed signup.**
   * Same reasoning as the consumer path — and it matters more here, because
   * by the time the email is sent this signup has already taken a Stripe
   * customer and a database row.
   */
  async signup(input: MerchantSignupInput) {
    const existing = await this.prisma.merchant.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('A salon with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const stripeCustomer = await stripe.customers.create({
      email: input.email,
      name: input.businessName,
    });

    // First 50 salons/spas on the platform get an extra free month on top
    // of the standard 7-day trial — decided at signup time so the offer
    // can't be gamed by re-signing up after the 50th account lands.
    // T43 — the 50 is FOUNDING_MEMBER_CAP now, shared with the public
    // spots-left counter so the landing page cannot advertise a spot this
    // line is about to refuse.
    const merchantCount = await this.prisma.merchant.count();
    const foundingMember = merchantCount < FOUNDING_MEMBER_CAP;

    let merchant;
    try {
      merchant = await this.prisma.merchant.create({
        data: {
          businessName: input.businessName,
          email: input.email,
          passwordHash,
          status: 'PENDING',
          stripeCustomerId: stripeCustomer.id,
          foundingMember,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('A salon with this email already exists');
      }
      throw err;
    }

    try {
      await this.emailVerification.sendVerificationEmail(merchant.id, 'MERCHANT', merchant.email);
    } catch (err) {
      this.logger.error(
        `Merchant signup succeeded for ${merchant.id} but the verification email failed to send`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return { id: merchant.id, businessName: merchant.businessName, status: merchant.status, foundingMember };
  }
}
