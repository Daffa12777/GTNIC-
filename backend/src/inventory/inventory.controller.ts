import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Req, SetMetadata, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { InventoryService } from './inventory.service';
import { AdjustStockDto, CreatePartDto } from './inventory.dto';
@Controller('inventory')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class InventoryController {
  constructor(private readonly inventory: InventoryService, private readonly auth: AuthService) {}
  private supervisor(role: string) { if (role !== 'supervisor') throw new ForbiddenException('Hanya supervisor yang dapat mengubah inventaris.'); }
  @Post() @SetMetadata('roles', ['supervisor'])
  create(@Body() data: CreatePartDto, @Headers('x-role') role: string) { this.supervisor(role); return this.inventory.create(data); }
  @Post(':id/stock') @SetMetadata('roles', ['supervisor'])
  async adjust(@Param('id') id: string, @Body() data: AdjustStockDto, @Req() req: Request, @Headers('x-role') role: string) {
    this.supervisor(role); const user = await this.auth.current(req);
    return this.inventory.adjust(id, data, user?.username ?? 'supervisor-demo');
  }
  @Get(':id/movements')
  history(@Param('id') id: string) { return this.inventory.history(id); }
}
