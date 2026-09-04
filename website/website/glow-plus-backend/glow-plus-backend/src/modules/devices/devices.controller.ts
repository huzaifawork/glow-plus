import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto';
import { ConsumerRequest } from '../../middleware/auth.middleware';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';

/**
 * `/me/devices` — where the mobile app says "notify THIS phone"  (M1, R4.5)
 *
 * Under `/me` and consumer-guarded, like everything else that scopes off
 * `req.accountId`: a merchant token carries an accountId too, so without the
 * guard a salon's staff account could register itself for a customer's
 * notifications. Same reasoning as `MeController`.
 *
 * There is deliberately no `GET` here. A list of a customer's devices is not
 * something any screen needs, and it would be an inventory of a person's
 * phones sitting behind a 15-minute access token.
 */
@Controller('me/devices')
@UseGuards(RequireConsumerGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  register(@Req() req: ConsumerRequest, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(req.accountId, dto.token, dto.platform ?? 'unknown');
  }

  @Delete()
  unregister(@Req() req: ConsumerRequest, @Body() dto: UnregisterDeviceDto) {
    return this.devices.unregister(req.accountId, dto.token);
  }
}
