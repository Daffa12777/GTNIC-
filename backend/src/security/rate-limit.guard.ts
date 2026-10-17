import { CanActivate, ExecutionContext, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_POLICY, type RatePolicyName } from './rate-policy';
import { RateLimitService } from './rate-limit.service';
function configuredLimit(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) throw new Error(`${name} wajib berupa bilangan bulat antara 1 dan 100000.`);
  return value;
}
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly globalMax = configuredLimit('RATE_LIMIT_MAX', 600);
  private readonly policies: Record<RatePolicyName, { max: number; window: number }> = {
    login: { max: configuredLimit('RATE_LOGIN_MAX', 20), window: 900000 },
    refresh: { max: 60, window: 60000 },
    ai: { max: configuredLimit('RATE_AI_MAX', 20), window: 60000 },
    sensitive: { max: configuredLimit('RATE_SENSITIVE_MAX', 5), window: 900000 },
    probe: { max: 3, window: 60000 },
  };
  constructor(private readonly store: RateLimitService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const policy = this.reflector.getAllAndOverride<RatePolicyName>(RATE_POLICY, [context.getHandler(), context.getClass()]);
    const limits = [{ scope: 'global', max: this.globalMax, window: 60000 }, ...(policy ? [{ scope: policy, ...this.policies[policy] }] : [])];
    for (const limit of limits) {
      let result: { hits: number; reset_at: number };
      try { result = await this.store.consume(this.store.key(limit.scope, ip), limit.window, limit.max); }
      catch { res.setHeader('Retry-After', '5'); throw new ServiceUnavailableException('Proteksi permintaan sementara tidak tersedia. Coba lagi nanti.'); }
      const seconds = Math.max(1, Math.ceil((result.reset_at - Date.now()) / 1000));
      res.setHeader('RateLimit-Limit', String(limit.max)); res.setHeader('RateLimit-Remaining', String(Math.max(0, limit.max - result.hits))); res.setHeader('RateLimit-Reset', String(seconds));
      if (result.hits > limit.max) { res.setHeader('Retry-After', String(seconds)); throw new HttpException({ message: `Terlalu banyak permintaan. Tunggu ${seconds} detik sebelum mencoba lagi.`, retryAfter: seconds }, 429); }
    }
    return true;
  }
}
