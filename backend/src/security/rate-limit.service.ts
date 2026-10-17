import { createHmac } from 'crypto';
import * as ipaddr from 'ipaddr.js';
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';
export interface LimitResult { hits: number; reset_at: number }
export function normalizeRateIp(ip: string): string {
  try {
    const address = ipaddr.process(ip);
    return address.kind() === 'ipv6' ? `${address.toNormalizedString().split(':').slice(0, 4).join(':')}::/64` : address.toString();
  } catch { return 'unknown-peer'; }
}
@Injectable()
export class RateLimitService {
  private nextCleanup = 0;
  private readonly log = new Logger('RateLimit');
  constructor(private readonly db: DbService) {}
  key(scope: string, ip: string): string { return `${scope}:${createHmac('sha256', process.env.JWT_SECRET || 'local-demo-rate-limit').update(normalizeRateIp(ip)).digest('hex')}`; }
  async consume(key: string, windowMs: number, limit: number, now = Date.now()): Promise<LimitResult> {
    const rows = await this.db.q<LimitResult>(`INSERT INTO request_limits (key,hits,reset_at) VALUES ($1,1,$2)
      ON CONFLICT (key) DO UPDATE SET
        hits=CASE WHEN request_limits.reset_at <= $3 THEN 1 ELSE LEAST(request_limits.hits,$4)+1 END,
        reset_at=CASE WHEN request_limits.reset_at <= $3 THEN $2 ELSE request_limits.reset_at END
      RETURNING hits,reset_at`, [key, now + windowMs, now, limit]);
    if (now > this.nextCleanup) {
      this.nextCleanup = now + 60000;
      void this.db.prisma.requestLimit.deleteMany({ where: { reset_at: { lt: now - 86400000 } } }).catch(() => this.log.warn('Pembersihan limiter tertunda.'));
    }
    return rows[0];
  }
}
