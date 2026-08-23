import { Controller, Post, Req, Res, Headers, Body } from '@nestjs/common';
import type { Response } from 'express';
import { BillingService } from './billing.service';
import { AuthedRequest } from '../../middleware/auth.middleware';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  checkout(@Req() req: AuthedRequest, @Body('plan') plan?: 'MONTHLY' | 'ANNUAL') {
    return this.billing.createCheckoutSession(req.merchantId!, plan);
  }

  @Post('cancel')
  cancel(@Req() req: AuthedRequest) {
    return this.billing.cancelSubscription(req.merchantId!);
  }

  @Post('resume')
  resume(@Req() req: AuthedRequest) {
    return this.billing.resumeSubscription(req.merchantId!);
  }

  /**
   * Stripe webhook endpoint. This route is registered with the raw body
   * parser (see billing.module.ts) instead of the global JSON parser —
   * Stripe's signature check needs the exact bytes Stripe sent, not a
   * re-serialized JSON object.
   */
  @Post('webhook')
  webhook(@Req() req: AuthedRequest & { rawBody: Buffer }, @Headers('stripe-signature') signature: string, @Res() res: Response) {
    return this.billing.handleWebhook(req.rawBody, signature).then(
      (result) => res.status(200).json(result),
      (err) => res.status(400).json({ error: err.message }),
    );
  }
}
