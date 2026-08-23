import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { StylesService } from './styles.service';
import { CreateStyleDto, UpdateStyleDto } from './dto';
import { AuthedRequest } from '../../middleware/auth.middleware';

@Controller('styles')
export class StylesController {
  constructor(private readonly styles: StylesService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.styles.list(req.merchantId!);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateStyleDto) {
    return this.styles.create(req.merchantId!, dto);
  }

  @Patch(':id')
  update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateStyleDto) {
    return this.styles.update(req.merchantId!, id, dto);
  }

  @Patch(':id/activate')
  activate(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.styles.setActive(req.merchantId!, id, true);
  }

  @Patch(':id/deactivate')
  deactivate(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.styles.setActive(req.merchantId!, id, false);
  }
}
