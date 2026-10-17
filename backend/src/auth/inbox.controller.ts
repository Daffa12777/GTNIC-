import { Body, Controller, Get, Header, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { DbService } from '../db/db.service';
class ReadInboxDto { @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) through!: number; }
@Controller('inbox')
export class InboxController {
  constructor(private readonly auth: AuthService, private readonly db: DbService) {}
  @Get() @Header('Cache-Control', 'no-store')
  async inbox(@Req() req: Request) {
    const id = await this.auth.accountId(req);
    const user = await this.db.client.user.findUniqueOrThrow({ where: { id } });
    const [notifications, unread, approvals, approvalCount] = await Promise.all([
      this.db.client.notification.findMany({ orderBy: { id: 'desc' }, take: 20 }),
      this.db.client.notification.count({ where: { id: { gt: user.notificationsReadThrough } } }),
      this.db.client.maintenanceCase.findMany({ where: { status: 'menunggu_persetujuan' }, orderBy: { created_at: 'desc' }, take: 5, select: { id: true, pump_id: true, summary: true } }),
      this.db.client.maintenanceCase.count({ where: { status: 'menunggu_persetujuan' } }),
    ]);
    return { unread, approvalCount, approvals, notifications: notifications.map((item) => ({ ...item, id: Number(item.id), read: item.id <= user.notificationsReadThrough })) };
  }
  @Post('read') @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async read(@Req() req: Request, @Body() body: ReadInboxDto) {
    const id = await this.auth.accountId(req);
    const latest = await this.db.client.notification.findFirst({ orderBy: { id: 'desc' } });
    const through = latest && BigInt(body.through) < latest.id ? BigInt(body.through) : latest?.id ?? 0n;
    await this.db.client.user.updateMany({ where: { id, notificationsReadThrough: { lt: through } }, data: { notificationsReadThrough: through } });
    return { ok: true };
  }
}
