import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottleCredentials, ThrottleEmailSend } from '../../common/throttling';
import { StaffService } from './staff.service';
import { StaffAuthService } from './staff-auth.service';
import { AcceptInviteDto, InviteStaffDto, StaffLoginDto, UpdateStaffRoleDto } from './dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireMerchantOwnerGuard } from '../../common/guards/require-merchant-owner.guard';

/**
 * Merchant staff accounts + roles  (T24) [F6]
 *
 * Three tiers of access on one controller, and they are the point of the
 * task, so they are stated explicitly rather than left to the reader:
 *
 *   public          — login, invite preview, invite acceptance. Excluded
 *                     from AuthMiddleware in app.module.ts; an invitee has
 *                     no account yet, so they cannot hold a token.
 *   owner-only      — everything that manages staff. Guarded so a hire
 *                     can't promote themselves or delete a colleague.
 *   any merchant    — GET /staff/me, so a staff member can read their own
 *                     role and the UI can hide what they can't use.
 */
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  // --- public -------------------------------------------------------------

  @ThrottleCredentials()
  @Post('login')
  login(@Body() dto: StaffLoginDto) {
    return this.staffAuth.login(dto);
  }

  @ThrottleCredentials()
  @Get('invites/:token')
  previewInvite(@Param('token') token: string) {
    return this.staffAuth.previewInvite(token);
  }

  @ThrottleCredentials()
  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.staffAuth.acceptInvite(dto);
  }

  // --- any merchant account ----------------------------------------------

  @Get('me')
  @UseGuards(RequireMerchantGuard)
  me(@Req() req: MerchantRequest) {
    return this.staffAuth.me(req.accountId, req.merchantId);
  }

  // --- owner only ---------------------------------------------------------

  @Get()
  @UseGuards(RequireMerchantOwnerGuard)
  list(@Req() req: MerchantRequest) {
    return this.staff.list(req.merchantId);
  }

  @ThrottleEmailSend()
  @Post('invites')
  @UseGuards(RequireMerchantOwnerGuard)
  invite(@Req() req: MerchantRequest, @Body() dto: InviteStaffDto) {
    return this.staff.invite(req.merchantId, dto);
  }

  @Delete('invites/:id')
  @UseGuards(RequireMerchantOwnerGuard)
  revokeInvite(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.staff.revokeInvite(req.merchantId, id);
  }

  @Patch(':id/role')
  @UseGuards(RequireMerchantOwnerGuard)
  updateRole(@Req() req: MerchantRequest, @Param('id') id: string, @Body() dto: UpdateStaffRoleDto) {
    return this.staff.updateRole(req.merchantId, id, dto.role);
  }

  @Delete(':id')
  @UseGuards(RequireMerchantOwnerGuard)
  remove(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.staff.remove(req.merchantId, id);
  }
}
