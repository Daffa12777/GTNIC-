import 'reflect-metadata';
import { Body, Controller, Get, Post, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString, Length } from 'class-validator';
import type { Request } from 'express';
import request from 'supertest';
import { allowedOrigins, configureHttpSecurity } from '../src/security/http-security';
class Payload { @IsString() @Length(1, 20) message!: string; }
@Controller('check')
class CheckController {
  @Get() get(@Req() req: Request) { return { ok: true, ip: req.ip }; }
  @Post() post(@Body() body: Payload) { return body; }
  @Get('error') error() { throw new Error('secret-database-password'); }
}
describe('HTTP security boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [CheckController] }).compile();
    app = module.createNestApplication({ bodyParser: false }); app.setGlobalPrefix('api');
    configureHttpSecurity(app, { origins: 'http://localhost:5173', production: false, trustProxy: '' }); await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('sets security headers, no-store and a server-generated request ID', async () => {
    const response = await request(app.getHttpServer()).get('/api/check').set('X-Request-Id', 'client-value').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-request-id']).not.toBe('client-value');
  });
  it('uses an exact CORS allowlist and rejects null or foreign origins', async () => {
    const response = await request(app.getHttpServer()).get('/api/check').set('Origin', 'http://localhost:5173').expect(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    for (const origin of ['null', 'https://evil.example', 'http://localhost:5173.evil.example']) await request(app.getHttpServer()).get('/api/check').set('Origin', origin).expect(403);
    await request(app.getHttpServer()).options('/api/check').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-mm-client').expect(204);
    expect(() => allowedOrigins('*')).toThrow(); expect(() => allowedOrigins('https://example.com/path')).toThrow();
  });
  it('rejects unsupported MIME types, compression, missing CSRF headers and unsafe methods', async () => {
    const server = app.getHttpServer();
    for (const type of ['text/plain', 'multipart/form-data', 'application/x-www-form-urlencoded']) await request(server).post('/api/check').set('x-mm-client', 'web').set('Content-Type', type).send('message=hi').expect(415);
    await request(server).post('/api/check').set('x-mm-client', 'web').set('Content-Encoding', 'gzip').send({ message: 'hi' }).expect(415);
    await request(server).post('/api/check').send({ message: 'hi' }).expect(403);
    await request(server).put('/api/check').expect(405);
  });
  it('bounds JSON size and validates request fields without leaking internal errors', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/check').set('x-mm-client', 'web').set('Content-Type', 'application/json').send('{bad').expect(400);
    await request(server).post('/api/check').set('x-mm-client', 'web').send({ message: 'x'.repeat(140000) }).expect(413);
    await request(server).post('/api/check').set('x-mm-client', 'web').send({ message: 'hi', admin: true }).expect(400);
    await request(server).post('/api/check').set('x-mm-client', 'web').send({ message: 'hi' }).expect(201);
    const error = await request(server).get('/api/check/error').expect(500);
    expect(JSON.stringify(error.body)).not.toContain('secret-database-password'); expect(error.body.requestId).toBeTruthy();
  });
  it('ignores spoofed forwarding headers unless a proxy is explicitly trusted', async () => {
    const response = await request(app.getHttpServer()).get('/api/check').set('X-Forwarded-For', '203.0.113.99').expect(200);
    expect(response.body.ip).not.toBe('203.0.113.99');
  });
});
