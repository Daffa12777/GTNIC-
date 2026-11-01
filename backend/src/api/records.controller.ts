import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DbService } from '../db/db.service';
import type { Prisma } from '../generated/prisma/client';
const CASE_GROUPS: Record<string, string[]> = {
  keputusan: ['menunggu_persetujuan'], eskalasi: ['dieskalasi'],
  dijalankan: ['disetujui_dijalankan', 'selesai_otomatis'], selesai: ['selesai'],
};
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
    const base: Prisma.MaintenanceCaseWhereInput = { ...(query.unit ? { pump_id: query.unit } : {}) };
    if (query.q?.trim()) base.OR = ['id', 'pump_id', 'summary'].map((key) => ({ [key]: { contains: query.q!.trim(), mode: 'insensitive' } }));
    const group = query.status?.startsWith('group:') ? CASE_GROUPS[query.status.slice(6)] : undefined;
    const where: Prisma.MaintenanceCaseWhereInput = { ...base, ...(group ? { status: { in: group } } : query.status ? { status: query.status } : {}) };
    const [total, groups, pendingCount] = await Promise.all([
      this.db.client.maintenanceCase.count({ where }),
      this.db.client.maintenanceCase.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.db.client.maintenanceCase.count({ where: { AND: [where, { status: 'menunggu_persetujuan' }] } }),
    ]);
    const select = { id: true, pump_id: true, status: true, fault: true, confidence: true, risk: true, summary: true, created_at: true, mode: true } as const;
    const orderBy = [{ created_at: 'desc' as const }, { id: 'desc' as const }];
    const skip = (query.page - 1) * query.pageSize;
    const pending = skip < pendingCount ? await this.db.client.maintenanceCase.findMany({ where: { AND: [where, { status: 'menunggu_persetujuan' }] }, orderBy, skip, take: Math.min(query.pageSize, pendingCount - skip), select }) : [];
    const remaining = query.pageSize - pending.length;
    const rest = remaining ? await this.db.client.maintenanceCase.findMany({ where: { AND: [where, { OR: [{ status: { not: 'menunggu_persetujuan' } }, { status: null }] }] }, orderBy, skip: Math.max(0, skip - pendingCount), take: remaining, select }) : [];
    const counts = Object.fromEntries(Object.entries(CASE_GROUPS).map(([key, statuses]) => [key, groups.filter((item) => item.status && statuses.includes(item.status)).reduce((sum, item) => sum + item._count._all, 0)]));
    return { items: [...pending, ...rest], total, counts, page: query.page, pageSize: query.pageSize };
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
