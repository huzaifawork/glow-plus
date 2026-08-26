import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ThrottleCredentials } from '../../common/throttling';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './login.dto';
import { AdminMerchantsQueryDto } from './merchants-query.dto';
import { RequireAdminGuard } from '../../common/guards/require-admin.guard';
import { AuthedRequest } from '../../middleware/auth.middleware';
import { RequireAdminOwnerGuard } from '../../common/guards/require-admin-owner.guard';
import { ChangeAdminPasswordDto, PromoteUserDto } from './admin-management.dto';

// Every route except login sits behind RequireAdminGuard (T22) [F7]. Login
// itself must stay reachable with no bearer token — it's also excluded from
// AuthMiddleware in app.module.ts, the same pattern as merchants/login.
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  @ThrottleCredentials()
  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuth.login(dto);
  }

  // The whole merchant directory, optionally narrowed by status (T38). The
  // approval queue below is the `status=PENDING` case, kept as its own route
  // because the admin panel and the backend's own tests both name it — but
  // the console's "All salons" list needs the unfiltered view, and until now
  // nothing exposed it.
  //
  // Bound as a whole DTO object, not `@Query('status')`: a loose @Query param
  // is not validated at all [F38], and an unchecked status string reaches a
  // Prisma enum filter as a 500 rather than a 400.
  /**
   * Who am I? Lets the console restore an admin session from a stored token
   * [F51]. Guarded like every other /admin route except login — the identity
   * it returns is the caller's own, but confirming an admin account exists
   * for a token is itself an answer only an admin should get.
   */
  @UseGuards(RequireAdminGuard)
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.admin.profile(req.accountId!);
  }

  @UseGuards(RequireAdminGuard)
  @Get('merchants')
  merchants(@Query() query: AdminMerchantsQueryDto) {
    return this.admin.listMerchants(query.status);
  }

  @UseGuards(RequireAdminGuard)
  @Get('merchants/pending')
  pending() {
    return this.admin.pendingMerchants();
  }

  @UseGuards(RequireAdminGuard)
  @Patch('merchants/:id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approveMerchant(id);
  }

  @UseGuards(RequireAdminGuard)
  @Patch('merchants/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.admin.suspendMerchant(id);
  }

  @UseGuards(RequireAdminGuard)
  @Get('metrics/mrr')
  mrr() {
    return this.admin.mrr();
  }

  @UseGuards(RequireAdminGuard)
  @Get('metrics/churn')
  churn() {
    return this.admin.churn();
  }

  @UseGuards(RequireAdminGuard)
  @Get('metrics/platform')
  platform() {
    return this.admin.platformStats();
  }

  // -------------------------------------------------------------------------
  // Admin team management  (T77)
  //
  // Guarded by RequireAdminOwnerGuard, not RequireAdminGuard: approving a
  // salon and deciding who administers the platform are different powers, and
  // an admin who can mint admins makes one stolen session permanent.
  //
  // The CLI script and a direct database INSERT both still work and are
  // deliberately unchanged — they are the bootstrap path for the very first
  // owner, which by definition cannot be created through a route that
  // requires already being one.
  // -------------------------------------------------------------------------

  @UseGuards(RequireAdminOwnerGuard)
  @Get('admins')
  listAdmins() {
    return this.admin.listAdmins();
  }

  /**
   * Customers, for the promote picker. Owner-only and capped at 50 rows:
   * scoped to the one job it exists for, rather than becoming a general
   * customer directory that every admin can page through.
   */
  @UseGuards(RequireAdminOwnerGuard)
  @Get('users')
  listUsers(@Query('q') q?: string) {
    return this.admin.listUsers(q);
  }

  /** Promote an existing customer; reuses their password, never issues one. */
  @UseGuards(RequireAdminOwnerGuard)
  @Post('admins/promote')
  promoteUser(@Body() dto: PromoteUserDto) {
    return this.admin.promoteUser(dto);
  }

  /**
   * Change your own password. RequireAdminGuard, not the owner guard: every
   * admin must be able to rotate their own credential, and before T77 none of
   * them could — `forgot-password` never looked at the Admin table, and
   * answered `{ ok: true }` anyway, so the failure was silent.
   */
  @ThrottleCredentials()
  @UseGuards(RequireAdminGuard)
  @Patch('me/password')
  changePassword(@Req() req: AuthedRequest, @Body() dto: ChangeAdminPasswordDto) {
    return this.admin.changeOwnPassword(req.accountId!, dto);
  }
}
