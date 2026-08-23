import { Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';

// NOTE: every route here should sit behind an AdminGuard checking
// req.accountRole === 'admin' (see auth.middleware.ts). Omitted here to
// keep the sample focused — do not deploy this module without it.
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('merchants/pending')
  pending() {
    return this.admin.pendingMerchants();
  }

  @Patch('merchants/:id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approveMerchant(id);
  }

  @Patch('merchants/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.admin.suspendMerchant(id);
  }

  @Get('metrics/mrr')
  mrr() {
    return this.admin.mrr();
  }

  @Get('metrics/churn')
  churn() {
    return this.admin.churn();
  }

  @Get('metrics/platform')
  platform() {
    return this.admin.platformStats();
  }
}
