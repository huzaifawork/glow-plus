import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';

/**
 * T54 — wires the cron routes to the existing job classes.
 *
 * The jobs themselves are untouched: same classes, same `run()`, same specs.
 * Only the *trigger* changed, from an in-process timer that cannot fire on
 * serverless to an authenticated HTTP call. `JobsModule` now exports its
 * providers so this module can inject them.
 */
@Module({
  imports: [JobsModule],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule {}
