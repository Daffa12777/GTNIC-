import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { SecurityModule } from '../src/security/security.module';
import { RatePolicy } from '../src/security/rate-policy';
import { normalizeRateIp, RateLimitService } from '../src/security/rate-limit.service';
import { configureHttpSecurity } from '../src/security/http-security';
@Controller('limits')
class LimitedController {
  @Get() @RatePolicy('probe') get() { return { ok: true }; }
}
describe('Shared PostgreSQL rate limiting', () => {
  let app: INestApplication; let db: DbService; let store: RateLimitService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [DbModule, SecurityModule], controllers: [LimitedController] }).compile();
    app = module.createNestApplication({ bodyParser: false }); app.setGlobalPrefix('api');
    configureHttpSecurity(app, { origins: 'http://localhost:5173', trustProxy: '', production: false }); await app.init();
    db = app.get(DbService); store = app.get(RateLimitService);
  });
  afterAll(async () => { await app.close(); });
  afterEach(() => jest.restoreAllMocks());
  it('returns 429 and Retry-After and ignores a spoofed X-Forwarded-For', async () => {
    for (let index = 0; index < 3; index++) await request(app.getHttpServer()).get('/api/limits').set('X-Forwarded-For', `203.0.113.${index}`).expect(200);
    const limited = await request(app.getHttpServer()).get('/api/limits').set('X-Forwarded-For', '198.51.100.1').expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['ratelimit-remaining']).toBe('0');
  });
  it('shares counters across store instances, resets expired windows and uses RLS', async () => {
    const key = randomUUID(); const now = Date.now(); const other = new RateLimitService(db);
    expect((await store.consume(key, 1000, 3, now)).hits).toBe(1);
    expect((await other.consume(key, 1000, 3, now)).hits).toBe(2);
    expect((await store.consume(key, 1000, 3, now + 1000)).hits).toBe(1);
    const table = await db.one<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname='request_limits'");
    expect(table?.relrowsecurity).toBe(true);
  });
  it('normalizes mapped IPv4 and groups IPv6 addresses by /64 without storing raw addresses', () => {
    expect(store.key('login', '::ffff:192.0.2.1')).toBe(store.key('login', '192.0.2.1'));
    expect(normalizeRateIp('2001:db8:1234:abcd::1')).toBe(normalizeRateIp('2001:db8:1234:abcd::99'));
    expect(normalizeRateIp('2001:db8:1234:abcd::1')).not.toBe(normalizeRateIp('2001:db8:1234:abce::1'));
    expect(store.key('login', '192.0.2.1')).not.toContain('192.0.2.1');
  });
  it('fails closed with a temporary 503 when the limiter store is unavailable', async () => {
    jest.spyOn(store, 'consume').mockRejectedValueOnce(new Error('database-secret'));
    const response = await request(app.getHttpServer()).get('/api/limits').expect(503);
    expect(response.headers['retry-after']).toBe('5'); expect(JSON.stringify(response.body)).not.toContain('database-secret');
  });
});
