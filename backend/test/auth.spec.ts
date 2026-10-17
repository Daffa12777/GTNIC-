import 'reflect-metadata';
import { Controller, Get, Headers, INestApplication, SetMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, scryptSync } from 'crypto';
import request from 'supertest';
import { validate } from 'class-validator';
import { AuthModule } from '../src/auth/auth.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CompleteWorkOrderDto } from '../src/api/complete-work-order.dto';

@Controller('private')
class ProtectedController {
  @Get()
  read(@Headers('x-role') role: string) { return { role }; }
  @Get('supervisor')
  @SetMetadata('roles', ['supervisor'])
  supervisor() { return { ok: true }; }
}

describe('Server sessions and request validation', () => {
  let app: INestApplication;
  const password = randomBytes(24).toString('hex');
  const keys = ['AUTH_ENABLED', 'JWT_SECRET', 'AUTH_TECHNICIAN_USERNAME', 'AUTH_TECHNICIAN_PASSWORD_HASH', 'AUTH_SUPERVISOR_USERNAME', 'AUTH_SUPERVISOR_PASSWORD_HASH'];
  const previous = keys.map((key) => process.env[key]);
  let cookie: string;
  const cookiesFrom = (headers: Record<string, unknown>) => {
    const values = headers['set-cookie'] as string[];
    const access = values.filter((value) => value.startsWith('mm_access=')).at(-1)!.split(';')[0];
    const refresh = values.filter((value) => value.startsWith('mm_refresh=')).at(-1)!.split(';')[0];
    return { access, refresh, all: `${access}; ${refresh}` };
  };
  const loginUser = async () => cookiesFrom((await request(app.getHttpServer()).post('/api/auth/login').set('x-mm-client', 'web').send({ username: 'technician', password }).expect(201)).headers);
  beforeAll(async () => {
    process.env.AUTH_ENABLED = 'true';
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    for (const prefix of ['TECHNICIAN', 'SUPERVISOR']) {
      const salt = randomBytes(16).toString('hex');
      process.env[`AUTH_${prefix}_USERNAME`] = prefix.toLowerCase();
      process.env[`AUTH_${prefix}_PASSWORD_HASH`] = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    }
    const module = await Test.createTestingModule({ imports: [DbModule, AuthModule], controllers: [ProtectedController] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  });
  it('rejects a forged role header without a session', async () => {
    await request(app.getHttpServer()).get('/api/private').set('x-role', 'supervisor').expect(401);
  });
  it('requires the custom mutation header and validates login DTO', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'technician', password }).expect(403);
    await request(app.getHttpServer()).post('/api/auth/login').set('x-mm-client', 'web').send({ username: 12, password }).expect(400);
  });
  it('rejects invalid passwords', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').set('x-mm-client', 'web').send({ username: 'technician', password: 'wrong' }).expect(401);
  });
  it('uses an HttpOnly cookie and server role despite a forged client role', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').set('x-mm-client', 'web').send({ username: 'technician', password }).expect(201);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    cookie = cookies.filter((value) => value.startsWith('mm_access=')).at(-1)!.split(';')[0];
    const response = await request(app.getHttpServer()).get('/api/private').set('Cookie', cookie).set('x-role', 'supervisor').expect(200);
    expect(response.body.role).toBe('teknisi');
  });
  it('revokes a session on logout', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).set('x-mm-client', 'web').expect(201);
    await request(app.getHttpServer()).get('/api/private').set('Cookie', cookie).expect(401);
  });
  it('rejects blank completion reports and nonfinite durations', async () => {
    const report = Object.assign(new CompleteWorkOrderDto(), { root_cause: '  ', action: '', duration_min: Infinity });
    expect((await validate(report)).length).toBe(3);
    Object.assign(report, { root_cause: 'Seal aus', action: 'Ganti seal', duration_min: 30 });
    expect(await validate(report)).toHaveLength(0);
  });
  it('preserves login across service recreation and enforces the role guard', async () => {
    const session = await loginUser();
    const restarted = new AuthService(app.get(DbService));
    expect(await restarted.current({ headers: { cookie: session.access } } as Request)).toEqual({ username: 'technician', role: 'teknisi' });
    await request(app.getHttpServer()).get('/api/private/supervisor').set('Cookie', session.access).set('x-role', 'supervisor').expect(403);
  });
  it('rejects expired access JWT but allows renewal with a valid refresh cookie', async () => {
    const session = await loginUser();
    const jwt = new JwtService();
    const claims = jwt.decode<{ sid: string; sub: string }>(session.access.slice('mm_access='.length));
    const expired = jwt.sign({ sid: claims.sid, typ: 'access' }, { secret: process.env.JWT_SECRET, subject: claims.sub, issuer: 'manualmechanic', audience: 'manualmechanic-web', expiresIn: -1 });
    await request(app.getHttpServer()).get('/api/private').set('Cookie', `mm_access=${expired}`).expect(401);
    const renewed = await request(app.getHttpServer()).post('/api/auth/refresh').set('x-mm-client', 'web').set('Cookie', session.refresh).expect(201);
    const rotated = cookiesFrom(renewed.headers);
    expect(rotated.refresh).not.toBe(session.refresh);
    await request(app.getHttpServer()).get('/api/private').set('Cookie', rotated.access).expect(200);
  });
  it('revokes the token family when a consumed refresh token is replayed', async () => {
    const session = await loginUser();
    const renewed = await request(app.getHttpServer()).post('/api/auth/refresh').set('x-mm-client', 'web').set('Cookie', session.refresh).expect(201);
    const rotated = cookiesFrom(renewed.headers);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('x-mm-client', 'web').set('Cookie', session.refresh).expect(401);
    await request(app.getHttpServer()).get('/api/private').set('Cookie', rotated.access).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('x-mm-client', 'web').set('Cookie', rotated.refresh).expect(401);
  });
  it('stores only refresh hashes and rejects foreign-origin mutations', async () => {
    const session = await loginUser();
    const value = session.refresh.slice('mm_refresh='.length);
    const row = await app.get(DbService).client.refreshSession.findUniqueOrThrow({ where: { id: value.split('.')[0] } });
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenHash).not.toContain(value);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Origin', 'https://untrusted.example').set('x-mm-client', 'web').set('Cookie', session.refresh).expect(403);
  });
});
