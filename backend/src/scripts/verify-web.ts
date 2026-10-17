import 'reflect-metadata';
import { randomBytes, randomUUID, scryptSync } from 'crypto';
import { DbService } from '../db/db.service';
import { CONFIG } from '../config';
import { RateLimitService } from '../security/rate-limit.service';

/** Local HTTP smoke test using disposable fixtures; never prints passwords or cookies. */
async function main() {
  const db = new DbService();
  const marker = `web-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(24).toString('hex');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  const accountIds: string[] = [];
  const cookies = new Map<string, string>();
  let notificationId: bigint | undefined;
  const http = async <T>(path: string, role: string, body?: unknown, expected = 200): Promise<T> => {
    const response = await fetch(`http://127.0.0.1:8000/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-mm-client': 'web', Cookie: cookies.get(role) ?? '' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}`);
    return await response.json() as T;
  };
  try {
    const origin = CONFIG.FRONTEND_ORIGIN.split(',')[0].trim();
    const health = await fetch('http://127.0.0.1:8000/api/health', { headers: { Origin: origin }, signal: AbortSignal.timeout(10000) });
    if (!health.ok || health.headers.get('x-content-type-options') !== 'nosniff' || !health.headers.has('ratelimit-limit') || health.headers.get('access-control-allow-origin') !== origin) throw new Error('HTTP security headers failed');
    const foreign = await fetch('http://127.0.0.1:8000/api/health', { headers: { Origin: 'https://foreign.invalid' }, signal: AbortSignal.timeout(10000) });
    if (foreign.status !== 403) throw new Error('CORS boundary failed');
    const mime = await fetch('http://127.0.0.1:8000/api/auth/login', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-mm-client': 'web' }, body: 'test', signal: AbortSignal.timeout(10000) });
    if (mime.status !== 415) throw new Error('MIME boundary failed');
    const limiter = new RateLimitService(db);
    await Promise.all(Array.from({ length: 20 }, () => limiter.consume(marker, 60000, 100)));
    const counter = await db.client.requestLimit.findUniqueOrThrow({ where: { key: marker } });
    if (counter.hits !== 20) throw new Error('Shared limiter concurrency failed');
    for (const role of ['supervisor', 'teknisi']) {
      const username = `${marker}-${role}`;
      const user = await db.client.user.create({ data: { username, name: 'Web verification', passwordHash, role } }); accountIds.push(user.id);
      const response = await fetch('http://127.0.0.1:8000/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mm-client': 'web' }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Fixture login failed (${response.status})`);
      const values = new Map<string, string>();
      for (const value of response.headers.getSetCookie()) { const cookie = value.split(';')[0]; values.set(cookie.slice(0, cookie.indexOf('=')), cookie); }
      cookies.set(role, [...values.values()].join('; '));
    }
    const part = { part_id: marker, name: marker, stock: 2, min_stock: 1, location: 'Disposable test' };
    await http('/inventory', 'teknisi', part, 403);
    await http('/auto', 'teknisi', { enabled: false }, 403);
    await http('/scenario/start', 'teknisi', {}, 403);
    await http('/inventory', 'supervisor', part, 201);
    const adjustment = { operationId: randomUUID(), delta: 3, expectedStock: 2, reason: 'Disposable smoke test' };
    for (let count = 0; count < 2; count++) await http(`/inventory/${marker}/stock`, 'supervisor', adjustment, 201);
    const stock = await db.client.inventory.findUniqueOrThrow({ where: { part_id: marker } });
    if (stock.stock !== 5) throw new Error('Stock idempotency failed');
    await db.client.maintenanceCase.create({ data: { id: marker, summary: marker, status: 'selesai', created_at: 1 } });
    await db.client.workOrder.create({ data: { id: marker, title: marker, status: 'selesai', created_at: 1 } });
    for (const path of ['cases', 'work-orders']) {
      const page = await http<{ total: number }>(`/records/${path}?q=${marker}&pageSize=10`, 'supervisor');
      if (page.total !== 1) throw new Error(`Pagination ${path} failed`);
    }
    const note = await db.client.notification.create({ data: { recipient: 'Disposable test', message: marker, status: 'disimulasikan' } }); notificationId = note.id;
    await http('/inbox/read', 'supervisor', { through: Number(note.id) }, 201);
    const other = await db.client.user.findUniqueOrThrow({ where: { id: accountIds[1] } });
    if (other.notificationsReadThrough !== 0n) throw new Error('Inbox isolation failed');
    const services = await http<{ database: { ok: boolean }; ml: { ok: boolean }; llm: { state: string } }>('/services', 'supervisor');
    if (!services.database.ok) throw new Error('Database health failed');
    await http('/profile', 'supervisor');
    console.log(JSON.stringify({ cors: 'ok', mime: 'ok', headers: 'ok', sharedLimiterConcurrency: 'ok', inventory: 'ok', roleGuard: 'ok', stockIdempotency: 'ok', pagination: 'ok', inboxIsolation: 'ok', database: services.database.ok, ml: services.ml.ok, gemini: services.llm.state }));
  } finally {
    await db.client.stockMovement.deleteMany({ where: { partId: marker } });
    await db.client.inventory.deleteMany({ where: { part_id: marker } });
    await db.client.workOrder.deleteMany({ where: { id: marker } });
    await db.client.maintenanceCase.deleteMany({ where: { id: marker } });
    if (notificationId) await db.client.notification.deleteMany({ where: { id: notificationId } });
    await db.client.user.deleteMany({ where: { id: { in: accountIds } } });
    await db.client.requestLimit.deleteMany({ where: { key: marker } });
    await db.onModuleDestroy();
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; });
