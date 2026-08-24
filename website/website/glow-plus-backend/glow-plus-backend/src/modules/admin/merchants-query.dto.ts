import { IsIn, IsOptional } from 'class-validator';
import { MerchantStatus } from '@prisma/client';

/** Every status a Merchant row can actually hold — read off the Prisma enum
 *  rather than retyped, so a status added to the schema cannot go missing
 *  here without the compiler noticing. */
export const MERCHANT_STATUSES = Object.values(MerchantStatus);

/**
 * Query for `GET /admin/merchants`  (T38)
 *
 * `status` is genuinely optional — omitting it means "every merchant", which
 * is the admin console's default view. That is exactly the shape [F34] warns
 * about (an absent query param reaching a Prisma `where`), so it is worth
 * saying why it is safe here and was not there: on `/redemptions/available`
 * the missing filter widened one consumer's question into every merchant's
 * data. Here the route is behind `RequireAdminGuard` and the wide answer is
 * the intended one — an admin is *supposed* to see the whole platform.
 *
 * The `@IsIn` is not decoration either. Without it an unknown status string
 * would be cast into Prisma's enum filter and come back as a
 * `PrismaClientValidationError` — a bare 500 for a plainly bad request, the
 * same failure mode [F38] describes. Now 400.
 */
export class AdminMerchantsQueryDto {
  @IsOptional()
  @IsIn(MERCHANT_STATUSES)
  status?: MerchantStatus;
}
