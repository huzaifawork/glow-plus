import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from '../auth/email-verification.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion });const SALT_ROUNDS = 12;

export interface MerchantSignupInput {
  businessName: string;
  email: string;
  password: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

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
    const merchantCount = await this.prisma.merchant.count();
    const foundingMember = merchantCount < 50;

    const merchant = await this.prisma.merchant.create({
      data: {
        businessName: input.businessName,
        email: input.email,
        passwordHash,
        status: 'PENDING',
        stripeCustomerId: stripeCustomer.id,
        foundingMember,
      },
    });

    await this.emailVerification.sendVerificationEmail(merchant.id, 'MERCHANT', merchant.email);

    return { id: merchant.id, businessName: merchant.businessName, status: merchant.status, foundingMember };
  }
}
