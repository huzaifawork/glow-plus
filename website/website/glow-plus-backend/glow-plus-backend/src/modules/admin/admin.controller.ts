import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottleCredentials } from '../../common/throttling';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './login.dto';
import { AdminMerchantsQueryDto } from './merchants-query.dto';
import { RequireAdminGuard } from '../../common/guards/require-admin.guard';

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
}
