import 'reflect-metadata';
import { Controller, Get, Headers, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, scryptSync } from 'crypto';
import request from 'supertest';
import { validate } from 'class-validator';
import { AuthModule } from '../src/auth/auth.module';
import { CompleteWorkOrderDto } from '../src/api/complete-work-order.dto';

@Controller('private')
class ProtectedController {
  @Get()
  read(@Headers('x-role') role: string) { return { role }; }
}

describe('Server sessions and request validation', () => {
  let app: INestApplication;
  const password = randomBytes(24).toString('hex');
  const keys = ['AUTH_ENABLED', 'AUTH_TECHNICIAN_USERNAME', 'AUTH_TECHNICIAN_PASSWORD_HASH', 'AUTH_SUPERVISOR_USERNAME', 'AUTH_SUPERVISOR_PASSWORD_HASH'];
  const previous = keys.map((key) => process.env[key]);
  let cookie: string;
  beforeAll(async () => {
    process.env.AUTH_ENABLED = 'true';
    for (const prefix of ['TECHNICIAN', 'SUPERVISOR']) {
      const salt = randomBytes(16).toString('hex');
      process.env[`AUTH_${prefix}_USERNAME`] = prefix.toLowerCase();
      process.env[`AUTH_${prefix}_PASSWORD_HASH`] = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    }
    const module = await Test.createTestingModule({ imports: [AuthModule], controllers: [ProtectedController] }).compile();
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
    cookie = cookies[0].split(';')[0];
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
});
