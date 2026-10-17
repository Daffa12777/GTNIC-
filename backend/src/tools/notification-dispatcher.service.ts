import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CONFIG } from '../config';

/** Durable outbox: only committed notifications are delivered outside database transactions. */
@Injectable()
export class NotificationDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private readonly log = new Logger('NotificationOutbox');
  constructor(private readonly db: DbService) {}
  onApplicationBootstrap() {
    if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) this.timer = setInterval(() => { void this.deliver().catch((error: unknown) => this.log.error(error instanceof Error ? error.message : 'Pengiriman gagal')); }, 5000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async deliver() {
    if (this.busy) return;
    this.busy = true;
    try {
      const message = await this.db.transaction(async () => {
        const rows = await this.db.q<{ id: bigint }>(`SELECT id FROM notifications WHERE channel='telegram' AND attempts<3 AND (status='diantrekan' OR (status='mengirim' AND "claimedAt" < NOW()-INTERVAL '1 minute')) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
        if (!rows[0]) return null;
        return this.db.client.notification.update({ where: { id: rows[0].id }, data: { status: 'mengirim', claimedAt: new Date(), attempts: { increment: 1 } } });
      });
      if (!message) return;
      try {
        const response = await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: `[${message.recipient}] ${message.message}` }), signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
        await this.db.client.notification.update({ where: { id: message.id }, data: { status: 'terkirim', detail: 'Terkirim melalui Telegram Bot API.' } });
      } catch (error: unknown) {
        await this.db.client.notification.update({ where: { id: message.id }, data: { status: message.attempts >= 3 ? 'gagal' : 'diantrekan', detail: error instanceof Error ? error.message : 'Koneksi gagal' } });
      }
    } finally { this.busy = false; }
  }
}
