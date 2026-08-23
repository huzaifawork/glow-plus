import { Controller, Post, Req, Res, Headers, Body, UseGuards, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { BillingService } from './billing.service';
import { AuthedRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger('BillingWebhook');

  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  @UseGuards(RequireMerchantGuard)
  checkout(@Req() req: AuthedRequest, @Body('plan') plan?: 'MONTHLY' | 'ANNUAL') {
    return this.billing.createCheckoutSession(req.merchantId!, plan);
  }

  @Post('cancel')
  @UseGuards(RequireMerchantGuard)
  cancel(@Req() req: AuthedRequest) {
    return this.billing.cancelSubscription(req.merchantId!);
  }

  @Post('resume')
  @UseGuards(RequireMerchantGuard)
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
      (err) => {
        // This path used to be silent. Because the handler catches its own
        // errors, a failing webhook returned 400 to Stripe and wrote NOTHING
        // to the log — so a handler that never worked looked like nothing at
        // all. That is how the readPeriod() bug survived. The global filter
        // never sees these, so log here or not at all.
        this.logger.error(`Webhook rejected: ${err.message}`, err.stack);
        return res.status(400).json({ error: err.message });
      },
    );
  }
}
