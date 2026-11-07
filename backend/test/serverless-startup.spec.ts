import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import express from 'express';
import request from 'supertest';
import * as security from '../src/security/http-security';
import handler from '../serverless/handler';

it('closes failed startup, returns a safe retryable response, and recovers on the next request', async () => {
  const init = jest.fn().mockRejectedValueOnce(Object.assign(new Error('private-database-connection'), { code: 'P2022' })).mockResolvedValue(undefined);
  const close = jest.fn().mockResolvedValue(undefined);
  const runtime = express(); runtime.get('/api/health', (_req, res) => res.json({ ok: true }));
  const app = { init, close, setGlobalPrefix: jest.fn(), getHttpAdapter: () => ({ getInstance: () => runtime }) } as unknown as INestApplication;
  const create = jest.spyOn(NestFactory, 'create').mockResolvedValue(app);
  const configure = jest.spyOn(security, 'configureHttpSecurity').mockImplementation(() => {});
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const server = express(); server.use((req, res, next) => { void handler(req, res).catch(next); });
  try {
    const failed = await request(server).get('/api/auth/session').expect(503);
    expect(close).toHaveBeenCalledTimes(1);
    expect(failed.headers['retry-after']).toBe('30');
    expect(failed.headers['cache-control']).toBe('no-store');
    expect(failed.body.requestId).toBeTruthy();
    expect(JSON.stringify(failed.body)).not.toContain('private-database');
    expect(log.mock.calls.flat().join(' ')).not.toContain('private-database');
    expect(log.mock.calls.flat().join(' ')).toContain('code=P2022');
    expect(JSON.stringify(failed.body)).not.toContain('P2022');
    await request(server).get('/api/health').expect(200, { ok: true });
    await request(server).get('/api/health').expect(200, { ok: true });
    expect(create).toHaveBeenCalledTimes(2);
  } finally { create.mockRestore(); configure.mockRestore(); log.mockRestore(); }
});
