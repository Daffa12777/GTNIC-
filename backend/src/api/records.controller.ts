import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DbService } from '../db/db.service';
import type { Prisma } from '../generated/prisma/client';
class RecordsQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(5) @Max(50) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @MaxLength(80) status?: string;
  @IsOptional() @IsString() @MaxLength(20) priority?: string;
  @IsOptional() @IsString() @MaxLength(80) unit?: string;
  @IsOptional() @IsString() @MaxLength(160) technician?: string;
}
@Controller('records')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class RecordsController {
  constructor(private readonly db: DbService) {}
  @Get('cases')
  async cases(@Query() query: RecordsQuery) {
    const where: Prisma.MaintenanceCaseWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.unit ? { pump_id: query.unit } : {}) };
    if (query.q?.trim()) where.OR = ['id', 'pump_id', 'summary'].map((key) => ({ [key]: { contains: query.q!.trim(), mode: 'insensitive' } }));
    const [total, items] = await Promise.all([
      this.db.client.maintenanceCase.count({ where }),
      this.db.client.maintenanceCase.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, pump_id: true, status: true, fault: true, confidence: true, risk: true, summary: true, created_at: true, mode: true } }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  @Get('work-orders')
  async workOrders(@Query() query: RecordsQuery) {
    const where: Prisma.WorkOrderWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.unit ? { pump_id: query.unit } : {}), ...(query.priority ? { priority: query.priority } : {}) };
    if (query.technician) where.technician_id = query.technician === 'unassigned' ? null : query.technician;
    if (query.q?.trim()) {
      const contains = { contains: query.q.trim(), mode: 'insensitive' as const };
      where.OR = [{ id: contains }, { title: contains }, { pump_id: contains }, { technician: { name: contains } }];
    }
    const [total, items, technicians, units] = await Promise.all([
      this.db.client.workOrder.count({ where }),
      this.db.client.workOrder.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { technician: { select: { name: true } } } }),
      this.db.client.technician.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.client.pump.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
    ]);
    return { items: items.map((item) => ({ ...item, technician: item.technician?.name ?? null })), total, page: query.page, pageSize: query.pageSize, technicians, units: units.map((item) => item.id) };
  }
}
